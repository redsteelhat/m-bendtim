import { Op } from "sequelize";
import { GoodsReceiptLine } from "../models/GoodsReceiptLine";
import type { StockItem } from "../models/StockItem";

function normalizeStockPlain(plain: Record<string, unknown>): Record<string, unknown> {
  const q = plain.quantity;
  const n = typeof q === "string" ? Number.parseFloat(q.replace(",", ".")) : Number(q);
  if (Number.isFinite(n)) {
    return { ...plain, quantity: Math.round(n) };
  }
  return { ...plain };
}

/**
 * Stokta `name` ile `sku` aynı kaldıysa (eski mal kabul / hata), aynı malzeme koduna ait
 * en son mal kabul satırındaki ürün adını (`materialDescription`) liste yanıtında kullanır.
 * Miktar alanı yanıtta tam sayıya yuvarlanır.
 */
export async function attachMalKabulProductNames(
  rows: StockItem[]
): Promise<Record<string, unknown>[]> {
  const skusNeeding = new Set<string>();
  for (const r of rows) {
    const sku = String(r.sku ?? "").trim();
    const name = String(r.name ?? "").trim();
    if (sku && name === sku) skusNeeding.add(sku);
  }

  if (skusNeeding.size === 0) {
    return rows.map((r) => normalizeStockPlain(r.get({ plain: true }) as Record<string, unknown>));
  }

  const receipts = await GoodsReceiptLine.findAll({
    where: { materialCode: { [Op.in]: [...skusNeeding] } },
    order: [["id", "DESC"]],
    attributes: ["materialCode", "materialDescription"],
  });

  const skuToDesc = new Map<string, string>();
  for (const line of receipts) {
    const code = String(line.materialCode).trim();
    if (skuToDesc.has(code)) continue;
    const desc = String(line.materialDescription ?? "").trim();
    if (desc.length > 0 && desc !== code) {
      skuToDesc.set(code, desc.slice(0, 200));
    }
  }

  return rows.map((r) => {
    let plain = normalizeStockPlain(r.get({ plain: true }) as Record<string, unknown>);
    const sku = String(plain.sku ?? "").trim();
    const name = String(plain.name ?? "").trim();
    if (sku && name === sku) {
      const alt = skuToDesc.get(sku);
      if (alt) plain = { ...plain, name: alt };
    }
    return plain;
  });
}
