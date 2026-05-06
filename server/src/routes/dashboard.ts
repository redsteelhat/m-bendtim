import { Router, Response } from "express";
import { StockItem } from "../models/StockItem";
import { Machine } from "../models/Machine";
import { GoodsReceiptLine } from "../models/GoodsReceiptLine";
import { requireAuth, attachUser, requirePermission, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth, attachUser);

/** Özet sayfa: stok / sevk / makina sayıları ve son mal kabuller */
router.get("/summary", requirePermission("dashboard.read"), async (_req: AuthRequest, res: Response) => {
  const [
    stockTotal,
    stockTotalQuantity,
    sevkEdildi,
    sevkEdildiQuantity,
    machineTotal,
    recentLines,
  ] = await Promise.all([
    StockItem.count(),
    StockItem.sum("quantity"),
    StockItem.count({
      where: { processStatus: "tamamlandi", isShipped: true },
    }),
    StockItem.sum("quantity", {
      where: { processStatus: "tamamlandi", isShipped: true },
    }),
    Machine.count(),
    GoodsReceiptLine.findAll({
      where: { isCancelled: false },
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
      totalQuantity: Number(stockTotalQuantity) || 0,
    },
    sevk: {
      edildi: sevkEdildi,
      edildiQuantity: Number(sevkEdildiQuantity) || 0,
    },
    machines: { total: machineTotal },
    recentMalKabul: recentLines.map((r) => r.toJSON()),
  });
});

export default router;
