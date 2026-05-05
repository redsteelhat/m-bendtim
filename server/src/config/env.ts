const unsafeValues = new Set([
  "",
  "change-me",
  "change-me-now",
  "change-me-secure-password",
  "change-me-with-32-plus-random-chars",
  "change-this-to-a-long-random-secret",
  "change-me-with-a-long-random-secret",
  "change-me-in-production-use-long-random-string",
  "dev-supabase-local-jwt-secret-change-before-prod",
  "admin123",
]);

function requireProductionValue(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value || unsafeValues.has(value) || value.toLowerCase().startsWith("change-me")) {
    throw new Error(`Production env hatalı: ${name} güvenli bir değer olmalı`);
  }
  return value;
}

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const databaseUrl = requireProductionValue("DATABASE_URL");
  const jwtSecret = requireProductionValue("JWT_SECRET");
  const corsOrigin = requireProductionValue("CORS_ORIGIN");

  if (databaseUrl.includes("PROJECT_REF") || databaseUrl.includes("ENCODED_PASSWORD")) {
    throw new Error("Production env hatalı: DATABASE_URL placeholder içeriyor");
  }

  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("Production env hatalı: DATABASE_URL geçerli bir URL olmalı");
  }

  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
    throw new Error("Production env hatalı: DATABASE_URL PostgreSQL bağlantı string'i olmalı");
  }

  if (parsedDatabaseUrl.protocol.startsWith("http")) {
    throw new Error("Production env hatalı: DATABASE_URL Supabase API URL'i değil Postgres URL'i olmalı");
  }

  if (jwtSecret.length < 32) {
    throw new Error("Production env hatalı: JWT_SECRET en az 32 karakter olmalı");
  }

  if (corsOrigin.split(",").some((origin) => origin.trim() === "*")) {
    throw new Error("Production env hatalı: CORS_ORIGIN production ortamında * olamaz");
  }

  if (process.env.DB_SSL !== "true") {
    throw new Error("Production env hatalı: DB_SSL=true olmalı");
  }

  const seedPassword = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (
    seedPassword &&
    (unsafeValues.has(seedPassword) ||
      seedPassword.toLowerCase().startsWith("change-me") ||
      seedPassword.length < 10)
  ) {
    throw new Error("Production env hatalı: SEED_ADMIN_PASSWORD güvenli bir değer olmalı");
  }
}
