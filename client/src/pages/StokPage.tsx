import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { Machine, StockItem, StockMovement, StockMovementType, StockProcessStatus } from "../types";
import { formatQtyInteger } from "../formatQty";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState, LoadingState } from "../components/ui/Feedback";
import { useToast } from "../components/ui/Toast";
import dStyles from "./dataPage.module.css";
import pStyles from "./StokPage.module.css";

const statusLabel: Record<StockProcessStatus, string> = {
  bekliyor: "Bekliyor",
  isleniyor: "İşleniyor",
  tamamlandi: "Tamamlandı",
};

const movementTypeLabel: Record<StockMovementType, string> = {
  mal_kabul: "Mal kabul",
  mal_kabul_iptal: "Mal kabul iptali",
  manual_create: "Manuel oluşturma",
  manual_update: "Manuel güncelleme",
  bulk_update: "Toplu güncelleme",
  machine_assignment: "Makina ataması",
  status_change: "Durum değişikliği",
  ship: "Sevk edildi",
  unship: "Sevk geri alındı",
  ship_destination: "Sevk hedefi güncellendi",
};

function machineLabel(machine?: { id: number; code?: string; name?: string } | null, id?: number | null) {
  if (machine?.code || machine?.name) return `${machine.code ?? `#${machine.id}`} — ${machine.name ?? ""}`.trim();
  if (id != null) return `#${id}`;
  return "—";
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

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
  const { showToast } = useToast();
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
  const [detailRow, setDetailRow] = useState<StockItem | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StockProcessStatus>("all");
  const [machineFilter, setMachineFilter] = useState("all");
  const [shipmentFilter, setShipmentFilter] = useState<"all" | "shipped" | "waiting">("all");
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    run: () => Promise<void>;
  } | null>(null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        row.sku.toLocaleLowerCase("tr-TR").includes(normalizedQuery) ||
        row.name.toLocaleLowerCase("tr-TR").includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || row.processStatus === statusFilter;
      const matchesMachine =
        machineFilter === "all" ||
        (machineFilter === "none" ? row.machineId == null : row.machineId === Number(machineFilter));
      const matchesShipment =
        shipmentFilter === "all" ||
        (shipmentFilter === "shipped" ? row.isShipped : !row.isShipped);
      return matchesQuery && matchesStatus && matchesMachine && matchesShipment;
    });
  }, [machineFilter, query, rows, shipmentFilter, statusFilter]);

  const selectedCount = selectedIds.size;
  const visibleIds = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);
  const visibleSelectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
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
      showToast("Makina ataması güncellendi.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Makina atanamadı";
      setBulkError(message);
      showToast(message, "error");
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
      showToast("Durum güncellendi.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Durum güncellenemedi";
      setBulkError(message);
      showToast(message, "error");
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

  async function deleteStock(row: StockItem) {
    try {
      await api(`/api/stock/${row.id}`, { method: "DELETE" });
      await load();
      showToast("Stok kaydı silindi.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Silinemedi", "error");
    }
  }

  async function applyBulkDelete() {
    if (selectedCount === 0) return;
    setBulkError(null);
    setBulkBusy(true);
    try {
      await api("/api/stock/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      setSelectedIds(new Set());
      await load();
      showToast("Seçili stok kayıtları silindi.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Toplu silme başarısız";
      setBulkError(message);
      showToast(message, "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function runConfirmedAction() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    await action.run();
  }

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
      <div className={pStyles.filterBar} role="region" aria-label="Stok filtreleri">
        <label className={pStyles.filterField}>
          <span>Arama</span>
          <input
            className={dStyles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Malzeme kodu veya ürün adı"
          />
        </label>
        <label className={pStyles.filterField}>
          <span>Durum</span>
          <select
            className={dStyles.input}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | StockProcessStatus)}
          >
            <option value="all">Tümü</option>
            <option value="bekliyor">Bekliyor</option>
            <option value="isleniyor">İşleniyor</option>
            <option value="tamamlandi">Tamamlandı</option>
          </select>
        </label>
        <label className={pStyles.filterField}>
          <span>Makina</span>
          <select
            className={dStyles.input}
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
          >
            <option value="all">Tümü</option>
            <option value="none">Makina yok</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className={pStyles.filterField}>
          <span>Sevk</span>
          <select
            className={dStyles.input}
            value={shipmentFilter}
            onChange={(e) => setShipmentFilter(e.target.value as "all" | "shipped" | "waiting")}
          >
            <option value="all">Tümü</option>
            <option value="waiting">Sevk Bekliyor</option>
            <option value="shipped">Sevk Edildi</option>
          </select>
        </label>
        <button
          type="button"
          className={dStyles.linkBtn}
          onClick={() => {
            setQuery("");
            setStatusFilter("all");
            setMachineFilter("all");
            setShipmentFilter("all");
          }}
        >
          Filtreleri temizle
        </button>
      </div>
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
              onClick={() =>
                setConfirmAction({
                  title: "Toplu makina ataması",
                  message: `${selectedCount} stok kalemi için makina ataması güncellenecek.`,
                  confirmLabel: "Atamayı yap",
                  run: applyBulkMachine,
                })
              }
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
              onClick={() =>
                setConfirmAction({
                  title: "Toplu durum güncelleme",
                  message: `${selectedCount} stok kaleminin işlem durumu "${statusLabel[bulkStatus]}" yapılacak.`,
                  confirmLabel: "Durumu güncelle",
                  run: applyBulkStatus,
                })
              }
              disabled={bulkBusy}
            >
              {bulkBusy ? "…" : "Durumu güncelle"}
            </button>
            <button
              type="button"
              className={dStyles.dangerBtn}
              onClick={() =>
                setConfirmAction({
                  title: "Seçili stoklar silinsin mi?",
                  message: `${selectedCount} stok kalemi silinecek. Sevk edilmiş stok varsa işlem bloklanır. Bu işlem geri alınamaz.`,
                  confirmLabel: "Toplu sil",
                  danger: true,
                  run: applyBulkDelete,
                })
              }
              disabled={bulkBusy}
            >
              Toplu sil
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : filteredRows.length === 0 ? (
        <EmptyState title="Stok bulunamadı" text="Bu filtrelerle stok kaydı bulunamadı." />
      ) : (
        <>
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
                <th>Sevk</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
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
                  <td>{r.isShipped ? "Sevk edildi" : "Bekliyor"}</td>
                  <td className={dStyles.actions}>
                    <button
                      type="button"
                      className={dStyles.linkBtn}
                      onClick={() => setDetailRow(r)}
                    >
                      Detay
                    </button>
                    {canWrite && (
                      <>
                      <button
                        type="button"
                        className={dStyles.linkBtn}
                        disabled={r.isShipped}
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
                        disabled={r.isShipped}
                        onClick={() =>
                          setConfirmAction({
                            title: "Stok kaydı silinsin mi?",
                            message: `${r.sku} kodlu stok kaydı silinecek. Bu işlem geri alınamaz.`,
                            confirmLabel: "Sil",
                            danger: true,
                            run: () => deleteStock(r),
                          })
                        }
                      >
                        Sil
                      </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
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
            showToast("Stok bilgisi güncellendi.", "success");
          }}
        />
      )}
      {detailRow && <StockDetailDrawer row={detailRow} onClose={() => setDetailRow(null)} />}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          danger={confirmAction.danger}
          busy={bulkBusy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void runConfirmedAction()}
        />
      )}
    </div>
  );
}

