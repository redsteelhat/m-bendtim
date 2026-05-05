import { Router, Response } from "express";
import { GoodsReceiptLine } from "../models/GoodsReceiptLine";
import { sequelize } from "../db";
import { dateOnlyLocal } from "../dateOnlyLocal";
import { requireAuth, attachUser, AuthRequest } from "../middleware/auth";
import {
  decrementStockForMalKabul,
  incrementStockForMalKabul,
} from "../services/malKabulStock";
import { recordAudit } from "../services/audit";
import {
  optionalTrimmedString,
  positiveQuantity,
  trimmedString,
  validateBody,
  z,
} from "../middleware/validate";

const router = Router();
router.use(requireAuth, attachUser);

const malKabulLineSchema = z
  .object({
    materialCode: trimmedString("Malzeme kodu", 80),
    productName: optionalTrimmedString("Ürün adı", 200),
    materialDescription: optionalTrimmedString("Ürün adı", 240),
    quantity: positiveQuantity,
  })
  .refine(
    (line) => Boolean(line.productName || line.materialDescription),
    "Ürün adı gerekli"
  );

const batchMalKabulSchema = z.object({
  irsaliyeNo: trimmedString("İrsaliye no", 64),
  lines: z.array(malKabulLineSchema).min(1, "En az bir malzeme satırı gerekli"),
});

const createMalKabulSchema = z
  .object({
    irsaliyeNo: trimmedString("İrsaliye no", 64),
    materialCode: trimmedString("Malzeme kodu", 80),
    materialDescription: optionalTrimmedString("Ürün adı", 240),
    productName: optionalTrimmedString("Ürün adı", 200),
    quantity: positiveQuantity,
  })
  .refine(
    (body) => Boolean(body.productName || body.materialDescription),
    "Ürün adı gerekli"
  );

router.get("/", async (_req: AuthRequest, res: Response) => {
  const rows = await GoodsReceiptLine.findAll({
    order: [
      ["irsaliyeTarihi", "DESC"],
      ["id", "DESC"],
    ],
  });
  res.json(rows);
});

/** Tek irsaliye altında birden fazla malzeme; tek işlemde atomik kayıt + stok. */
router.post("/batch", validateBody(batchMalKabulSchema), async (req: AuthRequest, res: Response) => {
  const { irsaliyeNo, lines } = req.body as {
    irsaliyeNo?: string;
    lines?: Array<{
      materialCode?: string;
      /** Ürün adı (stok `name` ve satır `materialDescription`) */
      productName?: string;
      materialDescription?: string;
      quantity?: number | string;
    }>;
  };

  if (!irsaliyeNo?.trim()) {
    res.status(400).json({ error: "İrsaliye no gerekli" });
    return;
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: "En az bir malzeme satırı gerekli" });
    return;
  }

  type Norm = { code: string; descStored: string; stockName: string; adet: number };
  const normalized: Norm[] = [];

  for (let i = 0; i < lines.length; i++) {
    const row = lines[i];
    const codeRaw = row?.materialCode?.trim() ?? "";
    if (!codeRaw) {
      continue;
    }
    const qty = Number(row?.quantity);
    const adet = Math.floor(qty);
    if (!Number.isFinite(qty) || adet < 1) {
      res.status(400).json({ error: `«${codeRaw}» için adet en az 1 tam sayı olmalı` });
      return;
    }
    const code = codeRaw;
    const nameRaw =
      row?.productName != null
        ? String(row.productName)
        : row?.materialDescription != null
          ? String(row.materialDescription)
          : "";
    const descTrim = nameRaw.trim();
    if (!descTrim) {
      res.status(400).json({ error: `«${code}» için ürün adı gerekli` });
      return;
    }
    const descStored = descTrim.slice(0, 240);
    const stockName = descTrim.slice(0, 200);
    normalized.push({ code, descStored, stockName, adet });
  }

  if (normalized.length === 0) {
    res.status(400).json({ error: "En az bir malzeme kodu girin" });
    return;
  }

  try {
    const islemTarihi = dateOnlyLocal();
    const createdLines = await sequelize.transaction(async (transaction) => {
      const out: GoodsReceiptLine[] = [];
      for (const n of normalized) {
        const line = await GoodsReceiptLine.create(
          {
            irsaliyeNo: irsaliyeNo.trim(),
            irsaliyeTarihi: islemTarihi as unknown as Date,
            materialCode: n.code,
            materialDescription: n.descStored,
            quantity: n.adet,
          },
          { transaction }
        );
        await incrementStockForMalKabul(
          {
            sku: n.code,
            name: n.stockName,
            qty: n.adet,
            machineId: null,
            actorUserId: req.sessionUser?.id,
            referenceId: line.id,
          },
          transaction
        );
        await recordAudit(
          {
            actorUserId: req.sessionUser?.id,
            action: "mal_kabul.create",
            entityType: "goods_receipt_line",
            entityId: line.id,
            metadata: {
              irsaliyeNo: irsaliyeNo.trim(),
              materialCode: n.code,
              quantity: n.adet,
            },
          },
          transaction
        );
        const full = await GoodsReceiptLine.findByPk(line.id, { transaction });
        if (full) out.push(full);
      }
      return out;
    });

    res.status(201).json({ lines: createdLines });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_QTY") {
      res.status(400).json({ error: "Miktar en az 1 tam adet olmalı" });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Kayıt veya stok güncellemesi başarısız" });
  }
});

