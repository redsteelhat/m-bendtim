import type { QueryInterface } from "sequelize";

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" SERIAL PRIMARY KEY,
  "actorUserId" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "action" VARCHAR(80) NOT NULL,
  "entityType" VARCHAR(80) NOT NULL,
  "entityId" VARCHAR(80) NULL,
  "metadata" JSONB NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `);

  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "audit_logs_actor_user_id" ON "audit_logs" ("actorUserId");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "audit_logs_entity" ON "audit_logs" ("entityType", "entityId");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "audit_logs_created_at" ON "audit_logs" ("createdAt");'
  );

  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" SERIAL PRIMARY KEY,
  "stockItemId" INTEGER NULL REFERENCES "stock_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "actorUserId" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "type" VARCHAR(40) NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "name" VARCHAR(200) NULL,
  "quantityBefore" DECIMAL(14, 3) NULL,
  "quantityAfter" DECIMAL(14, 3) NULL,
  "quantityDelta" DECIMAL(14, 3) NOT NULL,
  "machineIdBefore" INTEGER NULL,
  "machineIdAfter" INTEGER NULL,
  "processStatusBefore" VARCHAR(40) NULL,
  "processStatusAfter" VARCHAR(40) NULL,
  "isShippedBefore" BOOLEAN NULL,
  "isShippedAfter" BOOLEAN NULL,
  "shipDestinationBefore" VARCHAR(200) NULL,
  "shipDestinationAfter" VARCHAR(200) NULL,
  "referenceType" VARCHAR(80) NULL,
  "referenceId" VARCHAR(80) NULL,
  "metadata" JSONB NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `);

  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "stock_movements_stock_item_id" ON "stock_movements" ("stockItemId");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "stock_movements_actor_user_id" ON "stock_movements" ("actorUserId");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "stock_movements_sku" ON "stock_movements" ("sku");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "stock_movements_type" ON "stock_movements" ("type");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "stock_movements_created_at" ON "stock_movements" ("createdAt");'
  );
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('DROP TABLE IF EXISTS "stock_movements" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "audit_logs" CASCADE;');
}
