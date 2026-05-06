import type { QueryInterface } from "sequelize";

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "goods_receipt_documents" (
  "id" SERIAL PRIMARY KEY,
  "documentNo" VARCHAR(64) NOT NULL UNIQUE,
  "documentDate" DATE NOT NULL,
  "source" VARCHAR(24) NOT NULL DEFAULT 'manual',
  "sourceFileName" VARCHAR(255) NULL,
  "sourceFileSha256" VARCHAR(64) NULL,
  "createdByUserId" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "rawParseJson" JSONB NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "goods_receipt_documents_source_allowed" CHECK ("source" IN ('manual', 'pdf'))
);
  `);

  await context.sequelize.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipt_documents_document_no_unique" ON "goods_receipt_documents" ("documentNo");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "goods_receipt_documents_document_date_idx" ON "goods_receipt_documents" ("documentDate");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "goods_receipt_documents_created_by_user_id_idx" ON "goods_receipt_documents" ("createdByUserId");'
  );

  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "documentId" INTEGER NULL;'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "rowNo" INTEGER NULL;'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "unit" VARCHAR(24) NOT NULL DEFAULT \'Adet\';'
  );

  await context.sequelize.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'goods_receipt_lines_document_id_fkey'
      AND conrelid = 'public.goods_receipt_lines'::regclass
  ) THEN
    ALTER TABLE "goods_receipt_lines"
      ADD CONSTRAINT "goods_receipt_lines_document_id_fkey"
      FOREIGN KEY ("documentId") REFERENCES "goods_receipt_documents"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
  `);

  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "goods_receipt_lines_document_id_idx" ON "goods_receipt_lines" ("documentId");'
  );
  await context.sequelize.query(
    'CREATE INDEX IF NOT EXISTS "goods_receipt_lines_irsaliye_no_idx" ON "goods_receipt_lines" ("irsaliyeNo");'
  );
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP CONSTRAINT IF EXISTS "goods_receipt_lines_document_id_fkey";'
  );
  await context.sequelize.query('DROP INDEX IF EXISTS "goods_receipt_lines_irsaliye_no_idx";');
  await context.sequelize.query('DROP INDEX IF EXISTS "goods_receipt_lines_document_id_idx";');
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP COLUMN IF EXISTS "unit";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP COLUMN IF EXISTS "rowNo";'
  );
  await context.sequelize.query(
    'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP COLUMN IF EXISTS "documentId";'
  );
  await context.sequelize.query('DROP TABLE IF EXISTS "goods_receipt_documents" CASCADE;');
}
