import type { Transaction } from "sequelize";
import { Op } from "sequelize";
import { StockItem } from "../models/StockItem";
import { recordStockMovement, snapshotStock } from "./stockMovement";

function stockWhere(sku: string, machineId: number | null) {
  if (machineId == null) {
    return { sku, machineId: { [Op.is]: null } };
  }
  return { sku, machineId };
}

function wholeUnits(qty: number): number {
  const n = Math.floor(Number(qty));
  return Number.isFinite(n) ? n : 0;
}

/** Mal kabul: her adet için ayrı stok satırı (miktar = 1). */
export async function incrementStockForMalKabul(
  params: {
    sku: string;
    name: string;
    qty: number;
    unit?: string;
    machineId: number | null;
    actorUserId?: number | null;
    referenceId?: string | number | null;
  },
  transaction: Transaction
): Promise<void> {
  const sku = params.sku.trim();
  const name = params.name.trim();
  const unit = params.unit?.trim() || "adet";
  const { machineId } = params;
  const units = wholeUnits(params.qty);
  if (units < 1) {
    throw new Error("INVALID_QTY");
  }

  for (let i = 0; i < units; i += 1) {
    const row = await StockItem.create(
      {
        sku,
        name,
        quantity: 1,
        unit,
        machineId,
        goodsReceiptLineId:
          params.referenceId == null || Number.isNaN(Number(params.referenceId))
            ? null
            : Number(params.referenceId),
        trackingCode: null,
        processStatus: "bekliyor",
        isShipped: false,
        shippedAt: null,
        shipDestination: null,
      },
      { transaction }
    );
    await recordStockMovement(
      {
        type: "mal_kabul",
        actorUserId: params.actorUserId,
        after: snapshotStock(row),
        quantityDelta: 1,
        referenceType: "goods_receipt_line",
        referenceId: params.referenceId,
      },
      transaction
    );
  }
}

/** Mal kabul satırı silinince: aynı malzeme kodundan (FIFO) adet kadar satır silinir. */
export async function decrementStockForMalKabul(
  materialCode: string,
  machineId: number | null,
  qty: number,
  transaction: Transaction,
  options: { actorUserId?: number | null; referenceId?: string | number | null } = {}
): Promise<void> {
  const sku = materialCode.trim();
  const units = wholeUnits(qty);
  if (units < 1) return;

  const rows = await StockItem.findAll({
    where: stockWhere(sku, machineId),
    order: [["id", "ASC"]],
    limit: units,
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  for (const row of rows) {
    const before = snapshotStock(row);
    await row.destroy({ transaction });
    await recordStockMovement(
      {
        type: "mal_kabul_iptal",
        actorUserId: options.actorUserId,
        before,
        sku: before.sku,
        name: before.name,
        quantityDelta: -1,
        referenceType: "goods_receipt_line",
        referenceId: options.referenceId,
      },
      transaction
    );
  }
}
