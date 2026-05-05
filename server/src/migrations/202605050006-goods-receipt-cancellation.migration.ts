import type { QueryInterface } from "sequelize";

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "isCancelled" BOOLEAN NOT NULL DEFAULT false;'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ NULL;'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "cancelledByUserId" INTEGER NULL;'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "cancelReason" VARCHAR(500) NULL;'
  );

  await context.sequelize.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'goods_receipt_lines_cancelled_by_user_id_fkey'
      AND conrelid = 'public.goods_receipt_lines'::regclass
  ) THEN
    ALTER TABLE "goods_receipt_lines"
      ADD CONSTRAINT "goods_receipt_lines_cancelled_by_user_id_fkey"
      FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'goods_receipt_lines_cancel_fields_consistent'
      AND conrelid = 'public.goods_receipt_lines'::regclass
  ) THEN
    ALTER TABLE "goods_receipt_lines"
      ADD CONSTRAINT "goods_receipt_lines_cancel_fields_consistent"
      CHECK (
        "isCancelled" = false
        OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL AND length(trim("cancelReason")) > 0)
      );
  END IF;
END $$;
  `);

  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "goods_receipt_lines_is_cancelled_idx" ON "goods_receipt_lines" ("isCancelled");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "goods_receipt_lines_cancelled_by_user_id_idx" ON "goods_receipt_lines" ("cancelledByUserId");'
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
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP CONSTRAINT IF EXISTS "goods_receipt_lines_cancel_fields_consistent";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP CONSTRAINT IF EXISTS "goods_receipt_lines_cancelled_by_user_id_fkey";'
  );
  await context.sequelize.query('DROP INDEX IF EXISTS "goods_receipt_lines_cancelled_by_user_id_idx";');
  await context.sequelize.query('DROP INDEX IF EXISTS "goods_receipt_lines_is_cancelled_idx";');
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP COLUMN IF EXISTS "cancelReason";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP COLUMN IF EXISTS "cancelledByUserId";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP COLUMN IF EXISTS "cancelledAt";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP COLUMN IF EXISTS "isCancelled";'
  );
}
