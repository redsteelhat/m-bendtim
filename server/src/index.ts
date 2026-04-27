import "dotenv/config";
import express from "express";
import cors from "cors";
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

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/machines", machinesRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/mal-kabul", malKabulRoutes);
app.use("/api/shipments", shipmentsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportsRoutes);

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
