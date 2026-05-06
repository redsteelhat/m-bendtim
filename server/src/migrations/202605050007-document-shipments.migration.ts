import type { QueryInterface } from "sequelize";

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" ADD COLUMN IF NOT EXISTS "shipmentNo" VARCHAR(64);'
  );

  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'documentNo'
  ) THEN
    UPDATE "shipments"
    SET "shipmentNo" = COALESCE(NULLIF("shipmentNo", ''), NULLIF("documentNo", ''), 'SVK-LEGACY-' || "id"::TEXT)
    WHERE "shipmentNo" IS NULL OR "shipmentNo" = '';
  ELSE
    UPDATE "shipments"
    SET "shipmentNo" = COALESCE(NULLIF("shipmentNo", ''), 'SVK-LEGACY-' || "id"::TEXT)
    WHERE "shipmentNo" IS NULL OR "shipmentNo" = '';
  END IF;
END $$;
  `);

  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'status'
  ) THEN
    ALTER TABLE "shipments" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "shipments" ALTER COLUMN "status" TYPE VARCHAR(32) USING
      CASE
        WHEN "status"::TEXT IN ('yolda', 'teslim') THEN 'sevk_edildi'
        WHEN "status"::TEXT IN ('hazirlik', 'iptal', 'sevk_edildi') THEN "status"::TEXT
        ELSE 'sevk_edildi'
      END;
    ALTER TABLE "shipments" ALTER COLUMN "status" SET DEFAULT 'sevk_edildi';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'documentNo'
  ) THEN
    ALTER TABLE "shipments" ALTER COLUMN "documentNo" DROP NOT NULL;
  END IF;
END $$;
  `);

  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" ALTER COLUMN "shipmentNo" SET NOT NULL;'
  );
  await context.sequelize.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS "shipments_shipment_no_unique" ON "shipments" ("shipmentNo");'
  );

  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" ADD COLUMN IF NOT EXISTS "createdByUserId" INTEGER NULL;'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ NULL;'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" ADD COLUMN IF NOT EXISTS "cancelledByUserId" INTEGER NULL;'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" ADD COLUMN IF NOT EXISTS "cancelReason" VARCHAR(500) NULL;'
  );

  await context.sequelize.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipments_created_by_user_id_fkey'
      AND conrelid = 'public.shipments'::regclass
  ) THEN
    ALTER TABLE "shipments"
      ADD CONSTRAINT "shipments_created_by_user_id_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipments_cancelled_by_user_id_fkey'
      AND conrelid = 'public.shipments'::regclass
  ) THEN
    ALTER TABLE "shipments"
      ADD CONSTRAINT "shipments_cancelled_by_user_id_fkey"
      FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipments_status_allowed'
      AND conrelid = 'public.shipments'::regclass
  ) THEN
    ALTER TABLE "shipments"
      ADD CONSTRAINT "shipments_status_allowed"
      CHECK ("status" IN ('hazirlik', 'sevk_edildi', 'iptal'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipments_shipped_date_required'
      AND conrelid = 'public.shipments'::regclass
  ) THEN
    ALTER TABLE "shipments"
      ADD CONSTRAINT "shipments_shipped_date_required"
      CHECK ("status" <> 'sevk_edildi' OR "shippedAt" IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipments_cancel_fields_consistent'
      AND conrelid = 'public.shipments'::regclass
  ) THEN
    ALTER TABLE "shipments"
      ADD CONSTRAINT "shipments_cancel_fields_consistent"
      CHECK (
        "status" <> 'iptal'
        OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL AND length(trim("cancelReason")) > 0)
      );
  END IF;
END $$;
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
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP CONSTRAINT IF EXISTS "shipments_cancel_fields_consistent";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP CONSTRAINT IF EXISTS "shipments_shipped_date_required";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP CONSTRAINT IF EXISTS "shipments_status_allowed";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP CONSTRAINT IF EXISTS "shipments_cancelled_by_user_id_fkey";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP CONSTRAINT IF EXISTS "shipments_created_by_user_id_fkey";'
  );
  await context.sequelize.query('DROP INDEX IF EXISTS "shipments_shipment_no_unique";');
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP COLUMN IF EXISTS "cancelReason";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP COLUMN IF EXISTS "cancelledByUserId";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP COLUMN IF EXISTS "cancelledAt";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP COLUMN IF EXISTS "createdByUserId";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "shipments" DROP COLUMN IF EXISTS "shipmentNo";'
  );
}
