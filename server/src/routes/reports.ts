import { Router, Response } from "express";
import { Op, WhereOptions } from "sequelize";
import { GoodsReceiptLine } from "../models/GoodsReceiptLine";
import { StockItem } from "../models/StockItem";
import { Machine } from "../models/Machine";
import { Shipment } from "../models/Shipment";
import { ShipmentItem } from "../models/ShipmentItem";
import { StockMovement } from "../models/StockMovement";
import { AuditLog } from "../models/AuditLog";
import { User } from "../models/User";
import { requireAuth, attachUser, AuthRequest, requirePermission } from "../middleware/auth";

type AnyWhere = WhereOptions<Record<string, unknown>>;
type StockWithMachine = InstanceType<typeof StockItem> & { machine?: Machine | null };

const router = Router();
router.use(requireAuth, attachUser);

const includeMachine = {
  model: Machine,
  as: "machine",
  attributes: ["id", "code", "name"],
};

const includeUser = (as: string) => ({
  model: User,
  as,
  attributes: ["id", "name", "email", "role"],
  required: false,
});

function dateOnlyToStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function boolQuery(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (String(value) === "true") return true;
  if (String(value) === "false") return false;
  return undefined;
}

function paging(req: AuthRequest) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  return { page, limit, offset: (page - 1) * limit };
}

function dateRange(req: AuthRequest, field: string): AnyWhere {
  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();
  const range: Record<symbol, string> = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) range[Op.gte] = from;
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) range[Op.lte] = to;
  return Object.getOwnPropertySymbols(range).length > 0 ? ({ [field]: range } as AnyWhere) : {};
}

