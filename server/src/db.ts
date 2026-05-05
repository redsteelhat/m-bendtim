import { Sequelize } from "sequelize";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL tanımlı değil");
}

function connectionUrlForSequelize(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === "true";
  if (!rejectUnauthorized) {
    /*
     * pg-connection-string, sslmode=require değerini bazı sürümlerde sertifika
     * doğrulamalı SSL'e çevirebiliyor. Supabase pooler'da esnek SSL için SSL'i
     * Sequelize dialectOptions üzerinden yönetiyoruz.
     */
    parsed.searchParams.delete("sslmode");
  }
  return parsed.toString();
}

const useSsl =
  process.env.DB_SSL === "true" ||
  /sslmode=require/i.test(databaseUrl) ||
  /supabase\.co/i.test(databaseUrl);
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === "true";
const connectionUrl = connectionUrlForSequelize(databaseUrl);

export const sequelize = new Sequelize(connectionUrl, {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  dialectOptions: useSsl
    ? {
        // Supabase pooler + managed cert zinciri için local/prod ortamda esnek SSL
        ssl: {
          require: true,
          rejectUnauthorized,
        },
      }
    : undefined,
});
