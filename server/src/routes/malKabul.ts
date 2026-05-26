import { Router, Response } from "express";
import crypto from "node:crypto";
import multer from "multer";
import { MulterError } from "multer";
import { GoodsReceiptDocument } from "../models/GoodsReceiptDocument";
import { GoodsReceiptLine } from "../models/GoodsReceiptLine";
import { StockItem } from "../models/StockItem";
import { sequelize } from "../db";
import { dateOnlyLocal } from "../dateOnlyLocal";
import { requireAuth, attachUser, AuthRequest, requirePermission } from "../middleware/auth";
import {
  incrementStockForMalKabul,
} from "../services/malKabulStock";
import { recordAudit } from "../services/audit";
import { recordStockMovement, snapshotStock } from "../services/stockMovement";
import {
  IrsaliyePdfParseError,
  parseIrsaliyePdf,
  type ParsedIrsaliye,
} from "../services/irsaliyePdfParser";
import {
  optionalTrimmedString,
  positiveQuantity,
  trimmedString,
  validateBody,
  z,
} from "../middleware/validate";

const router = Router();
router.use(requireAuth, attachUser);

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("ONLY_PDF"));
      return;
    }
    cb(null, true);
  },
});

const malKabulLineSchema = z.object({
  materialCode: trimmedString("Malzeme kodu", 80),
  productName: optionalTrimmedString("Ürün adı", 200),
  materialDescription: optionalTrimmedString("Ürün adı", 240),
  quantity: positiveQuantity,
});

const batchMalKabulSchema = z.object({
  irsaliyeNo: trimmedString("İrsaliye no", 64),
  lines: z.array(malKabulLineSchema).min(1, "En az bir malzeme satırı gerekli"),
});

const createMalKabulSchema = z.object({
  irsaliyeNo: trimmedString("İrsaliye no", 64),
  materialCode: trimmedString("Malzeme kodu", 80),
  materialDescription: optionalTrimmedString("Ürün adı", 240),
  productName: optionalTrimmedString("Ürün adı", 200),
  quantity: positiveQuantity,
});

const cancelMalKabulSchema = z.object({
  reason: trimmedString("İptal nedeni", 500),
});

const confirmPdfImportSchema = z.object({
  documentNo: trimmedString("İrsaliye no", 64),
  documentDate: trimmedString("İrsaliye tarihi", 10).pipe(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "İrsaliye tarihi YYYY-MM-DD formatında olmalı")
  ),
  sourceFileName: optionalTrimmedString("Dosya adı", 255),
  sourceFileSha256: optionalTrimmedString("Dosya özeti", 64),
  lines: z
    .array(
      z.object({
        rowNo: z.coerce.number().int().min(1, "Sıra no geçerli olmalı"),
        sku: trimmedString("Malzeme kodu", 80),
        name: trimmedString("Malzeme açıklaması", 240),
        quantity: positiveQuantity,
        unit: trimmedString("Birim", 24),
      })
    )
    .min(1, "En az bir malzeme satırı gerekli"),
  warnings: z.array(z.string()).optional(),
});

function uploadPdfSingle(req: AuthRequest, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    pdfUpload.single("file")(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function parseUploadError(err: unknown): string {
  if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
    return "PDF dosyası en fazla 10MB olabilir";
  }
  if (err instanceof Error && err.message === "ONLY_PDF") {
    return "Sadece PDF dosyası yükleyebilirsiniz";
  }
  return "PDF yüklenemedi";
}

router.get("/", requirePermission("malKabul.read"), async (req: AuthRequest, res: Response) => {
  const filter = String(req.query.status ?? "active");
  const where =
    filter === "cancelled"
      ? { isCancelled: true }
      : filter === "all"
        ? {}
        : { isCancelled: false };
  const rows = await GoodsReceiptLine.findAll({
    where,
    include: [
      {
        model: StockItem,
        as: "stockItems",
        attributes: ["id"],
        required: false,
      },
    ],
    order: [
      ["irsaliyeTarihi", "DESC"],
      ["id", "DESC"],
    ],
  });
  const visibleRows = rows.filter((row) => {
    const plain = row.get({ plain: true }) as { isCancelled?: boolean; stockItems?: Array<{ id: number }> };
    if (plain.isCancelled) return true;
    return (plain.stockItems ?? []).length > 0;
  });
  res.json(visibleRows);
});

router.post("/import/pdf/parse", requirePermission("malKabul.write"), async (req: AuthRequest, res: Response) => {
  try {
    await uploadPdfSingle(req, res);
  } catch (err) {
    res.status(err instanceof MulterError && err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: parseUploadError(err),
    });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "PDF dosyası gerekli" });
    return;
  }

  try {
    const parsed = await parseIrsaliyePdf(file.buffer);
    const fileSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
    res.json({
      data: {
        ...parsed,
        sourceFileName: file.originalname,
        sourceFileSha256: fileSha256,
      },
    });
  } catch (err) {
    const message =
      err instanceof IrsaliyePdfParseError
        ? err.message
        : "PDF metni okunamadı veya e-irsaliye formatı tanınamadı";
    res.status(400).json({ error: message });
  }
});

