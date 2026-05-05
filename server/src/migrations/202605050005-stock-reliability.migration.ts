import type { QueryInterface } from "sequelize";

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('DROP INDEX IF EXISTS "uniq_stock_sku_with_machine";');

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
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) key(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
      ) = ARRAY['machineId', 'sku']
  ) LOOP
    EXECUTE format('ALTER TABLE public.stock_items DROP CONSTRAINT IF EXISTS %I', r.cname);
  END LOOP;

  FOR r IN (
    SELECT i.relname::text AS index_name
    FROM pg_index ix
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE n.nspname = 'public'
      AND t.relname = 'stock_items'
      AND ix.indisunique
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(ix.indkey) key(attnum)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
      ) = ARRAY['machineId', 'sku']
  ) LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.index_name);
  END LOOP;
END $$;
  `);

  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" ADD COLUMN IF NOT EXISTS "goodsReceiptLineId" INTEGER NULL REFERENCES "goods_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" ADD COLUMN IF NOT EXISTS "trackingCode" VARCHAR(120) NULL;'
  );

  await context.sequelize.query(`
UPDATE "stock_items" si
SET "goodsReceiptLineId" = m."goodsReceiptLineId"
FROM (
  SELECT DISTINCT ON ("stockItemId")
    "stockItemId",
    "referenceId"::INTEGER AS "goodsReceiptLineId"
  FROM "stock_movements"
  WHERE "stockItemId" IS NOT NULL
    AND "referenceType" = 'goods_receipt_line'
    AND "referenceId" ~ '^[0-9]+$'
  ORDER BY "stockItemId", "createdAt" ASC
) m
JOIN "goods_receipt_lines" grl ON grl."id" = m."goodsReceiptLineId"
WHERE si."id" = m."stockItemId"
  AND si."goodsReceiptLineId" IS NULL;
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
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "stock_items_tracking_code_idx" ON "stock_items" ("trackingCode");'
  );

  await context.sequelize.query('UPDATE "stock_items" SET "quantity" = 0 WHERE "quantity" < 0;');
  await context.sequelize.query(`
UPDATE "stock_items"
SET "shippedAt" = COALESCE("shippedAt", "updatedAt"::DATE, CURRENT_DATE)
WHERE "isShipped" = true AND "shippedAt" IS NULL;
  `);
  await context.sequelize.query(`
UPDATE "stock_items"
SET "isShipped" = false,
    "shippedAt" = NULL,
    "shipDestination" = NULL
WHERE "processStatus" <> 'tamamlandi' AND "isShipped" = true;
  `);

  await context.sequelize.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_items_quantity_non_negative'
      AND conrelid = 'public.stock_items'::regclass
  ) THEN
    ALTER TABLE "stock_items"
      ADD CONSTRAINT "stock_items_quantity_non_negative" CHECK ("quantity" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_items_process_status_allowed'
      AND conrelid = 'public.stock_items'::regclass
  ) THEN
    ALTER TABLE "stock_items"
      ADD CONSTRAINT "stock_items_process_status_allowed"
      CHECK ("processStatus" IN ('bekliyor', 'isleniyor', 'tamamlandi'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_items_shipped_requires_date'
      AND conrelid = 'public.stock_items'::regclass
  ) THEN
    ALTER TABLE "stock_items"
      ADD CONSTRAINT "stock_items_shipped_requires_date"
      CHECK ("isShipped" = false OR "shippedAt" IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_items_shipped_only_completed'
      AND conrelid = 'public.stock_items'::regclass
  ) THEN
    ALTER TABLE "stock_items"
      ADD CONSTRAINT "stock_items_shipped_only_completed"
      CHECK ("processStatus" = 'tamamlandi' OR "isShipped" = false);
  END IF;
END $$;
  `);
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" DROP CONSTRAINT IF EXISTS "stock_items_shipped_only_completed";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" DROP CONSTRAINT IF EXISTS "stock_items_shipped_requires_date";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" DROP CONSTRAINT IF EXISTS "stock_items_process_status_allowed";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" DROP CONSTRAINT IF EXISTS "stock_items_quantity_non_negative";'
  );
  await context.sequelize.query('DROP INDEX IF EXISTS "stock_items_tracking_code_idx";');
  await context.sequelize.query('DROP INDEX IF EXISTS "stock_items_goods_receipt_line_id_idx";');
  await context.sequelize.query('ALTER TABLE IF EXISTS "stock_items" DROP COLUMN IF EXISTS "trackingCode";');
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "stock_items" DROP COLUMN IF EXISTS "goodsReceiptLineId";'
  );
}
