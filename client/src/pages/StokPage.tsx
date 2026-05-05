import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { Machine, StockItem, StockProcessStatus } from "../types";
import { formatQtyInteger } from "../formatQty";
import dStyles from "./dataPage.module.css";
import pStyles from "./StokPage.module.css";

const statusLabel: Record<StockProcessStatus, string> = {
  bekliyor: "Bekliyor",
  isleniyor: "İşleniyor",
  tamamlandi: "Tamamlandı",
};

function rowClass(s: StockProcessStatus): string {
  if (s === "isleniyor") return pStyles.rowIsleniyor;
  if (s === "tamamlandi") return pStyles.rowTamamlandi;
  return pStyles.rowBekliyor;
}

function badgeClass(s: StockProcessStatus): string {
  if (s === "isleniyor") return `${pStyles.badge} ${pStyles.isleniyor}`;
  if (s === "tamamlandi") return `${pStyles.badge} ${pStyles.tamamlandi}`;
  return `${pStyles.badge} ${pStyles.bekliyor}`;
}

export function StokPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("stock.write");
  const [rows, setRows] = useState<StockItem[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkMachineId, setBulkMachineId] = useState<string>("");
  const [bulkStatus, setBulkStatus] = useState<StockProcessStatus>("bekliyor");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const selectedCount = selectedIds.size;
  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const someSelected = selectedCount > 0 && !allSelected;

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

  async function applyBulkMachine() {
    if (selectedCount === 0) return;
    setBulkError(null);
    setBulkBusy(true);
    try {
      await api<StockItem[]>("/api/stock/bulk", {
        method: "PATCH",
        body: JSON.stringify({
          ids: [...selectedIds],
          machineId: bulkMachineId === "" ? null : Number(bulkMachineId),
        }),
      });
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Makina atanamadı");
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulkStatus() {
    if (selectedCount === 0) return;
    setBulkError(null);
    setBulkBusy(true);
    try {
      await api<StockItem[]>("/api/stock/bulk", {
        method: "PATCH",
        body: JSON.stringify({
          ids: [...selectedIds],
          processStatus: bulkStatus,
        }),
      });
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Durum güncellenemedi");
    } finally {
      setBulkBusy(false);
    }
  }

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const [sList, mList] = await Promise.all([
        api<StockItem[]>("/api/stock"),
        api<Machine[]>("/api/machines"),
      ]);
      setRows(sList);
      setMachines(mList);
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

  return (
    <div>
      <div className={dStyles.head}>
        <h1 className={dStyles.h1}>Stoklar</h1>
      </div>
      <p className="muted" style={{ margin: "0 0 1rem", maxWidth: "48rem" }}>
        {canWrite ? (
          <>
            Satırları işaretleyerek <strong>toplu makina</strong> veya <strong>toplu durum</strong>{" "}
            atayabilirsiniz. Tek satır için <strong>Ata</strong> kullanın. Stok girişi{" "}
            <strong>Mal kabul</strong> ile yapılır. Makina tanımı <strong>Makina</strong> sayfasındadır.
          </>
        ) : (
          <>Salt okunur görünüm. Stok kayıtlarını inceleyebilirsiniz; değişiklik yetkiniz yok.</>
        )}
      </p>
      {loadError && <p className={dStyles.banner}>{loadError}</p>}
      {canWrite && selectedCount > 0 && (
        <div className={pStyles.bulkBar} role="region" aria-label="Toplu işlemler">
          <div className={pStyles.bulkBarTop}>
            <span className={pStyles.bulkCount}>
              {selectedCount} satır seçili
            </span>
            <button
              type="button"
              className={dStyles.linkBtn}
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy}
            >
              Seçimi temizle
            </button>
          </div>
          {bulkError && <p className={dStyles.formErr}>{bulkError}</p>}
          <div className={pStyles.bulkActions}>
            <label className={pStyles.bulkField}>
              <span className={pStyles.bulkLabel}>Makina</span>
              <select
                className={dStyles.input}
                value={bulkMachineId}
                onChange={(e) => setBulkMachineId(e.target.value)}
                disabled={bulkBusy}
              >
                <option value="">— Makina yok —</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={dStyles.primary}
              onClick={() => void applyBulkMachine()}
              disabled={bulkBusy}
            >
              {bulkBusy ? "…" : "Makineye ata"}
            </button>
            <label className={pStyles.bulkField}>
              <span className={pStyles.bulkLabel}>Durum</span>
              <select
                className={dStyles.input}
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as StockProcessStatus)}
                disabled={bulkBusy}
              >
                <option value="bekliyor">Bekliyor</option>
                <option value="isleniyor">İşleniyor</option>
                <option value="tamamlandi">Tamamlandı</option>
              </select>
            </label>
            <button
              type="button"
              className={dStyles.primary}
              onClick={() => void applyBulkStatus()}
              disabled={bulkBusy}
            >
              {bulkBusy ? "…" : "Durumu güncelle"}
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p className="muted">Yükleniyor…</p>
      ) : (
        <div className={dStyles.tableWrap}>
          <table className={dStyles.table}>
            <thead>
              <tr>
                {canWrite && (
                  <th className={pStyles.checkCol} aria-label="Tümünü seç">
                    <input
                      type="checkbox"
                      className={pStyles.rowCheck}
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th>İşlem</th>
                <th>Malzeme kodu</th>
                <th>Ürün adı</th>
                <th>Miktar</th>
                <th>Birim</th>
                <th>Makina</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={rowClass(r.processStatus ?? "bekliyor")}>
                  {canWrite && (
                    <td className={pStyles.checkCol}>
                      <input
                        type="checkbox"
                        className={pStyles.rowCheck}
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleRow(r.id)}
                        aria-label={`Seç: ${r.sku}`}
                      />
                    </td>
                  )}
                  <td>
                    <span className={badgeClass(r.processStatus ?? "bekliyor")}>
                      {statusLabel[r.processStatus ?? "bekliyor"]}
                    </span>
                  </td>
                  <td>{r.sku}</td>
                  <td>{r.name}</td>
                  <td>{formatQtyInteger(r.quantity)}</td>
                  <td>{r.unit}</td>
                  <td>
                    {r.machine
                      ? `${r.machine.code} — ${r.machine.name}`
                      : r.machineId != null
                        ? `#${r.machineId}`
                        : "—"}
                  </td>
                  {canWrite && (
                    <td className={dStyles.actions}>
                      <button
                        type="button"
                        className={dStyles.linkBtn}
                        onClick={() => {
                          setEditing(r);
                          setFormError(null);
                          setModalOpen(true);
                        }}
                      >
                        Ata
                      </button>
                      <button
                        type="button"
                        className={dStyles.dangerBtn}
                        onClick={async () => {
                          if (!confirm(`Malzeme kodu «${r.sku}» silinsin mi?`)) return;
                          try {
                            await api(`/api/stock/${r.id}`, { method: "DELETE" });
                            await load();
                          } catch (e) {
                            alert(e instanceof Error ? e.message : "Silinemedi");
                          }
                        }}
                      >
                        Sil
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modalOpen && editing && canWrite && (
        <StockModal
          initial={editing}
          machines={machines}
          formError={formError}
          onError={setFormError}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function StockModal({
  initial,
  machines,
  formError,
  onError,
  onClose,
  onSaved,
}: {
  initial: StockItem;
  machines: Machine[];
  formError: string | null;
  onError: (s: string | null) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [machineId, setMachineId] = useState<string>(
    initial.machineId != null ? String(initial.machineId) : ""
  );
  const [processStatus, setProcessStatus] = useState<StockProcessStatus>(
    initial.processStatus ?? "bekliyor"
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        processStatus,
        machineId: machineId === "" ? null : Number(machineId),
      };
      await api(`/api/stock/${initial.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={dStyles.overlay} role="presentation" onClick={onClose}>
      <div
        className={`${dStyles.modal} ${dStyles.modalWide}`}
        role="dialog"
        aria-modal
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 className={dStyles.modalTitle}>Stok atama</h2>
        <form className={dStyles.modalForm} onSubmit={onSubmit}>
          <>
            <p className={pStyles.sectionTitle}>Kalem bilgisi</p>
            <div className={pStyles.readonlyBlock}>
              <span>Malzeme kodu</span>
              <p className={pStyles.readonlyValue}>{initial.sku}</p>
            </div>
            <div className={pStyles.readonlyBlock}>
              <span>Ürün adı</span>
              <p className={pStyles.readonlyValue}>{initial.name}</p>
            </div>
            <div className={pStyles.readonlyBlock}>
              <span>Miktar</span>
              <p className={pStyles.readonlyValue}>{formatQtyInteger(initial.quantity)}</p>
            </div>
            <div className={pStyles.readonlyBlock}>
              <span>Birim</span>
              <p className={pStyles.readonlyValue}>{initial.unit}</p>
            </div>
          </>

          <>
            <p className={pStyles.sectionTitle}>İşlem durumu</p>
            <label className={dStyles.field}>
              Durum
              <select
                className={dStyles.input}
                value={processStatus}
                onChange={(e) => setProcessStatus(e.target.value as StockProcessStatus)}
              >
                <option value="bekliyor">Bekliyor (henüz işlenmeye alınmadı)</option>
                <option value="isleniyor">İşleniyor</option>
                <option value="tamamlandi">Tamamlandı</option>
              </select>
            </label>

            <p className={pStyles.sectionTitle}>Makina ataması</p>
            <p className={pStyles.hint}>
              Makinayı listeden seçin. Yeni makina eklemek için <strong>Makina</strong> sayfasını
              kullanın.
            </p>
            <label className={dStyles.field}>
              Makina
              <select
                className={dStyles.input}
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
              >
                <option value="">— Makina yok —</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </label>
          </>

          {formError && <p className={dStyles.formErr}>{formError}</p>}
          <div className={dStyles.modalActions}>
            <button type="button" className={dStyles.ghost} onClick={onClose}>
              İptal
            </button>
            <button type="submit" className={dStyles.primary} disabled={busy}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
