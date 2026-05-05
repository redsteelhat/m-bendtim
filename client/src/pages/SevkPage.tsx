import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { StockItem } from "../types";
import { formatQtyInteger } from "../formatQty";
import styles from "./dataPage.module.css";
import sevkStyles from "./SevkPage.module.css";

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function SevkPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("shipments.write");
  const [rows, setRows] = useState<StockItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  /** Sevk bekleyen satırlar için «nereye» taslağı; sevk edilenler API ile hizalanır */
  const [shipToDraft, setShipToDraft] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkShipTo, setBulkShipTo] = useState("");
  const [bulkDestUpdate, setBulkDestUpdate] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const selectedCount = selectedIds.size;
  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setRows(await api<StockItem[]>("/api/stock/sevk-bekleyen"));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setShipToDraft((prev) => {
      const next: Record<number, string> = {};
      for (const r of rows) {
        if (r.isShipped) {
          next[r.id] = r.shipDestination ?? "";
        } else {
          next[r.id] = prev[r.id] ?? "";
        }
      }
      return next;
    });
  }, [rows]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(rows.map((r) => r.id));
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      if (prev.size !== next.size) changed = true;
      return changed ? next : prev;
    });
  }, [rows]);

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIds));
  }

  async function applyBulkShip() {
    const dest = bulkShipTo.trim();
    if (!dest) {
      setBulkError("Toplu sevk için «nereye» alanını doldurun.");
      return;
    }
    if (selectedCount === 0) return;
    setBulkError(null);
    setBulkBusy(true);
    try {
      await api("/api/stock/bulk-sevk", {
        method: "PATCH",
        body: JSON.stringify({
          ids: [...selectedIds],
          action: "ship",
          shipDestination: dest,
        }),
      });
      setSelectedIds(new Set());
      setBulkShipTo("");
      await load();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Güncellenemedi");
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulkUnship() {
    if (selectedCount === 0) return;
    setBulkError(null);
    setBulkBusy(true);
    try {
      await api("/api/stock/bulk-sevk", {
        method: "PATCH",
        body: JSON.stringify({
          ids: [...selectedIds],
          action: "unship",
        }),
      });
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Güncellenemedi");
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulkDestination() {
    const dest = bulkDestUpdate.trim();
    if (!dest) {
      setBulkError("Yeni hedef (nereye) metnini girin.");
      return;
    }
    const shippedIds = rows
      .filter((r) => selectedIds.has(r.id) && Boolean(r.isShipped))
      .map((r) => r.id);
    if (shippedIds.length === 0) {
      setBulkError("Nereye güncellemesi için en az bir sevk edilmiş satır seçin.");
      return;
    }
    setBulkError(null);
    setBulkBusy(true);
    try {
      await api("/api/stock/bulk-sevk", {
        method: "PATCH",
        body: JSON.stringify({
          ids: shippedIds,
          action: "destination",
          shipDestination: dest,
        }),
      });
      setBulkDestUpdate("");
      await load();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Güncellenemedi");
    } finally {
      setBulkBusy(false);
    }
  }

  async function setShipped(item: StockItem, shipped: boolean) {
    setBusyId(item.id);
    try {
      if (shipped) {
        const dest = (shipToDraft[item.id] ?? "").trim();
        if (!dest) {
          alert("Nereye sevk edileceğini yazın.");
          return;
        }
        await api(`/api/stock/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            isShipped: true,
            shipDestination: dest,
          }),
        });
      } else {
        await api(`/api/stock/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isShipped: false }),
        });
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Güncellenemedi");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.h1}>Sevk</h1>
      </div>
      <p className="muted" style={{ margin: "0 0 1rem", maxWidth: "48rem" }}>
        {canWrite ? (
          <>
            Stoklar sayfasında işlem durumu «Tamamlandı» olan malzemeler burada listelenir. Satırları
            işaretleyerek <strong>toplu sevk</strong> (nereye ile birlikte), <strong>toplu sevk iptali</strong>{" "}
            veya yalnızca sevk edilmişler için <strong>toplu hedef (nereye)</strong> güncellemesi
            yapabilirsiniz. <strong>Sevk tarihi</strong> işlem anındaki gün olarak sunucuda otomatik
            atanır. Tek satırda yine aşağıdaki düğmeleri kullanabilirsiniz.
          </>
        ) : (
          <>Salt okunur görünüm. Sevk kayıtlarını inceleyebilirsiniz; değişiklik yetkiniz yok.</>
        )}
      </p>
      {loadError && <p className={styles.banner}>{loadError}</p>}
      {canWrite && selectedCount > 0 && (
        <div className={sevkStyles.bulkBar} role="region" aria-label="Toplu sevk işlemleri">
          <div className={sevkStyles.bulkBarTop}>
            <span className={sevkStyles.bulkCount}>{selectedCount} satır seçili</span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy}
            >
              Seçimi temizle
            </button>
          </div>
          {bulkError && <p className={styles.formErr}>{bulkError}</p>}
          <p className={`${sevkStyles.bulkSectionTitle} ${sevkStyles.bulkSectionTitleTop}`}>
            Sevk durumu
          </p>
          <div className={sevkStyles.bulkActions}>
            <label className={sevkStyles.bulkField}>
              <span className={sevkStyles.bulkLabel}>Nereye (sevk edildi)</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Örn. Ankara depo"
                value={bulkShipTo}
                onChange={(e) => setBulkShipTo(e.target.value)}
                disabled={bulkBusy}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void applyBulkShip()}
              disabled={bulkBusy}
            >
              {bulkBusy ? "…" : "Sevk edildi olarak işaretle"}
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => void applyBulkUnship()}
              disabled={bulkBusy}
            >
              {bulkBusy ? "…" : "Sevk işaretini kaldır"}
            </button>
          </div>
          <p className={sevkStyles.bulkSectionTitle}>Sadece sevk edilmiş satırlar</p>
          <div className={sevkStyles.bulkActions}>
            <label className={sevkStyles.bulkField}>
              <span className={sevkStyles.bulkLabel}>Yeni hedef (nereye)</span>
              <input
                type="text"
                className={styles.input}
                placeholder="Seçili sevk edilmiş satırların hedefi"
                value={bulkDestUpdate}
                onChange={(e) => setBulkDestUpdate(e.target.value)}
                disabled={bulkBusy}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void applyBulkDestination()}
              disabled={bulkBusy}
            >
              {bulkBusy ? "…" : "Nereyeyi güncelle"}
            </button>
          </div>
          <p className={sevkStyles.bulkHint}>
            «Nereyeyi güncelle» yalnızca seçiminizdeki <strong>sevk edilmiş</strong> satırlara
            uygulanır; sevk bekleyenler atlanır.
          </p>
        </div>
      )}
      {loading ? (
        <p className="muted">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="muted">
          Tamamlanan malzeme yok. Stoklarda bir kaleme <strong>Ata</strong> ile girip durumu
          &quot;Tamamlandı&quot; yapın.
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {canWrite && (
                  <th className={sevkStyles.checkCol} aria-label="Tümünü seç">
                    <input
                      type="checkbox"
                      className={sevkStyles.rowCheck}
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th>Sevk</th>
                <th>Malzeme kodu</th>
                <th>Ürün adı</th>
                <th>Miktar</th>
                <th>Makina</th>
                <th>Nereye</th>
                <th>Sevk tarihi</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const shipped = Boolean(r.isShipped);
                return (
                  <tr
                    key={r.id}
                    className={shipped ? sevkStyles.rowSevkli : sevkStyles.rowBekliyor}
                  >
                    {canWrite && (
                      <td className={sevkStyles.checkCol}>
                        <input
                          type="checkbox"
                          className={sevkStyles.rowCheck}
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                          aria-label={`Seç: ${r.sku}`}
                        />
                      </td>
                    )}
                    <td>
                      {shipped ? (
                        <span className={sevkStyles.badgeSevkli}>Sevk edildi</span>
                      ) : (
                        <span className={sevkStyles.badgeBekliyor}>Sevk bekliyor</span>
                      )}
                    </td>
                    <td>{r.sku}</td>
                    <td>{r.name}</td>
                    <td>{formatQtyInteger(r.quantity)}</td>
                    <td>
                      {r.machine ? `${r.machine.code} — ${r.machine.name}` : "—"}
                    </td>
                    <td>
                      {shipped || !canWrite ? (
                        <span>{r.shipDestination?.trim() || "—"}</span>
                      ) : (
                        <input
                          type="text"
                          className={styles.input}
                          style={{ minWidth: "10rem", maxWidth: "16rem" }}
                          placeholder="Örn. Ankara depo"
                          value={shipToDraft[r.id] ?? ""}
                          onChange={(e) =>
                            setShipToDraft((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                          disabled={busyId === r.id}
                          aria-label="Sevk hedefi"
                        />
                      )}
                    </td>
                    <td>{shipped ? toInputDate(r.shippedAt) : "—"}</td>
                    {canWrite && (
                      <td className={styles.actions}>
                        {shipped ? (
                          <button
                            type="button"
                            className={styles.linkBtn}
                            disabled={busyId === r.id}
                            onClick={() => void setShipped(r, false)}
                          >
                            Sevk işaretini kaldır
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.primary}
                            disabled={busyId === r.id}
                            onClick={() => void setShipped(r, true)}
                          >
                            Sevk edildi
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
