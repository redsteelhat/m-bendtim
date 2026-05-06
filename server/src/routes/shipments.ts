import { Router, Response } from "express";
import { Op, QueryTypes, Transaction } from "sequelize";
import { Shipment } from "../models/Shipment";
import { ShipmentItem } from "../models/ShipmentItem";
import { StockItem } from "../models/StockItem";
import { Machine } from "../models/Machine";
import { User } from "../models/User";
import { sequelize } from "../db";
import { dateOnlyLocal } from "../dateOnlyLocal";
import {
  requireAuth,
  attachUser,
  AuthRequest,
  requirePermission,
  requireRole,
} from "../middleware/auth";
import { idList, nullableTrimmedString, trimmedString, validateBody, z } from "../middleware/validate";
import { recordAudit } from "../services/audit";
import { recordStockMovement, snapshotStock } from "../services/stockMovement";

const router = Router();
router.use(requireAuth, attachUser);

const dateOnlySchema = trimmedString("Sevk tarihi", 32).pipe(
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sevk tarihi YYYY-MM-DD formatında olmalı")
);

const createShipmentSchema = z.object({
  destination: trimmedString("Varış/hedef", 240),
  shippedAt: dateOnlySchema.optional(),
  notes: nullableTrimmedString("Not", 5000),
  stockItemIds: idList,
});

const cancelShipmentSchema = z.object({
  reason: trimmedString("İptal nedeni", 500),
});

const includeMachine = {
  model: Machine,
  as: "machine",
  attributes: ["id", "code", "name"],
};

const shipmentIncludes = [
  {
    model: User,
    as: "createdByUser",
    attributes: ["id", "name", "email", "role"],
    required: false,
  },
  {
    model: User,
    as: "cancelledByUser",
    attributes: ["id", "name", "email", "role"],
    required: false,
  },
  {
    model: ShipmentItem,
    as: "items",
    required: false,
    include: [
      {
        model: StockItem,
        as: "stockItem",
        required: false,
        include: [includeMachine],
      },
    ],
  },
];

function uniqueIds(ids: number[]): number[] {
  return [...new Set(ids)];
}

function dateOnlyToYear(dateOnly: string): number {
  const year = Number(dateOnly.slice(0, 4));
  if (!Number.isInteger(year) || year < 2000) return new Date().getFullYear();
  return year;
}

