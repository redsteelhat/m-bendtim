import "dotenv/config";
import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import type { Sequelize } from "sequelize";
import type { UserRole } from "../models/User";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIfTestDb = testDatabaseUrl ? describe : describe.skip;

type TestModules = {
  app: Express;
  sequelize: Sequelize;
  User: typeof import("../models/User").User;
  Machine: typeof import("../models/Machine").Machine;
  StockItem: typeof import("../models/StockItem").StockItem;
  GoodsReceiptLine: typeof import("../models/GoodsReceiptLine").GoodsReceiptLine;
  Shipment: typeof import("../models/Shipment").Shipment;
  AuditLog: typeof import("../models/AuditLog").AuditLog;
  StockMovement: typeof import("../models/StockMovement").StockMovement;
};

let modules: TestModules;
let adminToken = "";
let operatorToken = "";
let viewerToken = "";

runIfTestDb("critical API business flows", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = testDatabaseUrl!;
    process.env.JWT_SECRET = "test-jwt-secret-with-more-than-32-characters";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.DB_SSL = "false";

    const [{ createApp }, { sequelize }, modelIndex] = await Promise.all([
      import("../app"),
      import("../db"),
      import("../models"),
    ]);

    modules = {
      app: createApp(),
      sequelize,
      User: modelIndex.User,
      Machine: modelIndex.Machine,
      StockItem: modelIndex.StockItem,
      GoodsReceiptLine: modelIndex.GoodsReceiptLine,
      Shipment: modelIndex.Shipment,
      AuditLog: modelIndex.AuditLog,
      StockMovement: modelIndex.StockMovement,
    };

    await modules.sequelize.authenticate();
  });

  beforeEach(async () => {
    await modules.sequelize.sync({ force: true });
    await createUser("admin", "admin@example.com");
    await createUser("operator", "operator@example.com");
    await createUser("viewer", "viewer@example.com");
    adminToken = await login("admin@example.com");
    operatorToken = await login("operator@example.com");
    viewerToken = await login("viewer@example.com");
  });

  afterAll(async () => {
    if (modules?.sequelize) await modules.sequelize.close();
  });

  describe("auth and roles", () => {
    it("logs in with valid credentials and rejects invalid credentials", async () => {
      const ok = await request(modules.app)
        .post("/api/auth/login")
        .send({ email: "admin@example.com", password: "Password123!" });
      expect(ok.status).toBe(200);
      expect(ok.body.token).toEqual(expect.any(String));

      const fail = await request(modules.app)
        .post("/api/auth/login")
        .send({ email: "admin@example.com", password: "wrong-password" });
      expect(fail.status).toBe(401);
    });

    it("rejects protected endpoints without token", async () => {
      const res = await request(modules.app).get("/api/stock");
      expect(res.status).toBe(401);
    });

    it("enforces role permissions and protects the last admin", async () => {
      const viewerCreateStock = await request(modules.app)
        .post("/api/stock")
        .set(auth(viewerToken))
        .send({ sku: "VIEW-1", name: "Viewer item", quantity: 1 });
      expect(viewerCreateStock.status).toBe(403);

      const operatorCreateUser = await request(modules.app)
        .post("/api/users")
        .set(auth(operatorToken))
        .send({
          email: "blocked@example.com",
          password: "Password123!",
          name: "Blocked User",
          role: "viewer",
        });
      expect(operatorCreateUser.status).toBe(403);

      const adminCreateUser = await request(modules.app)
        .post("/api/users")
        .set(auth(adminToken))
        .send({
          email: "created@example.com",
          password: "Password123!",
          name: "Created User",
          role: "viewer",
        });
      expect(adminCreateUser.status).toBe(201);

      const admin = await modules.User.findOne({ where: { email: "admin@example.com" } });
      expect(admin).not.toBeNull();
      const deleteLastAdmin = await request(modules.app)
        .delete(`/api/users/${admin!.id}`)
        .set(auth(adminToken));
      expect(deleteLastAdmin.status).toBe(400);
    });
  });

  describe("stock", () => {
    it("creates and updates stock, allows duplicate SKU on same machine, rejects negative quantity, and writes movement", async () => {
      const machine = await createMachine("M-1");
      const first = await createStock("SKU-DUP", "Profil A", 1);
      const second = await createStock("SKU-DUP", "Profil A", 1);

      const assignFirst = await request(modules.app)
        .patch(`/api/stock/${first.id}`)
        .set(auth(operatorToken))
        .send({ machineId: machine.id, processStatus: "isleniyor" });
      expect(assignFirst.status).toBe(200);

      const assignSecond = await request(modules.app)
        .patch(`/api/stock/${second.id}`)
        .set(auth(operatorToken))
        .send({ machineId: machine.id, processStatus: "isleniyor" });
      expect(assignSecond.status).toBe(200);

      const negative = await request(modules.app)
        .post("/api/stock")
        .set(auth(operatorToken))
        .send({ sku: "NEG-1", name: "Negative", quantity: -1 });
      expect(negative.status).toBe(400);

      const movements = await request(modules.app)
        .get(`/api/stock/${first.id}/movements`)
        .set(auth(adminToken));
      expect(movements.status).toBe(200);
      expect(movements.body.some((m: { type: string }) => m.type === "machine_assignment" || m.type === "manual_update")).toBe(true);
    });
  });

  describe("mal kabul", () => {
    it("rejects non-PDF and oversized PDF uploads", async () => {
      const nonPdf = await request(modules.app)
        .post("/api/mal-kabul/import/pdf/parse")
        .set(auth(operatorToken))
        .attach("file", Buffer.from("not a pdf"), {
          filename: "irsaliye.txt",
          contentType: "text/plain",
        });
      expect(nonPdf.status).toBe(400);

      const oversized = await request(modules.app)
        .post("/api/mal-kabul/import/pdf/parse")
        .set(auth(operatorToken))
        .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1), {
          filename: "large.pdf",
          contentType: "application/pdf",
        });
      expect(oversized.status).toBe(413);
    });

    it("creates stock and cancels untouched goods receipt lines", async () => {
      const created = await request(modules.app)
        .post("/api/mal-kabul/batch")
        .set(auth(operatorToken))
        .send({
          irsaliyeNo: "IRS-001",
          lines: [{ materialCode: "MK-1", productName: "Mal Kabul Ürün", quantity: 2 }],
        });
      expect(created.status).toBe(201);
      expect(await modules.StockItem.count({ where: { sku: "MK-1" } })).toBe(2);

      const lineId = created.body.lines[0].id;
      const cancelled = await request(modules.app)
        .patch(`/api/mal-kabul/${lineId}/cancel`)
        .set(auth(operatorToken))
        .send({ reason: "Yanlış giriş" });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.isCancelled).toBe(true);
      expect(await modules.StockItem.count({ where: { goodsReceiptLineId: lineId } })).toBe(0);
    });

    it("creates manual goods receipt stock without product name", async () => {
      const created = await request(modules.app)
        .post("/api/mal-kabul/batch")
        .set(auth(operatorToken))
        .send({
          irsaliyeNo: "IRS-OPTIONAL-NAME",
          lines: [{ materialCode: "MK-NAMELESS", productName: "", quantity: 1 }],
        });

      expect(created.status).toBe(201);
      expect(created.body.lines[0].materialDescription).toBe("MK-NAMELESS");

      const stock = await modules.StockItem.findOne({ where: { sku: "MK-NAMELESS" } });
      expect(stock).not.toBeNull();
      expect(stock!.name).toBe("MK-NAMELESS");
    });

    it("blocks cancellation when related stock has progressed", async () => {
      const created = await request(modules.app)
        .post("/api/mal-kabul/batch")
        .set(auth(operatorToken))
        .send({
          irsaliyeNo: "IRS-002",
          lines: [{ materialCode: "MK-2", productName: "İşlemli Ürün", quantity: 1 }],
        });
      expect(created.status).toBe(201);
      const lineId = created.body.lines[0].id;
      const stock = await modules.StockItem.findOne({ where: { goodsReceiptLineId: lineId } });
      expect(stock).not.toBeNull();
      await stock!.update({ processStatus: "isleniyor" });

      const cancelled = await request(modules.app)
        .patch(`/api/mal-kabul/${lineId}/cancel`)
        .set(auth(operatorToken))
        .send({ reason: "İptal denemesi" });
      expect(cancelled.status).toBe(409);
    });

    it("confirms parsed PDF import, creates stock, and rejects duplicate document numbers", async () => {
      const payload = {
        documentNo: "MBN2026000000475",
        documentDate: "2026-05-04",
        sourceFileName: "irsaliye.pdf",
        sourceFileSha256: "a".repeat(64),
        warnings: [],
        lines: [
          {
            rowNo: 1,
            sku: "30.02.00.03468-OP1",
            name: "C1050 Ø35x156mm",
            quantity: 2,
            unit: "Adet",
          },
        ],
      };

      const confirmed = await request(modules.app)
        .post("/api/mal-kabul/import/pdf/confirm")
        .set(auth(operatorToken))
        .send(payload);
      expect(confirmed.status).toBe(201);
      expect(await modules.GoodsReceiptLine.count({ where: { irsaliyeNo: payload.documentNo } })).toBe(1);
      expect(await modules.StockItem.count({ where: { sku: payload.lines[0].sku } })).toBe(2);

      const duplicate = await request(modules.app)
        .post("/api/mal-kabul/import/pdf/confirm")
        .set(auth(operatorToken))
        .send(payload);
      expect(duplicate.status).toBe(409);
    });
  });

  describe("shipments", () => {
    it("ships completed stock, rejects incomplete/already shipped stock, and cancellation writes audit and movement", async () => {
      const completed = await createStock("SHIP-1", "Sevk Hazır", 1);
      await completed.update({ processStatus: "tamamlandi" });
      const waiting = await createStock("SHIP-2", "Bekleyen", 1);

      const incomplete = await request(modules.app)
        .post("/api/shipments")
        .set(auth(operatorToken))
        .send({ destination: "Ankara", stockItemIds: [waiting.id] });
      expect(incomplete.status).toBe(400);

      const shipped = await request(modules.app)
        .post("/api/shipments")
        .set(auth(operatorToken))
        .send({ destination: "Ankara", stockItemIds: [completed.id], shippedAt: "2026-05-06" });
      expect(shipped.status).toBe(201);
      expect(shipped.body.shipmentNo).toMatch(/^SVK-2026-\d{6}$/);

      const doubleShip = await request(modules.app)
        .post("/api/shipments")
        .set(auth(operatorToken))
        .send({ destination: "İstanbul", stockItemIds: [completed.id] });
      expect(doubleShip.status).toBe(409);

      const cancelled = await request(modules.app)
        .patch(`/api/shipments/${shipped.body.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: "Sevk iptal testi" });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe("iptal");

      const auditCount = await modules.AuditLog.count({ where: { action: "shipment.cancel" } });
      const unshipCount = await modules.StockMovement.count({ where: { type: "unship" } });
      expect(auditCount).toBe(1);
      expect(unshipCount).toBe(1);
    });
  });

  describe("reports", () => {
    it("applies date filters and excludes cancelled records by default", async () => {
      await request(modules.app)
        .post("/api/mal-kabul/batch")
        .set(auth(operatorToken))
        .send({
          irsaliyeNo: "RPR-001",
          lines: [{ materialCode: "RPR-A", productName: "Rapor Aktif", quantity: 1 }],
        });
      const cancelCandidate = await request(modules.app)
        .post("/api/mal-kabul/batch")
        .set(auth(operatorToken))
        .send({
          irsaliyeNo: "RPR-002",
          lines: [{ materialCode: "RPR-C", productName: "Rapor İptal", quantity: 1 }],
        });
      await request(modules.app)
        .patch(`/api/mal-kabul/${cancelCandidate.body.lines[0].id}/cancel`)
        .set(auth(operatorToken))
        .send({ reason: "Rapor dışı" });
      await modules.GoodsReceiptLine.update(
        { irsaliyeTarihi: "2026-05-06" as unknown as Date },
        { where: {} }
      );

      const report = await request(modules.app)
        .get("/api/reports/mal-kabul?from=2026-05-06&to=2026-05-06")
        .set(auth(viewerToken));
      expect(report.status).toBe(200);
      expect(report.body.rows).toHaveLength(1);
      expect(report.body.rows[0].materialCode).toBe("RPR-A");

      const withCancelled = await request(modules.app)
        .get("/api/reports/mal-kabul?from=2026-05-06&to=2026-05-06&includeCancelled=true")
        .set(auth(viewerToken));
      expect(withCancelled.status).toBe(200);
      expect(withCancelled.body.rows).toHaveLength(2);
    });
  });
});

async function createUser(role: UserRole, email: string) {
  return modules.User.create({
    email,
    name: `${role} user`,
    role,
    passwordHash: await bcrypt.hash("Password123!", 10),
  });
}

async function login(email: string) {
  const res = await request(modules.app)
    .post("/api/auth/login")
    .send({ email, password: "Password123!" });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createMachine(code: string) {
  const res = await request(modules.app)
    .post("/api/machines")
    .set(auth(adminToken))
    .send({ code, name: `${code} seri` });
  expect(res.status).toBe(201);
  return res.body as { id: number; code: string; name: string };
}

async function createStock(sku: string, name: string, quantity: number) {
  const res = await request(modules.app)
    .post("/api/stock")
    .set(auth(operatorToken))
    .send({ sku, name, quantity });
  expect(res.status).toBe(201);
  return modules.StockItem.findByPk(res.body.id).then((row) => {
    expect(row).not.toBeNull();
    return row!;
  });
}
