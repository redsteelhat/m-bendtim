import type { Transaction } from "sequelize";
import { StockItem } from "../models/StockItem";
import {
  StockMovement,
  type StockMovementType,
} from "../models/StockMovement";

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function snapshotStock(row: StockItem) {
  return {
    stockItemId: row.id,
    sku: row.sku,
    name: row.name,
    quantity: num(row.quantity),
    machineId: row.machineId ?? null,
    processStatus: row.processStatus,
    isShipped: row.isShipped,
    shippedAt: row.shippedAt ?? null,
    shipDestination: row.shipDestination ?? null,
  };
}

export async function recordStockMovement(
  params: {
    type: StockMovementType;
    actorUserId?: number | null;
    before?: ReturnType<typeof snapshotStock> | null;
    after?: ReturnType<typeof snapshotStock> | null;
    sku?: string;
    name?: string | null;
    quantityDelta?: number;
    referenceType?: string | null;
    referenceId?: string | number | null;
    metadata?: Record<string, unknown> | null;
  },
  transaction?: Transaction
): Promise<void> {
  const before = params.before ?? null;
  const after = params.after ?? null;
  const quantityBefore = before?.quantity ?? null;
  const quantityAfter = after?.quantity ?? null;
  const inferredDelta =
    quantityBefore != null && quantityAfter != null ? quantityAfter - quantityBefore : 0;

  await StockMovement.create(
    {
      stockItemId: after?.stockItemId ?? before?.stockItemId ?? null,
      actorUserId: params.actorUserId ?? null,
      type: params.type,
      sku: after?.sku ?? before?.sku ?? params.sku ?? "",
      name: after?.name ?? before?.name ?? params.name ?? null,
      quantityBefore,
      quantityAfter,
      quantityDelta: params.quantityDelta ?? inferredDelta,
      machineIdBefore: before?.machineId ?? null,
      machineIdAfter: after?.machineId ?? null,
      processStatusBefore: before?.processStatus ?? null,
      processStatusAfter: after?.processStatus ?? null,
      isShippedBefore: before?.isShipped ?? null,
      isShippedAfter: after?.isShipped ?? null,
      shipDestinationBefore: before?.shipDestination ?? null,
      shipDestinationAfter: after?.shipDestination ?? null,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId == null ? null : String(params.referenceId),
      metadata: params.metadata ?? null,
    },
    { transaction }
  );
}
