import { Op } from "sequelize";
import { StockItem } from "../models/StockItem";
import type { Machine } from "../models/Machine";

export type MakinaStokDurumu = "atama_yok" | "tamamlandi" | "devam_ediyor";

export type MachineStockAgg = {
  stokAtananSatir: number;
  stokTamamlananSatir: number;
  makinaStokDurumu: MakinaStokDurumu;
};

export async function aggregateStockByMachine(
  machineIds: number[]
): Promise<Map<number, MachineStockAgg>> {
  const out = new Map<number, MachineStockAgg>();
  for (const id of machineIds) {
    out.set(id, {
      stokAtananSatir: 0,
      stokTamamlananSatir: 0,
      makinaStokDurumu: "atama_yok",
    });
  }
  if (machineIds.length === 0) return out;

  const items = await StockItem.findAll({
    where: { machineId: { [Op.in]: machineIds } },
    attributes: ["machineId", "processStatus"],
  });

  const counts = new Map<number, { total: number; tamam: number }>();
  for (const it of items) {
    const mid = it.machineId as number;
    const cur = counts.get(mid) ?? { total: 0, tamam: 0 };
    cur.total += 1;
    if (it.processStatus === "tamamlandi") cur.tamam += 1;
    counts.set(mid, cur);
  }

  for (const id of machineIds) {
    const c = counts.get(id);
    const stokAtananSatir = c?.total ?? 0;
    const stokTamamlananSatir = c?.tamam ?? 0;
    let makinaStokDurumu: MakinaStokDurumu;
    if (stokAtananSatir === 0) makinaStokDurumu = "atama_yok";
    else if (stokTamamlananSatir === stokAtananSatir) makinaStokDurumu = "tamamlandi";
    else makinaStokDurumu = "devam_ediyor";
    out.set(id, { stokAtananSatir, stokTamamlananSatir, makinaStokDurumu });
  }
  return out;
}

export function serializeMachineWithStock(
  m: Machine,
  agg: MachineStockAgg | undefined
): Record<string, unknown> {
  const a =
    agg ??
    ({
      stokAtananSatir: 0,
      stokTamamlananSatir: 0,
      makinaStokDurumu: "atama_yok",
    } satisfies MachineStockAgg);
  return {
    ...m.get({ plain: true }),
    stokAtananSatir: a.stokAtananSatir,
    stokTamamlananSatir: a.stokTamamlananSatir,
    makinaStokDurumu: a.makinaStokDurumu,
  };
}
