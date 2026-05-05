import { Router, Response } from "express";
import { StockItem } from "../models/StockItem";
import { Machine } from "../models/Machine";
import { sequelize } from "../db";
import { dateOnlyLocal } from "../dateOnlyLocal";
import { requireAuth, attachUser, AuthRequest, requirePermission } from "../middleware/auth";
import type { StockProcessStatus } from "../models/StockItem";
import { attachMalKabulProductNames } from "../services/stockDisplayName";
import { recordAudit } from "../services/audit";
import { recordStockMovement, snapshotStock } from "../services/stockMovement";
import {
  idList,
  nonNegativeQuantity,
  nullableTrimmedString,
  optionalId,
  optionalTrimmedString,
  trimmedString,
  validateBody,
  z,
} from "../middleware/validate";

const router = Router();
router.use(requireAuth, attachUser);

const includeMachine = {
  model: Machine,
  as: "machine",
  attributes: ["id", "code", "name"],
};

const processValues: StockProcessStatus[] = ["bekliyor", "isleniyor", "tamamlandi"];
const processStatusSchema = z.enum(processValues);

const createStockSchema = z.object({
  sku: trimmedString("Malzeme kodu", 80),
  name: trimmedString("Ürün adı", 200),
  quantity: nonNegativeQuantity.optional(),
  unit: optionalTrimmedString("Birim", 24),
});

const bulkStockSchema = z
  .object({
    ids: idList,
    machineId: optionalId,
    processStatus: processStatusSchema.optional(),
  })
  .refine(
    (body) => body.machineId !== undefined || body.processStatus !== undefined,
    "Makina veya durum belirtilmeli"
  );

const bulkShipmentSchema = z.object({
  ids: idList,
  action: z.enum(["ship", "unship", "destination"]),
  shipDestination: nullableTrimmedString("Sevk hedefi", 200),
});

const stockUpdateSchema = z
  .object({
    sku: optionalTrimmedString("Malzeme kodu", 80),
    name: optionalTrimmedString("Ürün adı", 200),
    quantity: nonNegativeQuantity.optional(),
    unit: optionalTrimmedString("Birim", 24),
    machineId: optionalId,
    newMachine: z
      .object({
        code: optionalTrimmedString("Yeni makina kodu", 64),
        name: optionalTrimmedString("Yeni makina adı", 200),
      })
      .optional(),
    processStatus: processStatusSchema.optional(),
    isShipped: z.boolean().optional(),
    shipDestination: nullableTrimmedString("Sevk hedefi", 200),
  })
  .refine((body) => Object.keys(body).length > 0, "Güncellenecek alan gerekli");

router.get("/", requirePermission("stock.read"), async (_req: AuthRequest, res: Response) => {
  const rows = await StockItem.findAll({
    include: [includeMachine],
    order: [
      ["processStatus", "ASC"],
      ["sku", "ASC"],
      ["machineId", "ASC"],
      ["id", "ASC"],
    ],
  });
  res.json(await attachMalKabulProductNames(rows));
});

/** Tamamlanan malzemeler — Sevk ekranı (otomatik kuyruk). */
router.get("/sevk-bekleyen", requirePermission("shipments.read"), async (_req: AuthRequest, res: Response) => {
  const rows = await StockItem.findAll({
    where: { processStatus: "tamamlandi" },
    include: [includeMachine],
    order: [
      ["isShipped", "ASC"],
      ["updatedAt", "DESC"],
    ],
  });
  res.json(await attachMalKabulProductNames(rows));
});

router.get("/:id", requirePermission("stock.read"), async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const row = await StockItem.findByPk(id, { include: [includeMachine] });
  if (!row) {
    res.status(404).json({ error: "Kayıt bulunamadı" });
    return;
  }
  const [enriched] = await attachMalKabulProductNames([row]);
  res.json(enriched);
});