router.get("/:id", async (req, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const row = await GoodsReceiptLine.findByPk(id);
  if (!row) {
    res.status(404).json({ error: "Kayıt bulunamadı" });
    return;
  }
  res.json(row);
});

router.post("/", validateBody(createMalKabulSchema), async (req: AuthRequest, res: Response) => {
  const { irsaliyeNo, materialCode, materialDescription, productName, quantity } =
    req.body as {
      irsaliyeNo?: string;
      materialCode?: string;
      materialDescription?: string;
      productName?: string;
      quantity?: number | string;
    };

  if (!irsaliyeNo?.trim()) {
    res.status(400).json({ error: "İrsaliye no gerekli" });
    return;
  }
  if (!materialCode?.trim()) {
    res.status(400).json({ error: "Malzeme kodu gerekli" });
    return;
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    res.status(400).json({ error: "Miktar sıfırdan büyük olmalı" });
    return;
  }
  const adet = Math.floor(qty);
  if (adet < 1) {
    res.status(400).json({ error: "Miktar en az 1 tam adet olmalı" });
    return;
  }

  const code = materialCode.trim();
  const nameRaw =
    productName != null
      ? String(productName)
      : materialDescription != null
        ? String(materialDescription)
        : "";
  const descTrim = nameRaw.trim();
  if (!descTrim) {
    res.status(400).json({ error: "Ürün adı gerekli" });
    return;
  }
  const descStored = descTrim.slice(0, 240);
  const stockName = descTrim.slice(0, 200);

  try {
    const islemTarihi = dateOnlyLocal();
    const created = await sequelize.transaction(async (transaction) => {
      const line = await GoodsReceiptLine.create(
        {
          irsaliyeNo: irsaliyeNo.trim(),
          irsaliyeTarihi: islemTarihi as unknown as Date,
          materialCode: code,
          materialDescription: descStored,
          quantity: adet,
        },
        { transaction }
      );

      await incrementStockForMalKabul(
        {
          sku: code,
          name: stockName,
          qty: adet,
          machineId: null,
          actorUserId: req.sessionUser?.id,
          referenceId: line.id,
        },
        transaction
      );
      await recordAudit(
        {
          actorUserId: req.sessionUser?.id,
          action: "mal_kabul.create",
          entityType: "goods_receipt_line",
          entityId: line.id,
          metadata: {
            irsaliyeNo: irsaliyeNo.trim(),
            materialCode: code,
            quantity: adet,
          },
        },
        transaction
      );

      return GoodsReceiptLine.findByPk(line.id, { transaction });
    });

    res.status(201).json(created);
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_QTY") {
      res.status(400).json({ error: "Miktar en az 1 tam adet olmalı" });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Kayıt veya stok güncellemesi başarısız" });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }

  try {
    await sequelize.transaction(async (transaction) => {
      const line = await GoodsReceiptLine.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!line) {
        throw new Error("NOT_FOUND");
      }
      await decrementStockForMalKabul(
        line.materialCode,
        null,
        Number(line.quantity),
        transaction,
        { actorUserId: req.sessionUser?.id, referenceId: line.id }
      );
      await recordAudit(
        {
          actorUserId: req.sessionUser?.id,
          action: "mal_kabul.delete",
          entityType: "goods_receipt_line",
          entityId: line.id,
          metadata: {
            irsaliyeNo: line.irsaliyeNo,
            materialCode: line.materialCode,
            quantity: Number(line.quantity),
          },
        },
        transaction
      );
      await line.destroy({ transaction });
    });
    res.status(204).send();
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      res.status(404).json({ error: "Kayıt bulunamadı" });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Silme veya stok düzeltmesi başarısız" });
  }
});

export default router;
