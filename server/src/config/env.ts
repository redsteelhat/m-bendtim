const unsafeValues = new Set([
  "",
  "change-me",
  "change-me-now",
  "change-this-to-a-long-random-secret",
  "change-me-with-a-long-random-secret",
  "change-me-in-production-use-long-random-string",
  "dev-supabase-local-jwt-secret-change-before-prod",
]);

function requireProductionValue(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value || unsafeValues.has(value)) {
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

  if (/^https:\/\/[a-z0-9-]+\.supabase\.co/i.test(databaseUrl)) {
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
  if (seedPassword && (unsafeValues.has(seedPassword) || seedPassword === "admin123")) {
    throw new Error("Production env hatalı: SEED_ADMIN_PASSWORD güvenli bir değer olmalı");
  }
}
