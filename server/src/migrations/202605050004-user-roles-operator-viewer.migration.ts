import type { QueryInterface } from "sequelize";

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_users_role' AND e.enumlabel = 'operator'
  ) THEN
    ALTER TYPE "enum_users_role" ADD VALUE 'operator';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_users_role' AND e.enumlabel = 'viewer'
  ) THEN
    ALTER TYPE "enum_users_role" ADD VALUE 'viewer';
  END IF;
END $$;
  `);

  await context.sequelize.query(`
UPDATE "users"
SET "role" = 'operator'
WHERE "role"::text = 'editor';
  `);

  await context.sequelize.query(`
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'operator';
  `);
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_users_role' AND e.enumlabel = 'editor'
  ) THEN
    ALTER TYPE "enum_users_role" ADD VALUE 'editor';
  END IF;
END $$;
  `);

  await context.sequelize.query(`
UPDATE "users"
SET "role" = 'editor'
WHERE "role"::text = 'operator';
  `);

  await context.sequelize.query(`
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'editor';
  `);
}