router.post("/", requirePermission("stock.write"), validateBody(createStockSchema), async (req: AuthRequest, res: Response) => {
  const { sku, name, quantity, unit } = req.body as {
    sku?: string;
    name?: string;
    quantity?: number | string;
    unit?: string;
  };
  if (!sku?.trim() || !name?.trim()) {
    res.status(400).json({ error: "Malzeme kodu ve ürün adı gerekli" });
    return;
  }
  const qtyRaw = quantity === undefined || quantity === "" ? 0 : Number(quantity);
  if (Number.isNaN(qtyRaw) || qtyRaw < 0) {
    res.status(400).json({ error: "Miktar geçerli bir sayı olmalı" });
    return;
  }
  const qty = Math.max(0, Math.round(qtyRaw));
  try {
    const row = await sequelize.transaction(async (transaction) => {
      const createdRow = await StockItem.create(
        {
          sku: sku.trim(),
          name: name.trim(),
          quantity: qty,
          unit: (unit?.trim() || "adet").slice(0, 24),
          machineId: null,
          processStatus: "bekliyor",
          isShipped: false,
          shippedAt: null,
          shipDestination: null,
        },
        { transaction }
      );
      await recordStockMovement(
        {
          type: "manual_create",
          actorUserId: req.sessionUser?.id,
          after: snapshotStock(createdRow),
          quantityDelta: qty,
          referenceType: "stock_item",
          referenceId: createdRow.id,
        },
        transaction
      );
      await recordAudit(
        {
          actorUserId: req.sessionUser?.id,
          action: "stock.create",
          entityType: "stock_item",
          entityId: createdRow.id,
          metadata: { sku: createdRow.sku, quantity: qty },
        },
        transaction
      );
      return createdRow;
    });
    const created = await StockItem.findByPk(row.id, { include: [includeMachine] });
    if (!created) {
      res.status(500).json({ error: "Oluşturulan kayıt okunamadı" });
      return;
    }
    const [out] = await attachMalKabulProductNames([created]);
    res.status(201).json(out ?? created.get({ plain: true }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Stok kaydı oluşturulamadı" });
  }
});

/** Toplu makina / durum güncellemesi (tek işlemde). */
router.patch("/bulk", requirePermission("stock.write"), validateBody(bulkStockSchema), async (req: AuthRequest, res: Response) => {
  const { ids, machineId, processStatus } = req.body as {
    ids?: unknown;
    machineId?: number | string | null;
    processStatus?: string;
  };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "En az bir kayıt seçilmeli" });
    return;
  }
  const idNums = ids.map((x) => Number(x));
  if (idNums.some((n) => !Number.isInteger(n) || n < 1)) {
    res.status(400).json({ error: "Geçersiz id listesi" });
    return;
  }
  const hasMachine = machineId !== undefined;
  const hasStatus = processStatus !== undefined;
  if (!hasMachine && !hasStatus) {
    res.status(400).json({ error: "Makina veya durum belirtilmeli" });
    return;
  }
  if (
    hasStatus &&
    !processValues.includes(processStatus as StockProcessStatus)
  ) {
    res.status(400).json({ error: "Geçersiz işlem durumu" });
    return;
  }

  try {
    await sequelize.transaction(async (transaction) => {
      for (const id of idNums) {
        const row = await StockItem.findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!row) {
          throw new Error("NOT_FOUND");
        }
        const before = snapshotStock(row);
        const prevProcess = row.processStatus;

        if (hasMachine) {
          row.machineId =
            machineId == null || (typeof machineId === "string" && machineId === "")
              ? null
              : Number(machineId);
        }
        if (hasStatus) {
          row.processStatus = processStatus as StockProcessStatus;
        }

        const nextProcess = row.processStatus;
        if (nextProcess !== "tamamlandi") {
          row.isShipped = false;
          row.shippedAt = null;
          row.shipDestination = null;
        } else if (prevProcess !== "tamamlandi") {
          row.isShipped = false;
          row.shippedAt = null;
          row.shipDestination = null;
        }

        await row.save({ transaction });
        await recordStockMovement(
          {
            type: "bulk_update",
            actorUserId: req.sessionUser?.id,
            before,
            after: snapshotStock(row),
            referenceType: "stock_bulk_update",
            referenceId: id,
            metadata: { machineChanged: hasMachine, statusChanged: hasStatus },
          },
          transaction
        );
      }
      await recordAudit(
        {
          actorUserId: req.sessionUser?.id,
          action: "stock.bulk_update",
          entityType: "stock_item",
          entityId: null,
          metadata: { ids: idNums, machineId, processStatus },
        },
        transaction
      );
    });
    const rows = await StockItem.findAll({
      where: { id: idNums },
      include: [includeMachine],
      order: [
        ["processStatus", "ASC"],
        ["sku", "ASC"],
        ["machineId", "ASC"],
        ["id", "ASC"],
      ],
    });
    res.json(await attachMalKabulProductNames(rows));
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      res.status(404).json({ error: "Seçilen kayıtlardan biri bulunamadı" });
      return;
    }
    console.error(e);
    res.status(409).json({ error: "Toplu güncelleme başarısız" });
  }
});