async function generateShipmentNo(shippedAt: string, transaction: Transaction): Promise<string> {
  const year = dateOnlyToYear(shippedAt);
  const prefix = `SVK-${year}-`;

  await sequelize.query("SELECT pg_advisory_xact_lock(:key)", {
    replacements: { key: 2026050507 },
    transaction,
  });

  const latest = await sequelize.query<{ shipmentNo: string }>(
    `SELECT "shipmentNo"
     FROM "shipments"
     WHERE "shipmentNo" LIKE :pattern
     ORDER BY "shipmentNo" DESC
     LIMIT 1`,
    {
      replacements: { pattern: `${prefix}%` },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  const lastNo = latest[0]?.shipmentNo?.slice(prefix.length);
  const next = (Number(lastNo) || 0) + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

async function findShipmentForResponse(id: number) {
  return Shipment.findByPk(id, {
    include: shipmentIncludes,
    order: [[{ model: ShipmentItem, as: "items" }, "id", "ASC"]],
  });
}

router.get("/", requirePermission("shipments.read"), async (_req: AuthRequest, res: Response) => {
  const rows = await Shipment.findAll({
    include: [
      {
        model: User,
        as: "createdByUser",
        attributes: ["id", "name", "email", "role"],
        required: false,
      },
      { model: ShipmentItem, as: "items", attributes: ["id", "stockItemId"], required: false },
    ],
    order: [
      ["shippedAt", "DESC"],
      ["id", "DESC"],
    ],
  });
  res.json(rows);
});

router.get("/:id", requirePermission("shipments.read"), async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const row = await findShipmentForResponse(id);
  if (!row) {
    res.status(404).json({ error: "Kayıt bulunamadı" });
    return;
  }
  res.json(row);
});

router.post(
  "/",
  requirePermission("shipments.write"),
  validateBody(createShipmentSchema),
  async (req: AuthRequest, res: Response) => {
    const { destination, shippedAt, notes, stockItemIds } = req.body as {
      destination: string;
      shippedAt?: string;
      notes?: string | null;
      stockItemIds: number[];
    };

    const ids = uniqueIds(stockItemIds);
    if (ids.length !== stockItemIds.length) {
      res.status(400).json({ error: "Aynı stok satırı bir sevk belgesine bir kez eklenebilir" });
      return;
    }

    const shipmentDate = shippedAt ?? dateOnlyLocal();

    try {
      const shipmentId = await sequelize.transaction(async (transaction) => {
        const stockRows = await StockItem.findAll({
          where: { id: { [Op.in]: ids } },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (stockRows.length !== ids.length) {
          throw new Error("STOCK_NOT_FOUND");
        }

        const stockById = new Map(stockRows.map((row) => [row.id, row]));
        for (const id of ids) {
          const row = stockById.get(id);
          if (!row) throw new Error("STOCK_NOT_FOUND");
          if (row.processStatus !== "tamamlandi") throw new Error("NOT_COMPLETED");
          if (row.isShipped) throw new Error("ALREADY_SHIPPED");
        }

        const shipmentNo = await generateShipmentNo(shipmentDate, transaction);
        const shipment = await Shipment.create(
          {
            shipmentNo,
            destination: destination.trim(),
            shippedAt: shipmentDate as unknown as Date,
            notes: notes?.trim() || null,
            status: "sevk_edildi",
            createdByUserId: req.sessionUser?.id ?? null,
            cancelledAt: null,
            cancelledByUserId: null,
            cancelReason: null,
          },
          { transaction }
        );

        for (const id of ids) {
          const row = stockById.get(id);
          if (!row) throw new Error("STOCK_NOT_FOUND");
          const before = snapshotStock(row);
          await ShipmentItem.create(
            {
              shipmentId: shipment.id,
              stockItemId: row.id,
            },
            { transaction }
          );
          row.isShipped = true;
          row.shippedAt = shipmentDate as unknown as Date;
          row.shipDestination = destination.trim().slice(0, 200);
          await row.save({ transaction });
          await recordStockMovement(
            {
              type: "ship",
              actorUserId: req.sessionUser?.id,
              before,
              after: snapshotStock(row),
              referenceType: "shipment",
              referenceId: shipment.id,
              metadata: { shipmentNo },
            },
            transaction
          );
        }

        await recordAudit(
          {
            actorUserId: req.sessionUser?.id,
            action: "shipment.create",
            entityType: "shipment",
            entityId: shipment.id,
            metadata: {
              shipmentNo,
              destination: destination.trim(),
              shippedAt: shipmentDate,
              stockItemIds: ids,
            },
          },
          transaction
        );

        return shipment.id;
      });

      const created = await findShipmentForResponse(shipmentId);
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof Error && e.message === "STOCK_NOT_FOUND") {
        res.status(404).json({ error: "Seçilen stoklardan biri bulunamadı" });
        return;
      }
      if (e instanceof Error && e.message === "NOT_COMPLETED") {
        res.status(400).json({ error: "Yalnızca tamamlanmış stoklar sevk edilebilir" });
        return;
      }
      if (e instanceof Error && e.message === "ALREADY_SHIPPED") {
        res.status(409).json({ error: "Seçilen stoklardan biri zaten sevk edilmiş" });
        return;
      }
      console.error(e);
      res.status(409).json({ error: "Sevk belgesi oluşturulamadı" });
    }
  }
);

router.patch(
  "/:id/cancel",
  requireRole("admin"),
  validateBody(cancelShipmentSchema),
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Geçersiz id" });
      return;
    }
    const { reason } = req.body as { reason: string };
    const trimmedReason = reason.trim();

    try {
      const cancelledId = await sequelize.transaction(async (transaction) => {
        const shipment = await Shipment.findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!shipment) throw new Error("NOT_FOUND");
        if (shipment.status === "iptal") throw new Error("ALREADY_CANCELLED");

        const items = await ShipmentItem.findAll({
          where: { shipmentId: shipment.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const stockIds = items.map((item) => item.stockItemId);
        const stockRows =
          stockIds.length > 0
            ? await StockItem.findAll({
                where: { id: { [Op.in]: stockIds } },
                transaction,
                lock: transaction.LOCK.UPDATE,
              })
            : [];
        if (stockRows.length !== stockIds.length) throw new Error("STOCK_NOT_FOUND");

        const stockById = new Map(stockRows.map((row) => [row.id, row]));
        for (const stockId of stockIds) {
          const row = stockById.get(stockId);
          if (!row) throw new Error("STOCK_NOT_FOUND");
          if (row.processStatus !== "tamamlandi") throw new Error("UNSAFE_CANCEL");
          if (!row.isShipped) throw new Error("UNSAFE_CANCEL");
        }

        shipment.status = "iptal";
        shipment.cancelledAt = new Date();
        shipment.cancelledByUserId = req.sessionUser?.id ?? null;
        shipment.cancelReason = trimmedReason.slice(0, 500);
        await shipment.save({ transaction });

        for (const stockId of stockIds) {
          const row = stockById.get(stockId);
          if (!row) throw new Error("STOCK_NOT_FOUND");
          const before = snapshotStock(row);
          row.isShipped = false;
          row.shippedAt = null;
          row.shipDestination = null;
          await row.save({ transaction });
          await recordStockMovement(
            {
              type: "unship",
              actorUserId: req.sessionUser?.id,
              before,
              after: snapshotStock(row),
              referenceType: "shipment",
              referenceId: shipment.id,
              metadata: { shipmentNo: shipment.shipmentNo, cancelReason: trimmedReason },
            },
            transaction
          );
        }

        await recordAudit(
          {
            actorUserId: req.sessionUser?.id,
            action: "shipment.cancel",
            entityType: "shipment",
            entityId: shipment.id,
            metadata: {
              shipmentNo: shipment.shipmentNo,
              reason: trimmedReason,
              stockItemIds: stockIds,
            },
          },
          transaction
        );

        return shipment.id;
      });

      const cancelled = await findShipmentForResponse(cancelledId);
      res.json(cancelled);
    } catch (e) {
      if (e instanceof Error && e.message === "NOT_FOUND") {
        res.status(404).json({ error: "Sevk belgesi bulunamadı" });
        return;
      }
      if (e instanceof Error && e.message === "ALREADY_CANCELLED") {
        res.status(409).json({ error: "Bu sevk belgesi zaten iptal edilmiş" });
        return;
      }
      if (e instanceof Error && e.message === "STOCK_NOT_FOUND") {
        res.status(409).json({ error: "Sevk belgesindeki stoklardan biri bulunamadı" });
        return;
      }
      if (e instanceof Error && e.message === "UNSAFE_CANCEL") {
        res.status(409).json({
          error: "Sevk iptali güvenli değil; stokların tamamlanmış ve halen sevk edilmiş olması gerekir",
        });
        return;
      }
      console.error(e);
      res.status(409).json({ error: "Sevk belgesi iptal edilemedi" });
    }
  }
);

router.delete("/:id", requirePermission("shipments.write"), async (_req, res: Response) => {
  res.status(405).json({
    error: "Sevk belgeleri silinmez. İptal için PATCH /api/shipments/:id/cancel kullanın",
  });
});

export default router;
