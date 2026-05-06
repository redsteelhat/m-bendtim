import type { QueryInterface } from "sequelize";

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_role') THEN
    CREATE TYPE "enum_users_role" AS ENUM ('admin', 'operator', 'viewer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_stock_items_processStatus') THEN
    CREATE TYPE "enum_stock_items_processStatus" AS ENUM ('bekliyor', 'isleniyor', 'tamamlandi');
  END IF;
END $$;
  `);

  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "users" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "passwordHash" VARCHAR(255) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "role" "enum_users_role" NOT NULL DEFAULT 'operator',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `);

  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "machines" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(64) NOT NULL UNIQUE,
  "name" VARCHAR(200) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `);

  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "goods_receipt_lines" (
  "id" SERIAL PRIMARY KEY,
  "irsaliyeNo" VARCHAR(64) NOT NULL,
  "irsaliyeTarihi" DATE NOT NULL,
  "materialCode" VARCHAR(80) NOT NULL,
  "materialDescription" VARCHAR(240) NOT NULL,
  "quantity" DECIMAL(14, 3) NOT NULL,
  "isCancelled" BOOLEAN NOT NULL DEFAULT false,
  "cancelledAt" TIMESTAMPTZ NULL,
  "cancelledByUserId" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "cancelReason" VARCHAR(500) NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `);

  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "stock_items" (
  "id" SERIAL PRIMARY KEY,
  "sku" VARCHAR(80) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
  "unit" VARCHAR(24) NOT NULL DEFAULT 'adet',
  "machineId" INTEGER NULL REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "goodsReceiptLineId" INTEGER NULL REFERENCES "goods_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "trackingCode" VARCHAR(120) NULL,
  "processStatus" "enum_stock_items_processStatus" NOT NULL DEFAULT 'bekliyor',
  "isShipped" BOOLEAN NOT NULL DEFAULT false,
  "shippedAt" DATE NULL,
  "shipDestination" VARCHAR(200) NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "stock_items_quantity_non_negative" CHECK ("quantity" >= 0),
  CONSTRAINT "stock_items_shipped_requires_date" CHECK ("isShipped" = false OR "shippedAt" IS NOT NULL),
  CONSTRAINT "stock_items_shipped_only_completed" CHECK ("processStatus" = 'tamamlandi' OR "isShipped" = false)
);
  `);

  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "stock_items_sku_idx" ON "stock_items" ("sku");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "stock_items_machine_id_idx" ON "stock_items" ("machineId");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "stock_items_goods_receipt_line_id_idx" ON "stock_items" ("goodsReceiptLineId");'
  );

  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "shipments" (
  "id" SERIAL PRIMARY KEY,
  "shipmentNo" VARCHAR(64) NOT NULL UNIQUE,
  "shippedAt" DATE NOT NULL,
  "destination" VARCHAR(240) NOT NULL,
  "notes" TEXT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'sevk_edildi',
  "createdByUserId" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "cancelledAt" TIMESTAMPTZ NULL,
  "cancelledByUserId" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "cancelReason" VARCHAR(500) NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "shipments_status_allowed" CHECK ("status" IN ('hazirlik', 'sevk_edildi', 'iptal')),
  CONSTRAINT "shipments_shipped_date_required" CHECK ("status" <> 'sevk_edildi' OR "shippedAt" IS NOT NULL),
  CONSTRAINT "shipments_cancel_fields_consistent" CHECK (
    "status" <> 'iptal'
    OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL AND length(trim("cancelReason")) > 0)
  )
);
  `);

  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "shipment_items" (
  "id" SERIAL PRIMARY KEY,
  "shipmentId" INTEGER NOT NULL REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "stockItemId" INTEGER NOT NULL REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "shipment_items_shipment_stock_unique" UNIQUE ("shipmentId", "stockItemId")
);
  `);

  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "shipment_items_shipment_id_idx" ON "shipment_items" ("shipmentId");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "shipment_items_stock_item_id_idx" ON "shipment_items" ("stockItemId");'
  );
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('DROP TABLE IF EXISTS "shipment_items" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "shipments" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "stock_items" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "goods_receipt_lines" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "machines" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "users" CASCADE;');
  await context.sequelize.query('DROP TYPE IF EXISTS "enum_stock_items_processStatus";');
  await context.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
}
