import type { Transaction } from "sequelize";
import { Op } from "sequelize";
import { StockItem } from "../models/StockItem";

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
  params: { sku: string; name: string; qty: number; machineId: number | null },
  transaction: Transaction
): Promise<void> {
  const sku = params.sku.trim();
  const name = params.name.trim();
  const { machineId } = params;
  const units = wholeUnits(params.qty);
  if (units < 1) {
    throw new Error("INVALID_QTY");
  }

  for (let i = 0; i < units; i += 1) {
    await StockItem.create(
      {
        sku,
        name,
        quantity: 1,
        unit: "adet",
        machineId,
        processStatus: "bekliyor",
        isShipped: false,
        shippedAt: null,
        shipDestination: null,
      },
      { transaction }
    );
  }
}

/** Mal kabul satırı silinince: aynı malzeme kodundan (FIFO) adet kadar satır silinir. */
export async function decrementStockForMalKabul(
  materialCode: string,
  machineId: number | null,
  qty: number,
  transaction: Transaction
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
    await row.destroy({ transaction });
  }
}