function createdAtRange(req: AuthRequest): AnyWhere {
  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();
  const range: Record<symbol, Date> = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) range[Op.gte] = new Date(`${from}T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) range[Op.lte] = new Date(`${to}T23:59:59.999Z`);
  return Object.getOwnPropertySymbols(range).length > 0 ? ({ createdAt: range } as AnyWhere) : {};
}

function textFilter(req: AuthRequest, source: "stock" | "malKabul"): AnyWhere {
  const sku = String(req.query.sku ?? "").trim();
  const name = String(req.query.name ?? "").trim();
  const where: AnyWhere = {};
  if (sku) {
    Object.assign(where, {
      [source === "stock" ? "sku" : "materialCode"]: { [Op.iLike]: `%${sku}%` },
    });
  }
  if (name) {
    Object.assign(where, {
      [source === "stock" ? "name" : "materialDescription"]: { [Op.iLike]: `%${name}%` },
    });
  }
  return where;
}

function stockWhere(req: AuthRequest): AnyWhere {
  const where: AnyWhere = { ...textFilter(req, "stock") };
  const machineId = Number(req.query.machineId);
  const processStatus = String(req.query.processStatus ?? "").trim();
  const isShipped = boolQuery(req.query.isShipped);
  if (Number.isInteger(machineId) && machineId > 0) Object.assign(where, { machineId });
  if (["bekliyor", "isleniyor", "tamamlandi"].includes(processStatus)) {
    Object.assign(where, { processStatus });
  }
  if (isShipped !== undefined) Object.assign(where, { isShipped });
  return where;
}

async function shipmentEntries(req: AuthRequest) {
  const includeCancelled = boolQuery(req.query.includeCancelled) === true;
  const shipmentWhere: AnyWhere = {
    ...dateRange(req, "shippedAt"),
    ...(includeCancelled ? {} : { status: { [Op.ne]: "iptal" } }),
  };
  const status = String(req.query.shipmentStatus ?? "").trim();
  if (["hazirlik", "sevk_edildi", "iptal"].includes(status)) Object.assign(shipmentWhere, { status });
  const destination = String(req.query.name ?? "").trim();
  if (destination) Object.assign(shipmentWhere, { destination: { [Op.iLike]: `%${destination}%` } });

  const stockFilters = stockWhere(req);
  const shipments = await Shipment.findAll({
    where: shipmentWhere,
    include: [
      includeUser("createdByUser"),
      {
        model: ShipmentItem,
        as: "items",
        include: [
          {
            model: StockItem,
            as: "stockItem",
            where: Object.keys(stockFilters).length > 0 ? stockFilters : undefined,
            required: Object.keys(stockFilters).length > 0,
            include: [includeMachine],
          },
        ],
      },
    ],
    order: [
      ["shippedAt", "DESC"],
      ["id", "DESC"],
    ],
  });

  return shipments.flatMap((shipment) => {
    const plain = shipment.get({ plain: true }) as {
      id: number;
      shipmentNo: string;
      destination: string;
      shippedAt: unknown;
      status: string;
      createdByUser?: { id: number; name: string; email: string; role: string } | null;
      items?: Array<{ id: number; stockItemId: number; stockItem?: StockWithMachine | null }>;
    };
    return (plain.items ?? [])
      .filter((item) => item.stockItem)
      .map((item) => ({
        shipmentId: plain.id,
        shipmentNo: plain.shipmentNo,
        status: plain.status,
        destination: plain.destination,
        shippedAt: dateOnlyToStr(plain.shippedAt),
        createdByUser: plain.createdByUser ?? null,
        stock: item.stockItem as StockWithMachine,
      }));
  });
}

function paged<T>(rows: T[], req: AuthRequest) {
  const { page, limit, offset } = paging(req);
  return { rows: rows.slice(offset, offset + limit), total: rows.length, page, limit };
}

router.get("/overview", requirePermission("reports.read"), async (req: AuthRequest, res: Response) => {
  const includeCancelled = boolQuery(req.query.includeCancelled) === true;
  const malKabulWhere: AnyWhere = {
    ...dateRange(req, "irsaliyeTarihi"),
    ...textFilter(req, "malKabul"),
    ...(includeCancelled ? {} : { isCancelled: false }),
  };
  const stockFilters = stockWhere(req);
  const [malKabulCount, malKabulQty, stockCount, stockQty, machineCount, entries] = await Promise.all([
    GoodsReceiptLine.count({ where: malKabulWhere }),
    GoodsReceiptLine.sum("quantity", { where: malKabulWhere }),
    StockItem.count({ where: stockFilters }),
    StockItem.sum("quantity", { where: stockFilters }),
    Machine.count(),
    shipmentEntries(req),
  ]);
  const sevkQty = entries.reduce((sum, entry) => sum + (Number(entry.stock.quantity) || 0), 0);
  res.json({
    malKabul: { kalem: malKabulCount, adet: Number(malKabulQty) || 0 },
    stock: { kalem: stockCount, adet: Number(stockQty) || 0 },
    shipments: { kalem: entries.length, adet: sevkQty },
    machines: { total: machineCount },
  });
});

router.get("/mal-kabul", requirePermission("reports.read"), async (req: AuthRequest, res: Response) => {
  const includeCancelled = boolQuery(req.query.includeCancelled) === true;
  const { page, limit, offset } = paging(req);
  const where: AnyWhere = {
    ...dateRange(req, "irsaliyeTarihi"),
    ...textFilter(req, "malKabul"),
    ...(includeCancelled ? {} : { isCancelled: false }),
  };
  const { rows, count } = await GoodsReceiptLine.findAndCountAll({
    where,
    order: [
      ["irsaliyeTarihi", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset,
  });
  res.json({
    rows: rows.map((r) => ({
      id: r.id,
      irsaliyeNo: r.irsaliyeNo,
      irsaliyeTarihi: dateOnlyToStr(r.irsaliyeTarihi),
      materialCode: r.materialCode,
      materialDescription: r.materialDescription,
      quantity: r.quantity,
      isCancelled: r.isCancelled,
      cancelReason: r.cancelReason,
    })),
    total: count,
    page,
    limit,
  });
});

router.get("/shipments", requirePermission("reports.read"), async (req: AuthRequest, res: Response) => {
  const entries = await shipmentEntries(req);
  const result = paged(
    entries.map((entry) => {
      const stock = entry.stock;
      const machine = stock.machine;
      return {
        shipmentId: entry.shipmentId,
        shipmentNo: entry.shipmentNo,
        shipmentStatus: entry.status,
        shippedAt: entry.shippedAt,
        destination: entry.destination,
        stockItemId: stock.id,
        sku: stock.sku,
        name: stock.name,
        quantity: stock.quantity,
        unit: stock.unit,
        machine: machine ? { id: machine.id, code: machine.code, name: machine.name } : null,
        createdByUser: entry.createdByUser,
      };
    }),
    req
  );
  res.json(result);
});

router.get("/stock", requirePermission("reports.read"), async (req: AuthRequest, res: Response) => {
  const { page, limit, offset } = paging(req);
  const where = stockWhere(req);
  const { rows, count } = await StockItem.findAndCountAll({
    where,
    include: [includeMachine],
    order: [
      ["processStatus", "ASC"],
      ["sku", "ASC"],
      ["id", "ASC"],
    ],
    limit,
    offset,
  });
  res.json({
    rows: rows.map((r) => {
      const plain = r.get({ plain: true }) as StockItem & { machine?: Machine | null };
      return plain;
    }),
    total: count,
    page,
    limit,
  });
});

router.get("/machines", requirePermission("reports.read"), async (req: AuthRequest, res: Response) => {
  const stockFilters = stockWhere(req);
  const machineId = Number(req.query.machineId);
  const machineWhere =
    Number.isInteger(machineId) && machineId > 0 ? ({ id: machineId } as AnyWhere) : undefined;
  const machines = await Machine.findAll({
    where: machineWhere,
    include: [
      {
        model: StockItem,
        as: "stockItems",
        where: Object.keys(stockFilters).length > 0 ? stockFilters : undefined,
        required: false,
      },
    ],
    order: [["code", "ASC"]],
  });
  const rows = machines.map((machine) => {
    const plain = machine.get({ plain: true }) as Machine & { stockItems?: StockItem[] };
    const items = plain.stockItems ?? [];
    return {
      id: plain.id,
      code: plain.code,
      name: plain.name,
      stockKalem: items.length,
      stockAdet: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
      bekliyor: items.filter((item) => item.processStatus === "bekliyor").length,
      isleniyor: items.filter((item) => item.processStatus === "isleniyor").length,
      tamamlandi: items.filter((item) => item.processStatus === "tamamlandi").length,
    };
  });
  res.json(paged(rows, req));
});

router.get("/stock-movements", requirePermission("reports.read"), async (req: AuthRequest, res: Response) => {
  const { page, limit, offset } = paging(req);
  const where: AnyWhere = { ...createdAtRange(req) };
  const sku = String(req.query.sku ?? "").trim();
  const name = String(req.query.name ?? "").trim();
  const userId = Number(req.query.userId);
  if (sku) Object.assign(where, { sku: { [Op.iLike]: `%${sku}%` } });
  if (name) Object.assign(where, { name: { [Op.iLike]: `%${name}%` } });
  if (Number.isInteger(userId) && userId > 0) Object.assign(where, { actorUserId: userId });
  const { rows, count } = await StockMovement.findAndCountAll({
    where,
    include: [includeUser("actorUser")],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });
  res.json({ rows, total: count, page, limit });
});

router.get("/audit", requirePermission("reports.read"), async (req: AuthRequest, res: Response) => {
  const { page, limit, offset } = paging(req);
  const where: AnyWhere = { ...createdAtRange(req) };
  const userId = Number(req.query.userId);
  if (Number.isInteger(userId) && userId > 0) Object.assign(where, { actorUserId: userId });
  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    include: [includeUser("actorUser")],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });
  res.json({ rows, total: count, page, limit });
});

router.get("/range", requirePermission("reports.read"), async (req: AuthRequest, res: Response) => {
  const [malKabul, shipments] = await Promise.all([
    GoodsReceiptLine.findAll({
      where: {
        ...dateRange(req, "irsaliyeTarihi"),
        ...(boolQuery(req.query.includeCancelled) ? {} : { isCancelled: false }),
      },
      order: [
        ["irsaliyeTarihi", "DESC"],
        ["id", "DESC"],
      ],
    }),
    shipmentEntries(req),
  ]);
  const malKabulMalzemeMap = new Map<string, { toplamMiktar: number; satirSayisi: number; dates: Set<string> }>();
  for (const row of malKabul) {
    const current = malKabulMalzemeMap.get(row.materialCode) ?? {
      toplamMiktar: 0,
      satirSayisi: 0,
      dates: new Set<string>(),
    };
    current.toplamMiktar += Number(row.quantity) || 0;
    current.satirSayisi += 1;
    current.dates.add(dateOnlyToStr(row.irsaliyeTarihi));
    malKabulMalzemeMap.set(row.materialCode, current);
  }
  const sevkMap = new Map<string, { toplamMiktar: number; satirSayisi: number }>();
  for (const entry of shipments) {
    const current = sevkMap.get(entry.stock.sku) ?? { toplamMiktar: 0, satirSayisi: 0 };
    current.toplamMiktar += Number(entry.stock.quantity) || 0;
    current.satirSayisi += 1;
    sevkMap.set(entry.stock.sku, current);
  }
  res.json({
    malKabul: malKabul.map((r) => ({
      id: r.id,
      irsaliyeNo: r.irsaliyeNo,
      irsaliyeTarihi: dateOnlyToStr(r.irsaliyeTarihi),
      materialCode: r.materialCode,
      materialDescription: r.materialDescription,
      quantity: r.quantity,
      createdAt: r.createdAt,
    })),
    malKabulMalzemeOzeti: [...malKabulMalzemeMap.entries()].map(([materialCode, value]) => ({
      materialCode,
      toplamMiktar: value.toplamMiktar,
      satirSayisi: value.satirSayisi,
      irsaliyeTarihleri: [...value.dates].sort(),
    })),
    sevkEdilen: shipments.map((entry) => ({
      shipmentId: entry.shipmentId,
      shipmentNo: entry.shipmentNo,
      id: entry.stock.id,
      sku: entry.stock.sku,
      name: entry.stock.name,
      quantity: entry.stock.quantity,
      unit: entry.stock.unit,
      shippedAt: entry.shippedAt,
      shipDestination: entry.destination,
      machine: entry.stock.machine
        ? { id: entry.stock.machine.id, code: entry.stock.machine.code, name: entry.stock.machine.name }
        : null,
    })),
    sevkMalzemeOzeti: [...sevkMap.entries()].map(([sku, value]) => ({ sku, ...value })),
    ozet: {
      malKabulSatirSayisi: malKabul.length,
      malKabulToplamAdet: malKabul.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
      sevkSatirSayisi: shipments.length,
      sevkToplamAdet: shipments.reduce((sum, entry) => sum + (Number(entry.stock.quantity) || 0), 0),
    },
  });
});

export default router;