/** Sevk ekranı: toplu sevk işareti / hedef (yalnızca tamamlanmış stok). */
router.patch("/bulk-sevk", requirePermission("shipments.write"), validateBody(bulkShipmentSchema), async (req: AuthRequest, res: Response) => {
  const { ids, action, shipDestination } = req.body as {
    ids?: unknown;
    action?: string;
    shipDestination?: string | null;
  };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "En az bir kayıt seçilmeli" });
    return;
  }
  const idNums = ids.map((x) => Number(x));
  if (idNums.some((n) => !Number.isInteger(n) || n < 1)) {
    res.status(400).json({ error: "Geçersiz id listesi" });
    return;
  }
  if (action !== "ship" && action !== "unship" && action !== "destination") {
    res.status(400).json({ error: "Geçersiz işlem (ship | unship | destination)" });
    return;
  }

  try {
    await sequelize.transaction(async (transaction) => {
      for (const id of idNums) {
        const row = await StockItem.findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!row) {
          throw new Error("NOT_FOUND");
        }
        if (row.processStatus !== "tamamlandi") {
          throw new Error("NOT_COMPLETED");
        }
        const before = snapshotStock(row);

        if (action === "unship") {
          row.isShipped = false;
          row.shippedAt = null;
          row.shipDestination = null;
        } else if (action === "ship") {
          const dest =
            shipDestination != null ? String(shipDestination).trim() : "";
          if (!dest) {
            throw new Error("BAD_SHIP_DEST");
          }
          row.isShipped = true;
          row.shipDestination = dest.slice(0, 200);
          row.shippedAt = dateOnlyLocal() as unknown as Date;
        } else {
          if (!row.isShipped) {
            throw new Error("NEED_SHIPPED");
          }
          const dest =
            shipDestination != null ? String(shipDestination).trim() : "";
          if (!dest) {
            throw new Error("BAD_SHIP_DEST");
          }
          row.shipDestination = dest.slice(0, 200);
        }

        await row.save({ transaction });
        await recordStockMovement(
          {
            type:
              action === "ship"
                ? "ship"
                : action === "unship"
                  ? "unship"
                  : "ship_destination",
            actorUserId: req.sessionUser?.id,
            before,
            after: snapshotStock(row),
            referenceType: "stock_bulk_sevk",
            referenceId: id,
          },
          transaction
        );
      }
      await recordAudit(
        {
          actorUserId: req.sessionUser?.id,
          action: `stock.${action}`,
          entityType: "stock_item",
          entityId: null,
          metadata: { ids: idNums, shipDestination },
        },
        transaction
      );
    });
    res.status(204).send();
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      res.status(404).json({ error: "Seçilen kayıtlardan biri bulunamadı" });
      return;
    }
    if (e instanceof Error && e.message === "NOT_COMPLETED") {
      res.status(400).json({
        error: "Yalnızca işlem durumu «Tamamlandı» olan satırlar sevk listesinde güncellenir",
      });
      return;
    }
    if (e instanceof Error && e.message === "BAD_SHIP_DEST") {
      res.status(400).json({ error: "Sevk hedefi (nereye) girilmeli" });
      return;
    }
    if (e instanceof Error && e.message === "NEED_SHIPPED") {
      res.status(400).json({
        error: "Nereye güncellemesi için seçilen satırların hepsi sevk edilmiş olmalı",
      });
      return;
    }
    console.error(e);
    res.status(409).json({ error: "Toplu sevk güncellemesi başarısız" });
  }
});

