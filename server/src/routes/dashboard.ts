import { Router, Response } from "express";
import { StockItem } from "../models/StockItem";
import { Machine } from "../models/Machine";
import { GoodsReceiptLine } from "../models/GoodsReceiptLine";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

/** Özet sayfa: stok / sevk / makina sayıları ve son mal kabuller */
router.get("/summary", async (_req: AuthRequest, res: Response) => {
  const [
    stockTotal,
    stockBekliyor,
    stockIsleniyor,
    stockTamamlandi,
    sevkBekleyen,
    sevkEdildi,
    machineTotal,
    recentLines,
  ] = await Promise.all([
    StockItem.count(),
    StockItem.count({ where: { processStatus: "bekliyor" } }),
    StockItem.count({ where: { processStatus: "isleniyor" } }),
    StockItem.count({ where: { processStatus: "tamamlandi" } }),
    StockItem.count({
      where: { processStatus: "tamamlandi", isShipped: false },
    }),
    StockItem.count({
      where: { processStatus: "tamamlandi", isShipped: true },
    }),
    Machine.count(),
    GoodsReceiptLine.findAll({
      order: [["createdAt", "DESC"]],
      limit: 8,
      attributes: [
        "id",
        "irsaliyeNo",
        "irsaliyeTarihi",
        "materialCode",
        "materialDescription",
        "quantity",
        "createdAt",
      ],
    }),
  ]);

  res.json({
    stock: {
      total: stockTotal,
      bekliyor: stockBekliyor,
      isleniyor: stockIsleniyor,
      tamamlandi: stockTamamlandi,
    },
    sevk: {
      bekleyen: sevkBekleyen,
      edildi: sevkEdildi,
    },
    machines: { total: machineTotal },
    recentMalKabul: recentLines.map((r) => r.toJSON()),
  });
});

export default router;
