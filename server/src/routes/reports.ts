import { Router, Response } from "express";
import { GoodsReceiptLine } from "../models/GoodsReceiptLine";
import { StockItem } from "../models/StockItem";
import { Machine } from "../models/Machine";
import { requireAuth, attachUser, AuthRequest, requirePermission } from "../middleware/auth";

type StockWithMachine = InstanceType<typeof StockItem> & {
  machine?: Machine | null;
};

const router = Router();
router.use(requireAuth, attachUser);

const includeMachine = {
  model: Machine,
  as: "machine",
  attributes: ["id", "code", "name"],
};

function dateOnlyToStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

router.get("/range", requirePermission("reports.read"), async (_req: AuthRequest, res: Response) => {
  const malKabulRows = await GoodsReceiptLine.findAll({
    order: [
      ["irsaliyeTarihi", "DESC"],
      ["id", "DESC"],
    ],
  });

  const sevkRows = (await StockItem.findAll({
    where: {
      isShipped: true,
    },
    include: [includeMachine],
    order: [
      ["shippedAt", "DESC"],
      ["id", "DESC"],
    ],
  })) as StockWithMachine[];

  const malKabulByMaterial = new Map<
    string,
    {
      materialCode: string;
      toplamMiktar: number;
      satirSayisi: number;
      tarihler: Set<string>;
    }
  >();
  let malKabulToplamAdet = 0;
  for (const r of malKabulRows) {
    const q = Number(r.quantity);
    malKabulToplamAdet += Number.isFinite(q) ? q : 0;
    const code = r.materialCode;
    const cur = malKabulByMaterial.get(code) ?? {
      materialCode: code,
      toplamMiktar: 0,
      satirSayisi: 0,
      tarihler: new Set<string>(),
    };
    cur.toplamMiktar += Number.isFinite(q) ? q : 0;
    cur.satirSayisi += 1;
    const d = dateOnlyToStr(r.irsaliyeTarihi);
    if (d) cur.tarihler.add(d);
    malKabulByMaterial.set(code, cur);
  }
  const malKabulMalzemeOzeti = [...malKabulByMaterial.values()]
    .map(({ tarihler, ...rest }) => ({
      ...rest,
      irsaliyeTarihleri: [...tarihler].sort(),
    }))
    .sort((a, b) => {
      if (b.toplamMiktar !== a.toplamMiktar) return b.toplamMiktar - a.toplamMiktar;
      return a.materialCode.localeCompare(b.materialCode, "tr");
    });

  const sevkBySku = new Map<string, { sku: string; toplamMiktar: number; satirSayisi: number }>();
  let sevkToplamAdet = 0;
  for (const r of sevkRows) {
    const q = Number(r.quantity);
    sevkToplamAdet += Number.isFinite(q) ? q : 0;
    const sku = r.sku;
    const cur = sevkBySku.get(sku) ?? { sku, toplamMiktar: 0, satirSayisi: 0 };
    cur.toplamMiktar += Number.isFinite(q) ? q : 0;
    cur.satirSayisi += 1;
    sevkBySku.set(sku, cur);
  }
  const sevkMalzemeOzeti = [...sevkBySku.values()].sort((a, b) => {
    if (b.toplamMiktar !== a.toplamMiktar) return b.toplamMiktar - a.toplamMiktar;
    return a.sku.localeCompare(b.sku, "tr");
  });

  res.json({
    malKabul: malKabulRows.map((r) => ({
      id: r.id,
      irsaliyeNo: r.irsaliyeNo,
      irsaliyeTarihi: dateOnlyToStr(r.irsaliyeTarihi),
      materialCode: r.materialCode,
      materialDescription: r.materialDescription,
      quantity: r.quantity,
      createdAt: r.createdAt,
    })),
    malKabulMalzemeOzeti,
    sevkEdilen: sevkRows.map((r) => {
      const m = r.machine;
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        quantity: r.quantity,
        unit: r.unit,
        shippedAt: dateOnlyToStr(r.shippedAt),
        shipDestination: r.shipDestination ?? null,
        machine: m ? { id: m.id, code: m.code, name: m.name } : null,
      };
    }),
    sevkMalzemeOzeti,
    ozet: {
      malKabulSatirSayisi: malKabulRows.length,
      malKabulToplamAdet,
      sevkSatirSayisi: sevkRows.length,
      sevkToplamAdet,
    },
  });
});

export default router;
