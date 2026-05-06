import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { Shipment, StockItem } from "../types";
import { formatQtyInteger } from "../formatQty";
import { dateOnlyLocal } from "../dateOnlyLocal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState, LoadingState } from "../components/ui/Feedback";
import { useToast } from "../components/ui/Toast";
import styles from "./dataPage.module.css";
import sevkStyles from "./SevkPage.module.css";

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function shipmentStatusLabel(status: Shipment["status"]): string {
  if (status === "iptal") return "İptal";
  if (status === "hazirlik") return "Hazırlık";
  return "Sevk edildi";
}

function itemCount(shipment: Shipment): number {
  return shipment.items?.length ?? 0;
}

export function SevkPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const canWrite = hasPermission("shipments.write");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [destination, setDestination] = useState("");
  const [shippedAt, setShippedAt] = useState(dateOnlyLocal());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [shipmentQuery, setShipmentQuery] = useState("");
  const [stockQuery, setStockQuery] = useState("");

  const availableStock = useMemo(
    () => stockRows.filter((row) => row.processStatus === "tamamlandi" && !row.isShipped),
    [stockRows]
  );
  const filteredAvailableStock = useMemo(() => {
    const normalizedQuery = stockQuery.trim().toLocaleLowerCase("tr-TR");
    if (!normalizedQuery) return availableStock;
    return availableStock.filter((row) =>
      [row.sku, row.name, row.machine?.code ?? "", row.machine?.name ?? ""]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedQuery)
    );
  }, [availableStock, stockQuery]);
  const filteredShipments = useMemo(() => {
    const normalizedQuery = shipmentQuery.trim().toLocaleLowerCase("tr-TR");
    if (!normalizedQuery) return shipments;
    return shipments.filter((shipment) =>
      [shipment.shipmentNo, shipment.destination, shipment.createdByUser?.name ?? "", shipment.createdByUser?.email ?? ""]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedQuery)
    );
  }, [shipmentQuery, shipments]);
  const selectedCount = selectedIds.size;
  const totalSelectedQty = useMemo(
    () =>
      availableStock
        .filter((row) => selectedIds.has(row.id))
        .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
    [availableStock, selectedIds]
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [shipmentList, completedStock] = await Promise.all([
        api<Shipment[]>("/api/shipments"),
        api<StockItem[]>("/api/stock/sevk-bekleyen"),
      ]);
      setShipments(shipmentList);
      setStockRows(completedStock);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sevk verileri alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(availableStock.map((row) => row.id));
      const next = new Set<number>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [availableStock]);

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function requestCreateShipment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const dest = destination.trim();
    if (!dest) {
      setError("Sevk hedefi gerekli");
      return;
    }
    if (selectedIds.size === 0) {
      setError("En az bir tamamlanmış stok satırı seçin");
      return;
    }
    setConfirmCreateOpen(true);
  }

  async function createShipment() {
    setError(null);
    const dest = destination.trim();
    setBusy(true);
    try {
      await api<Shipment>("/api/shipments", {
        method: "POST",
        body: JSON.stringify({
          destination: dest,
          shippedAt: shippedAt || undefined,
          notes: notes.trim() || null,
          stockItemIds: [...selectedIds],
        }),
      });
      setSelectedIds(new Set());
      setDestination("");
      setNotes("");
      setShippedAt(dateOnlyLocal());
      await load();
      showToast("Sevk belgesi oluşturuldu.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sevk belgesi oluşturulamadı";
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
      setConfirmCreateOpen(false);
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
            Tamamlanmış ve henüz sevk edilmemiş stokları seçerek belge bazlı sevk oluşturun. Sevk
            oluşturulduğunda seçili stoklar sevk edilmiş olarak işaretlenir.
          </>
        ) : (
          <>Salt okunur görünüm. Sevk belgelerini ve tamamlanmış stokları inceleyebilirsiniz.</>
        )}
      </p>
      {error && <p className={styles.banner}>{error}</p>}

      {canWrite && (
        <form className={sevkStyles.createPanel} onSubmit={requestCreateShipment}>
          <div className={sevkStyles.createFields}>
            <label className={styles.field}>
              Nereye
              <input
                className={styles.input}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Örn. Ankara depo"
                required
              />
            </label>
            <label className={styles.field}>
              Sevk tarihi
              <input
                className={styles.input}
                type="date"
                value={shippedAt}
                onChange={(e) => setShippedAt(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              Not
              <input
                className={styles.input}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opsiyonel"
              />
            </label>
          </div>
          <div className={sevkStyles.createFooter}>
            <span>
              {selectedCount} satır seçili, toplam {formatQtyInteger(totalSelectedQty)}
            </span>
            <button type="submit" className={styles.primary} disabled={busy || selectedCount === 0}>
              {busy ? "Oluşturuluyor…" : "Sevk belgesi oluştur"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <section className={sevkStyles.section}>
            <h2 className={sevkStyles.sectionTitle}>Sevk bekleyen tamamlanmış stoklar</h2>
            <input
              className={`${styles.input} ${sevkStyles.searchInput}`}
              value={stockQuery}
              onChange={(e) => setStockQuery(e.target.value)}
              placeholder="Malzeme, ürün veya makina ara"
            />
            {filteredAvailableStock.length === 0 ? (
              <EmptyState title="Sevk bekleyen stok yok" text="Bu filtrelerle tamamlanmış stok bulunamadı." />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {canWrite && <th className={sevkStyles.checkCol} />}
                      <th>Malzeme kodu</th>
                      <th>Ürün adı</th>
                      <th>Miktar</th>
                      <th>Makina</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAvailableStock.map((row) => (
                      <tr key={row.id}>
                        {canWrite && (
                          <td className={sevkStyles.checkCol}>
                            <input
                              type="checkbox"
                              className={sevkStyles.rowCheck}
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggle(row.id)}
                              aria-label={`Seç: ${row.sku}`}
                            />
                          </td>
                        )}
                        <td>{row.sku}</td>
                        <td>{row.name}</td>
                        <td>{formatQtyInteger(row.quantity)} {row.unit}</td>
                        <td>{row.machine ? `${row.machine.code} — ${row.machine.name}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={sevkStyles.section}>
            <h2 className={sevkStyles.sectionTitle}>Sevk belgeleri</h2>
            <input
              className={`${styles.input} ${sevkStyles.searchInput}`}
              value={shipmentQuery}
              onChange={(e) => setShipmentQuery(e.target.value)}
              placeholder="Belge no, hedef veya oluşturan ara"
            />
            {filteredShipments.length === 0 ? (
              <EmptyState title="Sevk belgesi bulunamadı" text="Bu filtrelerle sevk belgesi bulunamadı." />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Belge no</th>
                      <th>Durum</th>
                      <th>Nereye</th>
                      <th>Sevk tarihi</th>
                      <th>Satır</th>
                      <th>Oluşturan</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShipments.map((shipment) => (
                      <tr key={shipment.id}>
                        <td>{shipment.shipmentNo}</td>
                        <td>
                          <span
                            className={
                              shipment.status === "iptal"
                                ? sevkStyles.badgeIptal
                                : sevkStyles.badgeSevkli
                            }
                          >
                            {shipmentStatusLabel(shipment.status)}
                          </span>
                        </td>
                        <td>{shipment.destination}</td>
                        <td>{toInputDate(shipment.shippedAt)}</td>
                        <td>{itemCount(shipment)}</td>
                        <td>{shipment.createdByUser?.name ?? shipment.createdByUser?.email ?? "—"}</td>
                        <td className={styles.actions}>
                          <Link className={styles.linkBtn} to={`/sevk/${shipment.id}`}>
                            Detay
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {confirmCreateOpen && (
        <ConfirmDialog
          title="Sevk belgesi oluşturulsun mu?"
          message={`${selectedCount} stok kalemi ${destination.trim()} hedefi için sevk edildi olarak işaretlenecek.`}
          confirmLabel="Sevk oluştur"
          busy={busy}
          onCancel={() => setConfirmCreateOpen(false)}
          onConfirm={() => void createShipment()}
        />
      )}
    </div>
  );
}

export function SevkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === "admin";
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setShipment(await api<Shipment>(`/api/shipments/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sevk belgesi alınamadı");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="muted">Yükleniyor…</p>;
  if (error) return <p className={styles.banner}>{error}</p>;
  if (!shipment) return <p className="muted">Sevk belgesi bulunamadı.</p>;

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.h1}>{shipment.shipmentNo}</h1>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>
            {shipment.destination} / {toInputDate(shipment.shippedAt)}
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={() => navigate("/sevk")}>
            Geri
          </button>
          {isAdmin && shipment.status !== "iptal" && (
            <button type="button" className={styles.dangerBtn} onClick={() => setCancelOpen(true)}>
              Sevki iptal et
            </button>
          )}
        </div>
      </div>

      <div className={sevkStyles.detailGrid}>
        <div>
          <span>Durum</span>
          <strong>{shipmentStatusLabel(shipment.status)}</strong>
        </div>
        <div>
          <span>Oluşturan</span>
          <strong>{shipment.createdByUser?.name ?? shipment.createdByUser?.email ?? "—"}</strong>
        </div>
        <div>
          <span>Not</span>
          <strong>{shipment.notes?.trim() || "—"}</strong>
        </div>
        {shipment.status === "iptal" && (
          <div>
            <span>İptal nedeni</span>
            <strong>{shipment.cancelReason ?? "—"}</strong>
          </div>
        )}
      </div>

      <section className={sevkStyles.section}>
        <h2 className={sevkStyles.sectionTitle}>Sevk kalemleri</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Malzeme kodu</th>
                <th>Ürün adı</th>
                <th>Miktar</th>
                <th>Makina</th>
              </tr>
            </thead>
            <tbody>
              {(shipment.items ?? []).map((item) => {
                const stock = item.stockItem;
                return (
                  <tr key={item.id}>
                    <td>{stock?.sku ?? `#${item.stockItemId}`}</td>
                    <td>{stock?.name ?? "—"}</td>
                    <td>{stock ? `${formatQtyInteger(stock.quantity)} ${stock.unit}` : "—"}</td>
                    <td>
                      {stock?.machine ? `${stock.machine.code} — ${stock.machine.name}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {cancelOpen && (
        <CancelShipmentModal
          shipment={shipment}
          onClose={() => setCancelOpen(false)}
          onCancelled={async () => {
            setCancelOpen(false);
            await load();
            showToast("Sevk belgesi iptal edildi.", "success");
          }}
        />
      )}
    </div>
  );
}

function CancelShipmentModal({
  shipment,
  onClose,
  onCancelled,
}: {
  shipment: Shipment;
  onClose: () => void;
  onCancelled: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("İptal nedeni gerekli");
      return;
    }
    setBusy(true);
    try {
      await api<Shipment>(`/api/shipments/${shipment.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: trimmed }),
      });
      await onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sevk iptal edilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal onClick={(ev) => ev.stopPropagation()}>
        <h2 className={styles.modalTitle}>Sevk iptali</h2>
        <form className={styles.modalForm} onSubmit={onSubmit}>
          <p className="muted" style={{ margin: 0 }}>
            {shipment.shipmentNo} belgesi iptal edilecek ve bağlı stoklar güvenliyse sevk edilmemiş
            duruma alınacak.
          </p>
          <label className={styles.field}>
            İptal nedeni
            <textarea
              className={styles.input}
              rows={4}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </label>
          {error && <p className={styles.formErr}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.ghost} onClick={onClose}>
              Vazgeç
            </button>
            <button type="submit" className={styles.dangerBtn} disabled={busy}>
              {busy ? "İptal ediliyor…" : "İptal Et"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
