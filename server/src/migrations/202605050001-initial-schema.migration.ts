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
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_shipments_status') THEN
    CREATE TYPE "enum_shipments_status" AS ENUM ('hazirlik', 'yolda', 'teslim', 'iptal');
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
CREATE TABLE IF NOT EXISTS "stock_items" (
  "id" SERIAL PRIMARY KEY,
  "sku" VARCHAR(80) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
  "unit" VARCHAR(24) NOT NULL DEFAULT 'adet',
  "machineId" INTEGER NULL REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "processStatus" "enum_stock_items_processStatus" NOT NULL DEFAULT 'bekliyor',
  "isShipped" BOOLEAN NOT NULL DEFAULT false,
  "shippedAt" DATE NULL,
  "shipDestination" VARCHAR(200) NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `);

  await context.sequelize.query(`
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_stock_sku_with_machine"
ON "stock_items" ("sku", "machineId")
WHERE "machineId" IS NOT NULL;
  `);

  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "goods_receipt_lines" (
  "id" SERIAL PRIMARY KEY,
  "irsaliyeNo" VARCHAR(64) NOT NULL,
  "irsaliyeTarihi" DATE NOT NULL,
  "materialCode" VARCHAR(80) NOT NULL,
  "materialDescription" VARCHAR(240) NOT NULL,
  "quantity" DECIMAL(14, 3) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `);

  await context.sequelize.query(`
CREATE TABLE IF NOT EXISTS "shipments" (
  "id" SERIAL PRIMARY KEY,
  "documentNo" VARCHAR(64) NOT NULL UNIQUE,
  "shippedAt" DATE NOT NULL,
  "destination" VARCHAR(240) NOT NULL,
  "notes" TEXT NULL,
  "status" "enum_shipments_status" NOT NULL DEFAULT 'hazirlik',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `);
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query('DROP TABLE IF EXISTS "shipments" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "goods_receipt_lines" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "stock_items" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "machines" CASCADE;');
  await context.sequelize.query('DROP TABLE IF EXISTS "users" CASCADE;');
  await context.sequelize.query('DROP TYPE IF EXISTS "enum_shipments_status";');
  await context.sequelize.query('DROP TYPE IF EXISTS "enum_stock_items_processStatus";');
  await context.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
}
