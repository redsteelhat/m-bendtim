import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { sequelize } from "./db";
import { validateProductionEnv } from "./config/env";
import { migrator } from "./migrations";
import { syncModels } from "./models";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import machinesRoutes from "./routes/machines";
import stockRoutes from "./routes/stock";
import malKabulRoutes from "./routes/malKabul";
import shipmentsRoutes from "./routes/shipments";
import dashboardRoutes from "./routes/dashboard";
import reportsRoutes from "./routes/reports";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: true,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/ready", async (_req, res) => {
  try {
    await sequelize.authenticate();
    const pending = await migrator.pending();
    res.status(pending.length === 0 ? 200 : 503).json({
      ok: pending.length === 0,
      database: "ok",
      migrations: {
        pending: pending.map((migration) => migration.name),
      },
    });
  } catch {
    res.status(503).json({
      ok: false,
      database: "unavailable",
      migrations: { pending: [] },
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/machines", machinesRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/mal-kabul", malKabulRoutes);
app.use("/api/shipments", shipmentsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportsRoutes);

const clientDistPath = path.resolve(__dirname, "../../client/dist");
const clientIndexPath = path.join(clientDistPath, "index.html");
const hasClientBuild = fs.existsSync(clientIndexPath);

if (hasClientBuild) {
  app.use(express.static(clientDistPath));

  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(clientIndexPath);
  });
}

app.use("/api", notFoundHandler);
app.use(errorHandler);

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
  app.listen(port, "0.0.0.0", () => {
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
