import { Sequelize } from "sequelize";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL tanımlı değil");
}

const useSsl =
  process.env.DB_SSL === "true" ||
  /sslmode=require/i.test(databaseUrl) ||
  /supabase\.co/i.test(databaseUrl);
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === "true";
if (useSsl && !rejectUnauthorized) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  dialectOptions: useSsl
    ? {
        // Supabase pooler + managed cert zinciri için local/prod ortamda esnek SSL
        sslmode: rejectUnauthorized ? "verify-full" : "no-verify",
        ssl: {
          require: true,
          rejectUnauthorized,
        },
      }
    : undefined,
});
