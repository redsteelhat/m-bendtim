import type { Transaction } from "sequelize";
import { AuditLog } from "../models/AuditLog";

export async function recordAudit(
  params: {
    actorUserId?: number | null;
    action: string;
    entityType: string;
    entityId?: string | number | null;
    metadata?: Record<string, unknown> | null;
  },
  transaction?: Transaction
): Promise<void> {
  await AuditLog.create(
    {
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId == null ? null : String(params.entityId),
      metadata: params.metadata ?? null,
    },
    { transaction }
  );
}