router.patch("/:id", requirePermission("stock.write"), validateBody(stockUpdateSchema), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }

  const {
    sku,
    name,
    quantity,
    unit,
    machineId,
    newMachine,
    processStatus,
    isShipped,
    shipDestination,
  } = req.body as {
    sku?: string;
    name?: string;
    quantity?: number | string;
    unit?: string;
    machineId?: number | string | null;
    newMachine?: { code?: string; name?: string };
    processStatus?: string;
    isShipped?: boolean;
    shipDestination?: string | null;
  };

  const newCode = newMachine?.code?.trim();
  const newName = newMachine?.name?.trim();
  if ((newCode && !newName) || (!newCode && newName)) {
    res.status(400).json({ error: "Yeni makina için kod ve ad birlikte girilmeli" });
    return;
  }

  try {
    await sequelize.transaction(async (transaction) => {
      const row = await StockItem.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) {
        throw new Error("NOT_FOUND");
      }
      const before = snapshotStock(row);

      const prevProcess = row.processStatus;

      if (newCode && newName) {
        const [m, created] = await Machine.findOrCreate({
          where: { code: newCode },
          defaults: {
            code: newCode,
            name: newName,
          },
          transaction,
        });
        if (!created) {
          m.name = newName;
          await m.save({ transaction });
        }
        row.machineId = m.id;
      } else if (machineId !== undefined) {
        row.machineId =
          machineId == null || (typeof machineId === "string" && machineId === "")
            ? null
            : Number(machineId);
      }

      if (sku !== undefined) row.sku = sku.trim();
      if (name !== undefined) row.name = name.trim();
      if (quantity !== undefined) {
        const qtyRaw = Number(quantity);
        if (Number.isNaN(qtyRaw) || qtyRaw < 0) {
          throw new Error("BAD_QTY");
        }
        row.quantity = Math.max(0, Math.round(qtyRaw));
      }
      if (unit !== undefined) row.unit = String(unit).trim().slice(0, 24) || "adet";
      if (processStatus !== undefined) {
        if (processValues.includes(processStatus as StockProcessStatus)) {
          row.processStatus = processStatus as StockProcessStatus;
        }
      }

      const nextProcess = row.processStatus;
      if (nextProcess !== "tamamlandi") {
        row.isShipped = false;
        row.shippedAt = null;
        row.shipDestination = null;
      } else if (prevProcess !== "tamamlandi") {
        row.isShipped = false;
        row.shippedAt = null;
        row.shipDestination = null;
      }

      if (nextProcess === "tamamlandi" && typeof isShipped === "boolean") {
        row.isShipped = isShipped;
        if (isShipped) {
          const dest =
            shipDestination != null ? String(shipDestination).trim() : "";
          if (!dest) {
            throw new Error("BAD_SHIP_DEST");
          }
          row.shipDestination = dest.slice(0, 200);
          row.shippedAt = dateOnlyLocal() as unknown as Date;
        } else {
          row.shippedAt = null;
          row.shipDestination = null;
        }
      } else if (
        nextProcess === "tamamlandi" &&
        row.isShipped &&
        shipDestination !== undefined
      ) {
        const dest = String(shipDestination ?? "").trim();
        row.shipDestination = dest ? dest.slice(0, 200) : null;
      }

      await row.save({ transaction });
      await recordStockMovement(
        {
          type: "manual_update",
          actorUserId: req.sessionUser?.id,
          before,
          after: snapshotStock(row),
          referenceType: "stock_item",
          referenceId: row.id,
        },
        transaction
      );
      await recordAudit(
        {
          actorUserId: req.sessionUser?.id,
          action: "stock.update",
          entityType: "stock_item",
          entityId: row.id,
          metadata: { before, after: snapshotStock(row) },
        },
        transaction
      );
    });

    const updated = await StockItem.findByPk(id, { include: [includeMachine] });
    if (!updated) {
      res.status(404).json({ error: "Kayıt bulunamadı" });
      return;
    }
    const [out] = await attachMalKabulProductNames([updated]);
    res.json(out ?? updated.get({ plain: true }));
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      res.status(404).json({ error: "Kayıt bulunamadı" });
      return;
    }
    if (e instanceof Error && e.message === "BAD_QTY") {
      res.status(400).json({ error: "Miktar geçerli bir sayı olmalı" });
      return;
    }
    if (e instanceof Error && e.message === "BAD_SHIP_DEST") {
      res.status(400).json({ error: "Sevk hedefi (nereye) girilmeli" });
      return;
    }
    console.error(e);
    res.status(409).json({ error: "Güncellenemedi (benzersizlik veya veri hatası)" });
  }
});

router.delete("/:id", requirePermission("stock.write"), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  try {
    await sequelize.transaction(async (transaction) => {
      const row = await StockItem.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) {
        throw new Error("NOT_FOUND");
      }
      const before = snapshotStock(row);
      await recordStockMovement(
        {
          type: "manual_update",
          actorUserId: req.sessionUser?.id,
          before,
          sku: before.sku,
          name: before.name,
          quantityDelta: -(before.quantity ?? 0),
          referenceType: "stock_item",
          referenceId: row.id,
          metadata: { deleted: true },
        },
        transaction
      );
      await recordAudit(
        {
          actorUserId: req.sessionUser?.id,
          action: "stock.delete",
          entityType: "stock_item",
          entityId: row.id,
          metadata: before,
        },
        transaction
      );
      await row.destroy({ transaction });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      res.status(404).json({ error: "Kayıt bulunamadı" });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Silme işlemi başarısız" });
    return;
  }
  res.status(204).send();
});

export default router;
