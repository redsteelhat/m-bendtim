import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Machine } from "../types";
import { formatQtyInteger } from "../formatQty";
import styles from "./dataPage.module.css";
import repStyles from "./RaporlarPage.module.css";

type ReportKey =
  | "overview"
  | "mal-kabul"
  | "shipments"
  | "stock"
  | "machines"
  | "stock-movements"
  | "audit";

type ReportRow = Record<string, unknown>;

type PagedResponse = {
  rows?: ReportRow[];
  total?: number;
  page?: number;
  limit?: number;
  [key: string]: unknown;
};

type Filters = {
  from: string;
  to: string;
  sku: string;
  name: string;
  machineId: string;
  processStatus: string;
  isShipped: string;
  shipmentStatus: string;
  userId: string;
  includeCancelled: boolean;
};

const reportTabs: Array<{ key: ReportKey; label: string }> = [
  { key: "overview", label: "Özet" },
  { key: "mal-kabul", label: "Mal Kabul" },
  { key: "shipments", label: "Sevk" },
  { key: "stock", label: "Stok" },
  { key: "machines", label: "Makina" },
  { key: "stock-movements", label: "Stok Hareketleri" },
  { key: "audit", label: "Kullanıcı Aktivitesi" },
];

const initialFilters: Filters = {
  from: "",
  to: "",
  sku: "",
  name: "",
  machineId: "",
  processStatus: "",
  isShipped: "",
  shipmentStatus: "",
  userId: "",
  includeCancelled: false,
};

