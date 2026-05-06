import "dotenv/config";
import { sequelize } from "./db";
import { validateProductionEnv } from "./config/env";
import { migrator } from "./migrations";
import { syncModels } from "./models";
import { createApp } from "./app";

const port = Number(process.env.PORT) || 4000;

async function main(): Promise<void> {
  validateProductionEnv();
  await sequelize.authenticate();
  const pendingMigrations = await migrator.pending();
  if (process.env.NODE_ENV === "production" && pendingMigrations.length > 0) {
    throw new Error(
      `Bekleyen migration var: ${pendingMigrations.map((migration) => migration.name).join(", ")}`
    );
  }
  if (process.env.NODE_ENV !== "production") {
    /* Development ortamında hızlı lokal senkronizasyon; destructive düzeltmeler migration ile yapılır. */
    await syncModels();
  }
  createApp().listen(port, "0.0.0.0", () => {
    console.log(`API http://0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Startup failed: ${message}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