router.post(
  "/import/pdf/confirm",
  requirePermission("malKabul.write"),
  validateBody(confirmPdfImportSchema),
  async (req: AuthRequest, res: Response) => {
    const payload = req.body as ParsedIrsaliye & {
      sourceFileName?: string;
      sourceFileSha256?: string;
    };

    const existingDocument = await GoodsReceiptDocument.findOne({
      where: { documentNo: payload.documentNo },
    });
    const existingLines = await GoodsReceiptLine.findAll({
      where: { irsaliyeNo: payload.documentNo },
      include: [
        {
          model: StockItem,
          as: "stockItems",
          attributes: ["id"],
          required: false,
        },
      ],
    });
    const hasLiveStockForDocument = existingLines.some((line) => {
      const plain = line.get({ plain: true }) as {
        isCancelled?: boolean;
        stockItems?: Array<{ id: number }>;
      };
      return !plain.isCancelled && (plain.stockItems ?? []).length > 0;
    });
    if (hasLiveStockForDocument) {
      res.status(409).json({ error: "Bu irsaliye daha önce işlenmiş." });
      return;
    }

    try {
      const result = await sequelize.transaction(async (transaction) => {
        const document =
          existingDocument ??
          (await GoodsReceiptDocument.create(
            {
              documentNo: payload.documentNo.trim(),
              documentDate: payload.documentDate as unknown as Date,
              source: "pdf",
              sourceFileName: payload.sourceFileName?.trim() || null,
              sourceFileSha256: payload.sourceFileSha256?.trim() || null,
              createdByUserId: req.sessionUser?.id ?? null,
              rawParseJson: {
                lineCount: payload.lines.length,
                warnings: payload.warnings ?? [],
              },
            },
            { transaction }
          ));

        if (existingDocument) {
          existingDocument.documentDate = payload.documentDate as unknown as Date;
          existingDocument.source = "pdf";
          existingDocument.sourceFileName = payload.sourceFileName?.trim() || null;
          existingDocument.sourceFileSha256 = payload.sourceFileSha256?.trim() || null;
          existingDocument.rawParseJson = {
            lineCount: payload.lines.length,
            warnings: payload.warnings ?? [],
            reimportedAfterStockDelete: true,
          };
          await existingDocument.save({ transaction });
        }

        const createdLines: GoodsReceiptLine[] = [];
        for (const line of payload.lines) {
          const createdLine = await GoodsReceiptLine.create(
            {
              documentId: document.id,
              rowNo: line.rowNo,
              irsaliyeNo: payload.documentNo.trim(),
              irsaliyeTarihi: payload.documentDate as unknown as Date,
              materialCode: line.sku.trim(),
              materialDescription: line.name.trim().slice(0, 240),
              quantity: line.quantity,
              unit: line.unit.trim().slice(0, 24),
            },
            { transaction }
          );
          await incrementStockForMalKabul(
            {
              sku: line.sku,
              name: line.name,
              qty: Number(line.quantity),
              unit: line.unit,
              machineId: null,
              actorUserId: req.sessionUser?.id,
              referenceId: createdLine.id,
            },
            transaction
          );
          createdLines.push(createdLine);
        }

        await recordAudit(
          {
            actorUserId: req.sessionUser?.id,
            action: "mal_kabul.pdf_import",
            entityType: "goods_receipt_document",
            entityId: document.id,
            metadata: {
              documentNo: document.documentNo,
              documentDate: payload.documentDate,
              lineCount: createdLines.length,
              sourceFileSha256: payload.sourceFileSha256 ?? null,
            },
          },
          transaction
        );

        return { document, lines: createdLines };
      });
      res.status(201).json(result);
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_QTY") {
        res.status(400).json({ error: "Miktar en az 1 tam adet olmalı" });
        return;
      }
      res.status(409).json({ error: "PDF mal kabul kaydı oluşturulamadı" });
    }
  }
);

