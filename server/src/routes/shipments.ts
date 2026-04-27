import { Router, Response } from "express";
import { Shipment } from "../models/Shipment";
import { requireAuth, attachUser, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth, attachUser);

router.get("/", async (_req: AuthRequest, res: Response) => {
  const rows = await Shipment.findAll({ order: [["shippedAt", "DESC"], ["id", "DESC"]] });
  res.json(rows);
});

router.get("/:id", async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const row = await Shipment.findByPk(id);
  if (!row) {
    res.status(404).json({ error: "Kayıt bulunamadı" });
    return;
  }
  res.json(row);
});

router.post("/", async (req, res: Response) => {
  const { documentNo, shippedAt, destination, notes, status } = req.body as {
    documentNo?: string;
    shippedAt?: string;
    destination?: string;
    notes?: string | null;
    status?: string;
  };
  if (!documentNo?.trim() || !shippedAt || !destination?.trim()) {
    res.status(400).json({ error: "Belge no, sevk tarihi ve varış/hedef gerekli" });
    return;
  }
  const allowed = ["hazirlik", "yolda", "teslim", "iptal"];
  const st = allowed.includes(String(status)) ? status : "hazirlik";
  try {
    const row = await Shipment.create({
      documentNo: documentNo.trim(),
      shippedAt: shippedAt as unknown as Date,
      destination: destination.trim(),
      notes: notes?.trim() || null,
      status: st as "hazirlik" | "yolda" | "teslim" | "iptal",
    });
    res.status(201).json(row);
  } catch {
    res.status(409).json({ error: "Belge no benzersiz olmalı" });
  }
});

router.patch("/:id", async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const row = await Shipment.findByPk(id);
  if (!row) {
    res.status(404).json({ error: "Kayıt bulunamadı" });
    return;
  }
  const { documentNo, shippedAt, destination, notes, status } = req.body as {
    documentNo?: string;
    shippedAt?: string;
    destination?: string;
    notes?: string | null;
    status?: string;
  };
  if (documentNo !== undefined) row.documentNo = documentNo.trim();
  if (shippedAt !== undefined) row.shippedAt = shippedAt as unknown as Date;
  if (destination !== undefined) row.destination = destination.trim();
  if (notes !== undefined) row.notes = notes === null || notes === "" ? null : String(notes).trim();
  if (status !== undefined) {
    const allowed = ["hazirlik", "yolda", "teslim", "iptal"];
    if (allowed.includes(String(status))) row.status = status as "hazirlik" | "yolda" | "teslim" | "iptal";
  }
  try {
    await row.save();
    res.json(row);
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
  const n = await Shipment.destroy({ where: { id } });
  if (n === 0) {
    res.status(404).json({ error: "Kayıt bulunamadı" });
    return;
  }
  res.status(204).send();
});

export default router;
