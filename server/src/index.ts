import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { sequelize } from "./db";
import { applyDatabaseCompatibilityFixes } from "./dbCompat";
import { syncModels } from "./models";
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

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: true,
  })
);
app.use(express.json({ limit: "128kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
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

async function main(): Promise<void> {
  await sequelize.authenticate();
  /* Önce eski UNIQUE(sku) kalksın; sync(alter) bazen kısıtı geri getirebilir, sonra tekrar temizlenir */
  await applyDatabaseCompatibilityFixes();
  await syncModels();
  await applyDatabaseCompatibilityFixes();
  app.listen(port, "0.0.0.0", () => {
    console.log(`API http://0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
