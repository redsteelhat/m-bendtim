import { Router, Response } from "express";
import { Machine } from "../models/Machine";
import { requireAuth, attachUser, AuthRequest } from "../middleware/auth";
import {
  aggregateStockByMachine,
  serializeMachineWithStock,
} from "../services/machineStockStatus";
import { optionalTrimmedString, trimmedString, validateBody, z } from "../middleware/validate";

const router = Router();
router.use(requireAuth, attachUser);

const createMachineSchema = z.object({
  code: trimmedString("Makina kodu", 64),
  name: trimmedString("Seri no", 200),
});

const updateMachineSchema = z
  .object({
    code: optionalTrimmedString("Makina kodu", 64),
    name: optionalTrimmedString("Seri no", 200),
  })
  .refine((body) => Object.keys(body).length > 0, "Güncellenecek alan gerekli");

router.get("/", async (_req: AuthRequest, res: Response) => {
  const rows = await Machine.findAll({
    order: [["id", "ASC"]],
  });
  const ids = rows.map((r) => r.id);
  const agg = await aggregateStockByMachine(ids);
  res.json(rows.map((m) => serializeMachineWithStock(m, agg.get(m.id))));
});

router.get("/:id", async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const row = await Machine.findByPk(id);
  if (!row) {
    res.status(404).json({ error: "Kayıt bulunamadı" });
    return;
  }
  const agg = await aggregateStockByMachine([row.id]);
  res.json(serializeMachineWithStock(row, agg.get(row.id)));
});

router.post("/", validateBody(createMachineSchema), async (req, res: Response) => {
  const { code, name } = req.body as {
    code?: string;
    name?: string;
  };
  if (!code?.trim() || !name?.trim()) {
    res.status(400).json({ error: "Makina kodu ve seri no gerekli" });
    return;
  }
  try {
    const row = await Machine.create({
      code: code.trim(),
      name: name.trim(),
    });
    const agg = await aggregateStockByMachine([row.id]);
    res.status(201).json(serializeMachineWithStock(row, agg.get(row.id)));
  } catch {
    res.status(409).json({ error: "Makina kodu benzersiz olmalı" });
  }
});

router.patch("/:id", validateBody(updateMachineSchema), async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const row = await Machine.findByPk(id);
  if (!row) {
    res.status(404).json({ error: "Kayıt bulunamadı" });
    return;
  }
  const { code, name } = req.body as {
    code?: string;
    name?: string;
  };
  if (code !== undefined) row.code = code.trim();
  if (name !== undefined) row.name = name.trim();
  try {
    await row.save();
    const updated = await Machine.findByPk(row.id);
    if (!updated) {
      res.status(404).json({ error: "Kayıt bulunamadı" });
      return;
    }
    const agg = await aggregateStockByMachine([updated.id]);
    res.json(serializeMachineWithStock(updated, agg.get(updated.id)));
  } catch {
    res.status(409).json({ error: "Güncellenemedi" });
  }
});

router.delete("/:id", async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const n = await Machine.destroy({ where: { id } });
  if (n === 0) {
    res.status(404).json({ error: "Kayıt bulunamadı" });
    return;
  }
  res.status(204).send();
});

export default router;