/** Tek irsaliye altında birden fazla malzeme; tek işlemde atomik kayıt + stok. */
router.post("/batch", requirePermission("malKabul.write"), validateBody(batchMalKabulSchema), async (req: AuthRequest, res: Response) => {
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
    const fallbackName = descTrim || code;
    const descStored = fallbackName.slice(0, 240);
    const stockName = fallbackName.slice(0, 200);
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

router.get("/:id", requirePermission("malKabul.read"), async (req, res: Response) => {
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

router.post("/", requirePermission("malKabul.write"), validateBody(createMalKabulSchema), async (req: AuthRequest, res: Response) => {
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
  const fallbackName = descTrim || code;
  const descStored = fallbackName.slice(0, 240);
  const stockName = fallbackName.slice(0, 200);

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

router.patch("/:id/cancel", requirePermission("malKabul.write"), validateBody(cancelMalKabulSchema), async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Geçersiz id" });
    return;
  }
  const { reason } = req.body as { reason?: string };
  const trimmedReason = reason?.trim() ?? "";

  try {
    const cancelled = await sequelize.transaction(async (transaction) => {
      const line = await GoodsReceiptLine.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!line) {
        throw new Error("NOT_FOUND");
      }
      if (line.isCancelled) {
        throw new Error("ALREADY_CANCELLED");
      }

      const stockItems = await StockItem.findAll({
        where: { goodsReceiptLineId: line.id },
        order: [["id", "ASC"]],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const expectedQty = Math.floor(Number(line.quantity));
      const related = stockItems;

      if (related.length < expectedQty) {
        throw new Error("STOCK_MISSING");
      }

      for (const stock of related) {
        if (stock.machineId != null) throw new Error("HAS_MACHINE");
        if (stock.processStatus === "isleniyor") throw new Error("IN_PROCESS");
        if (stock.processStatus === "tamamlandi") throw new Error("COMPLETED");
        if (stock.isShipped) throw new Error("SHIPPED");
        if (stock.processStatus !== "bekliyor") throw new Error("PROGRESSED");
      }

      line.isCancelled = true;
      line.cancelledAt = new Date();
      line.cancelledByUserId = req.sessionUser?.id ?? null;
      line.cancelReason = trimmedReason.slice(0, 500);
      await line.save({ transaction });

      for (const stock of related) {
        const before = snapshotStock(stock);
        await stock.destroy({ transaction });
        await recordStockMovement(
          {
            type: "mal_kabul_iptal",
            actorUserId: req.sessionUser?.id,
            before,
            sku: before.sku,
            name: before.name,
            quantityDelta: -(before.quantity ?? 0),
            referenceType: "goods_receipt_line",
            referenceId: line.id,
            metadata: { cancelReason: trimmedReason },
          },
          transaction
        );
      }

      await recordAudit(
        {
          actorUserId: req.sessionUser?.id,
          action: "mal_kabul.cancel",
          entityType: "goods_receipt_line",
          entityId: line.id,
          metadata: {
            irsaliyeNo: line.irsaliyeNo,
            materialCode: line.materialCode,
            quantity: Number(line.quantity),
            reason: trimmedReason,
          },
        },
        transaction
      );
      return GoodsReceiptLine.findByPk(line.id, { transaction });
    });
    res.json(cancelled);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      res.status(404).json({ error: "Kayıt bulunamadı" });
      return;
    }
    if (e instanceof Error && e.message === "ALREADY_CANCELLED") {
      res.status(409).json({ error: "Bu mal kabul satırı zaten iptal edilmiş" });
      return;
    }
    if (e instanceof Error && e.message === "STOCK_MISSING") {
      res.status(409).json({
        error: "Bu mal kabul satırına ait bekleyen stok satırları eksik; iptal güvenli değil",
      });
      return;
    }
    if (e instanceof Error && e.message === "HAS_MACHINE") {
      res.status(409).json({ error: "Makina atanmış stok bulunduğu için iptal edilemez" });
      return;
    }
    if (e instanceof Error && e.message === "IN_PROCESS") {
      res.status(409).json({ error: "İşleniyor durumunda stok bulunduğu için iptal edilemez" });
      return;
    }
    if (e instanceof Error && e.message === "COMPLETED") {
      res.status(409).json({ error: "Tamamlanmış stok bulunduğu için iptal edilemez" });
      return;
    }
    if (e instanceof Error && e.message === "SHIPPED") {
      res.status(409).json({ error: "Sevk edilmiş stok bulunduğu için iptal edilemez" });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Mal kabul iptali başarısız" });
  }
});

router.delete("/:id", requirePermission("malKabul.write"), async (_req: AuthRequest, res: Response) => {
  res.status(405).json({
    error: "Mal kabul kayıtları silinmez. İptal için PATCH /api/mal-kabul/:id/cancel kullanın",
  });
});

export default router;