function valueText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("name" in obj || "code" in obj || "email" in obj) {
      return [obj.code, obj.name, obj.email].filter(Boolean).join(" - ");
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function csvEscape(value: unknown): string {
  const text = valueText(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: ReportRow[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(";"), ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(";"))].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function rowValue(row: ReportRow, key: string): string {
  return valueText(row[key]);
}

function columnsFor(report: ReportKey): string[] {
  switch (report) {
    case "mal-kabul":
      return ["irsaliyeNo", "irsaliyeTarihi", "materialCode", "materialDescription", "quantity", "isCancelled"];
    case "shipments":
      return ["shipmentNo", "shipmentStatus", "shippedAt", "destination", "sku", "name", "quantity", "machine", "createdByUser"];
    case "stock":
      return ["sku", "name", "quantity", "unit", "processStatus", "isShipped", "machine"];
    case "machines":
      return ["code", "name", "stockKalem", "stockAdet", "bekliyor", "isleniyor", "tamamlandi"];
    case "stock-movements":
      return ["createdAt", "type", "sku", "name", "quantityBefore", "quantityAfter", "machineIdBefore", "machineIdAfter", "actorUser"];
    case "audit":
      return ["createdAt", "action", "entityType", "entityId", "actorUser", "metadata"];
    default:
      return ["metric", "kalem", "adet"];
  }
}

function labelFor(key: string): string {
  const labels: Record<string, string> = {
    metric: "Rapor",
    kalem: "Kalem",
    adet: "Adet",
    irsaliyeNo: "İrsaliye no",
    irsaliyeTarihi: "İşlem tarihi",
    materialCode: "Malzeme kodu",
    materialDescription: "Ürün adı",
    quantity: "Adet",
    isCancelled: "İptal",
    shipmentNo: "Sevk no",
    shipmentStatus: "Durum",
    shippedAt: "Sevk tarihi",
    destination: "Nereye",
    sku: "Malzeme kodu",
    name: "Ad",
    unit: "Birim",
    processStatus: "İşlem",
    isShipped: "Sevk",
    machine: "Makina",
    createdByUser: "Oluşturan",
    stockKalem: "Stok kalem",
    stockAdet: "Stok adet",
    bekliyor: "Bekliyor",
    isleniyor: "İşleniyor",
    tamamlandi: "Tamamlandı",
    createdAt: "Tarih",
    type: "Tip",
    quantityBefore: "Önce adet",
    quantityAfter: "Sonra adet",
    machineIdBefore: "Önce makina",
    machineIdAfter: "Sonra makina",
    actorUser: "Kullanıcı",
    action: "Aksiyon",
    entityType: "Kayıt tipi",
    entityId: "Kayıt id",
    metadata: "Detay",
  };
  return labels[key] ?? key;
}

function overviewRows(data: PagedResponse | null): ReportRow[] {
  if (!data) return [];
  return [
    { metric: "Mal kabul", kalem: (data.malKabul as { kalem?: number })?.kalem, adet: (data.malKabul as { adet?: number })?.adet },
    { metric: "Stok", kalem: (data.stock as { kalem?: number })?.kalem, adet: (data.stock as { adet?: number })?.adet },
    { metric: "Sevk", kalem: (data.shipments as { kalem?: number })?.kalem, adet: (data.shipments as { adet?: number })?.adet },
    { metric: "Makina", kalem: (data.machines as { total?: number })?.total, adet: "" },
  ];
}

export function RaporlarPage() {
  const [activeReport, setActiveReport] = useState<ReportKey>("overview");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PagedResponse | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const rows = useMemo(
    () => (activeReport === "overview" ? overviewRows(data) : data?.rows ?? []),
    [activeReport, data]
  );
  const columns = columnsFor(activeReport);
  const total = activeReport === "overview" ? rows.length : data?.total ?? rows.length;
  const limit = data?.limit ?? 100;
  const hasNext = activeReport !== "overview" && page * limit < total;

  const buildQuery = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("limit", "100");
      for (const [key, value] of Object.entries(appliedFilters)) {
        if (typeof value === "boolean") {
          if (value) params.set(key, "true");
        } else if (value) {
          params.set(key, value);
        }
      }
      return params.toString();
    },
    [appliedFilters]
  );

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const endpoint = `/api/reports/${activeReport}?${buildQuery(page)}`;
      setData(await api<PagedResponse>(endpoint));
    } catch (e) {
      setData(null);
      setLoadError(e instanceof Error ? e.message : "Rapor alınamadı");
    } finally {
      setLoading(false);
    }
  }, [activeReport, buildQuery, page]);

  useEffect(() => {
    api<Machine[]>("/api/machines").then(setMachines).catch(() => setMachines([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  }

  function changeTab(key: ReportKey) {
    setActiveReport(key);
    setPage(1);
    setData(null);
  }

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.h1}>Raporlar</h1>
      </div>
      <p className="muted" style={{ margin: "0 0 1.25rem", maxWidth: "52rem" }}>
        Mal kabul, sevk, stok, makina, kullanıcı aktivitesi ve stok hareketlerini filtreleyip CSV
        olarak indirebilirsiniz.
      </p>

      <div className={repStyles.tabs}>
        {reportTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeReport === tab.key ? repStyles.tabActive : repStyles.tab}
            onClick={() => changeTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form className={repStyles.filters} onSubmit={applyFilters}>
        <label className={styles.field}>
          Başlangıç
          <input className={styles.input} type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        </label>
        <label className={styles.field}>
          Bitiş
          <input className={styles.input} type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </label>
        <label className={styles.field}>
          Kod / SKU
          <input className={styles.input} value={filters.sku} onChange={(e) => setFilters((f) => ({ ...f, sku: e.target.value }))} />
        </label>
        <label className={styles.field}>
          Ad / Hedef
          <input className={styles.input} value={filters.name} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label className={styles.field}>
          Makina
          <select className={styles.input} value={filters.machineId} onChange={(e) => setFilters((f) => ({ ...f, machineId: e.target.value }))}>
            <option value="">Tümü</option>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.code} - {machine.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          İşlem durumu
          <select className={styles.input} value={filters.processStatus} onChange={(e) => setFilters((f) => ({ ...f, processStatus: e.target.value }))}>
            <option value="">Tümü</option>
            <option value="bekliyor">Bekliyor</option>
            <option value="isleniyor">İşleniyor</option>
            <option value="tamamlandi">Tamamlandı</option>
          </select>
        </label>
        <label className={styles.field}>
          Sevk
          <select className={styles.input} value={filters.isShipped} onChange={(e) => setFilters((f) => ({ ...f, isShipped: e.target.value }))}>
            <option value="">Tümü</option>
            <option value="true">Sevk edilmiş</option>
            <option value="false">Sevk edilmemiş</option>
          </select>
        </label>
        <label className={styles.field}>
          Sevk belge durumu
          <select className={styles.input} value={filters.shipmentStatus} onChange={(e) => setFilters((f) => ({ ...f, shipmentStatus: e.target.value }))}>
            <option value="">Tümü</option>
            <option value="sevk_edildi">Sevk edildi</option>
            <option value="hazirlik">Hazırlık</option>
            <option value="iptal">İptal</option>
          </select>
        </label>
        <label className={styles.field}>
          Kullanıcı ID
          <input className={styles.input} value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} />
        </label>
        <label className={repStyles.checkField}>
          <input
            type="checkbox"
            checked={filters.includeCancelled}
            onChange={(e) => setFilters((f) => ({ ...f, includeCancelled: e.target.checked }))}
          />
          İptal edilenleri dahil et
        </label>
        <div className={repStyles.filterActions}>
          <button type="submit" className={styles.primary}>Filtrele</button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => {
              setFilters(initialFilters);
              setAppliedFilters(initialFilters);
              setPage(1);
            }}
          >
            Temizle
          </button>
        </div>
      </form>

      <div className={repStyles.reportToolbar}>
        <span className="muted">
          {loading ? "Yükleniyor..." : `${total} kayıt`}
        </span>
        <button
          type="button"
          className={styles.primary}
          disabled={rows.length === 0}
          onClick={() => downloadCsv(`${activeReport}-raporu.csv`, rows)}
        >
          CSV İndir
        </button>
      </div>

      {loadError && <p className={styles.banner}>{loadError}</p>}
      {loading ? (
        <p className="muted">Rapor yükleniyor...</p>
      ) : rows.length === 0 ? (
        <p className={repStyles.empty}>Bu filtrelerle rapor verisi bulunamadı.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{labelFor(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.id ?? row.shipmentId ?? row.metric ?? index)}>
                  {columns.map((column) => (
                    <td key={column}>
                      {column === "quantity" || column === "adet" || column === "stockAdet"
                        ? formatQtyInteger(row[column] as string | number)
                        : rowValue(row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeReport !== "overview" && (
        <div className={repStyles.pager}>
          <button className={styles.ghost} type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Önceki
          </button>
          <span>Sayfa {page}</span>
          <button className={styles.ghost} type="button" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
            Sonraki
          </button>
        </div>
      )}
    </div>
  );
}
