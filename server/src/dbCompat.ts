import { sequelize } from "./db";

/**
 * Eski şemalardan kalan sütun/kısıtları düzeltir (Sequelize sync her zaman taşımaz).
 */
export async function applyDatabaseCompatibilityFixes(): Promise<void> {
  if (sequelize.getDialect() !== "postgres") return;

  try {
    await sequelize.query(
      'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP CONSTRAINT IF EXISTS "goods_receipt_lines_machineId_fkey"'
    );
  } catch (err) {
    console.warn("[dbCompat] drop FK goods_receipt_lines.machineId:", err);
  }

  try {
    await sequelize.query(
      'ALTER TABLE IF EXISTS "goods_receipt_lines" DROP COLUMN IF EXISTS "machineId"'
    );
  } catch (err) {
    console.warn("[dbCompat] drop column goods_receipt_lines.machineId:", err);
  }

  try {
    await sequelize.query('DROP INDEX IF EXISTS "uniq_stock_sku_no_machine"');
  } catch (err) {
    console.warn("[dbCompat] drop index uniq_stock_sku_no_machine:", err);
  }

  /* Aynı malzeme kodundan birden fazla stok satırı: eski UNIQUE(sku) / indeks kaldır */
  try {
    await sequelize.query(
      'ALTER TABLE IF EXISTS "stock_items" DROP CONSTRAINT IF EXISTS "stock_items_sku_key"'
    );
  } catch (err) {
    console.warn("[dbCompat] drop constraint stock_items_sku_key:", err);
  }

  try {
    await sequelize.query('DROP INDEX IF EXISTS "stock_items_sku_key"');
  } catch (err) {
    console.warn("[dbCompat] drop index stock_items_sku_key:", err);
  }

  /* Sadece sku sütununu kapsayan tüm UNIQUE kısıtlar (isim farklı olabilir) */
  try {
    await sequelize.query(`
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
  } catch (err) {
    console.warn("[dbCompat] drop single-column sku unique constraints:", err);
  }

  try {
    await sequelize.query(
      'ALTER TABLE IF EXISTS "stock_items" DROP COLUMN IF EXISTS "location"'
    );
  } catch (err) {
    console.warn("[dbCompat] drop column stock_items.location:", err);
  }

  try {
    await sequelize.query(
      'ALTER TABLE IF EXISTS "stock_items" ADD COLUMN IF NOT EXISTS "shipDestination" VARCHAR(200)'
    );
  } catch (err) {
    console.warn("[dbCompat] add column stock_items.shipDestination:", err);
  }

  try {
    await sequelize.query(
      'ALTER TABLE IF EXISTS "machines" DROP CONSTRAINT IF EXISTS "machines_teamId_fkey"'
    );
  } catch (err) {
    console.warn("[dbCompat] drop FK machines.teamId:", err);
  }

  try {
    await sequelize.query('ALTER TABLE IF EXISTS "machines" DROP COLUMN IF EXISTS "teamId"');
  } catch (err) {
    console.warn("[dbCompat] drop column machines.teamId:", err);
  }

  try {
    await sequelize.query('ALTER TABLE IF EXISTS "machines" DROP COLUMN IF EXISTS "status"');
  } catch (err) {
    console.warn("[dbCompat] drop column machines.status:", err);
  }

  try {
    await sequelize.query('DROP TABLE IF EXISTS "teams" CASCADE');
  } catch (err) {
    console.warn("[dbCompat] drop table teams:", err);
  }
}
