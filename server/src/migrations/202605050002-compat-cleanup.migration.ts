import type { QueryInterface } from "sequelize";

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'goods_receipt_lines'
      AND column_name = 'machineId'
  ) THEN
    CREATE TABLE IF NOT EXISTS "legacy_goods_receipt_line_machine_ids" (
      "goodsReceiptLineId" INTEGER PRIMARY KEY,
      "machineId" INTEGER,
      "preservedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO "legacy_goods_receipt_line_machine_ids" ("goodsReceiptLineId", "machineId")
    SELECT "id", "machineId" FROM "goods_receipt_lines"
    WHERE "machineId" IS NOT NULL
    ON CONFLICT ("goodsReceiptLineId") DO UPDATE
      SET "machineId" = EXCLUDED."machineId",
          "preservedAt" = NOW();
  END IF;
END $$;
  `);

  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP CONSTRAINT IF EXISTS "goods_receipt_lines_machineId_fkey"'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP COLUMN IF EXISTS "machineId"'
  );
  await context.sequelize.query('DROP INDEX IF EXISTS "uniq_stock_sku_no_machine"');
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" DROP CONSTRAINT IF EXISTS "stock_items_sku_key"'
  );
  await context.sequelize.query('DROP INDEX IF EXISTS "stock_items_sku_key"');

  await context.sequelize.query(`
DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT c.conname::text AS cname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'stock_items'
      AND c.contype = 'u'
      AND array_length(c.conkey, 1) = 1
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1] AND a.attname = 'sku'
      )
  ) LOOP
    EXECUTE format('ALTER TABLE public.stock_items DROP CONSTRAINT IF EXISTS %I', r.cname);
  END LOOP;
END $$;
  `);

  await context.sequelize.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_items'
      AND column_name = 'location'
  ) THEN
    CREATE TABLE IF NOT EXISTS "legacy_stock_item_locations" (
      "stockItemId" INTEGER PRIMARY KEY,
      "location" TEXT,
      "preservedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO "legacy_stock_item_locations" ("stockItemId", "location")
    SELECT "id", "location"::TEXT FROM "stock_items"
    WHERE "location" IS NOT NULL
    ON CONFLICT ("stockItemId") DO UPDATE
      SET "location" = EXCLUDED."location",
          "preservedAt" = NOW();
  END IF;
END $$;
  `);

  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" DROP COLUMN IF EXISTS "location"'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" ADD COLUMN IF NOT EXISTS "shipDestination" VARCHAR(200)'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "machines" DROP CONSTRAINT IF EXISTS "machines_teamId_fkey"'
  );

  await context.sequelize.query(`
DO $$
DECLARE
  has_team_id boolean;
  has_status boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'machines'
      AND column_name = 'teamId'
  ) INTO has_team_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'machines'
      AND column_name = 'status'
  ) INTO has_status;

  IF has_team_id OR has_status THEN
    CREATE TABLE IF NOT EXISTS "legacy_machine_fields" (
      "machineId" INTEGER PRIMARY KEY,
      "teamId" INTEGER,
      "status" TEXT,
      "preservedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    EXECUTE format(
      'INSERT INTO "legacy_machine_fields" ("machineId", "teamId", "status")
       SELECT "id", %s, %s FROM "machines"
       ON CONFLICT ("machineId") DO UPDATE
         SET "teamId" = EXCLUDED."teamId",
             "status" = EXCLUDED."status",
             "preservedAt" = NOW()',
      CASE WHEN has_team_id THEN '"teamId"::INTEGER' ELSE 'NULL::INTEGER' END,
      CASE WHEN has_status THEN '"status"::TEXT' ELSE 'NULL::TEXT' END
    );
  END IF;
END $$;
  `);

  await context.sequelize.query('ALTER TABLE IF EXISTS "machines" DROP COLUMN IF EXISTS "teamId"');
  await context.sequelize.query('ALTER TABLE IF EXISTS "machines" DROP COLUMN IF EXISTS "status"');

  await context.sequelize.query(`
DO $$
BEGIN
  IF to_regclass('public.teams') IS NOT NULL
     AND to_regclass('public.legacy_teams') IS NULL THEN
    ALTER TABLE "teams" RENAME TO "legacy_teams";
  END IF;
END $$;
  `);
}

export async function down(): Promise<void> {
  // Compatibility cleanup intentionally has no automatic rollback.
}