function StockDetailDrawer({ row, onClose }: { row: StockItem; onClose: () => void }) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    api<StockMovement[]>(`/api/stock/${row.id}/movements`)
      .then((data) => {
        if (mounted) setMovements(data);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Hareket geçmişi alınamadı");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [row.id]);

  return (
    <div className={dStyles.overlay} role="presentation" onClick={onClose}>
      <div
        className={`${dStyles.modal} ${dStyles.modalWide}`}
        role="dialog"
        aria-modal
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 className={dStyles.modalTitle}>Stok detayı</h2>
        <div className={pStyles.detailGrid}>
          <div className={pStyles.readonlyBlock}>
            <span>Malzeme kodu</span>
            <p className={pStyles.readonlyValue}>{row.sku}</p>
          </div>
          <div className={pStyles.readonlyBlock}>
            <span>Ürün adı</span>
            <p className={pStyles.readonlyValue}>{row.name}</p>
          </div>
          <div className={pStyles.readonlyBlock}>
            <span>Miktar</span>
            <p className={pStyles.readonlyValue}>
              {formatQtyInteger(row.quantity)} {row.unit}
            </p>
          </div>
          <div className={pStyles.readonlyBlock}>
            <span>Durum</span>
            <p className={pStyles.readonlyValue}>{statusLabel[row.processStatus]}</p>
          </div>
          <div className={pStyles.readonlyBlock}>
            <span>Makina</span>
            <p className={pStyles.readonlyValue}>
              {row.machine ? `${row.machine.code} — ${row.machine.name}` : "—"}
            </p>
          </div>
          <div className={pStyles.readonlyBlock}>
            <span>Takip kodu</span>
            <p className={pStyles.readonlyValue}>{row.trackingCode ?? "—"}</p>
          </div>
          <div className={pStyles.readonlyBlock}>
            <span>Sevk</span>
            <p className={pStyles.readonlyValue}>
              {row.isShipped ? `${row.shipDestination ?? "Sevk edildi"} (${row.shippedAt ?? "tarih yok"})` : "Bekliyor"}
            </p>
          </div>
        </div>

        <p className={pStyles.sectionTitle}>Hareket Geçmişi</p>
        {loading && <p className="muted">Yükleniyor…</p>}
        {error && <p className={dStyles.formErr}>{error}</p>}
        {!loading && !error && movements.length === 0 && (
          <p className="muted">Bu stok için hareket kaydı yok.</p>
        )}
        <div className={pStyles.timeline}>
          {movements.map((movement) => (
            <div key={movement.id} className={pStyles.timelineItem}>
              <div className={pStyles.timelineHead}>
                <strong>{movementTypeLabel[movement.type] ?? movement.type}</strong>
                <span>{formatDateTime(movement.createdAt)}</span>
              </div>
              <div className={pStyles.timelineMeta}>
                <span>
                  Miktar: {movement.quantityBefore ?? "—"} → {movement.quantityAfter ?? "—"}
                </span>
                <span>
                  Makina: {machineLabel(movement.machineBefore, movement.machineIdBefore)} →{" "}
                  {machineLabel(movement.machineAfter, movement.machineIdAfter)}
                </span>
                <span>
                  Durum:{" "}
                  {movement.processStatusBefore ? statusLabel[movement.processStatusBefore] : "—"} →{" "}
                  {movement.processStatusAfter ? statusLabel[movement.processStatusAfter] : "—"}
                </span>
                <span>
                  Kullanıcı: {movement.actorUser?.name ?? movement.actorUser?.email ?? "Sistem"}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className={dStyles.modalActions}>
          <button type="button" className={dStyles.primary} onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
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
