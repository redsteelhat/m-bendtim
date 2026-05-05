import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { MalKabulBatchResponse, MalKabulLine } from "../types";
import { formatQtyInteger } from "../formatQty";
import { dateOnlyLocal } from "../dateOnlyLocal";
import styles from "./dataPage.module.css";
import mkStyles from "./MalKabulPage.module.css";

function toInputDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function newLineKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type DraftLine = { key: string; materialCode: string; productName: string; quantity: string };
type MalKabulFilter = "active" | "cancelled" | "all";

export function MalKabulPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("malKabul.write");
  const [rows, setRows] = useState<MalKabulLine[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MalKabulLine | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MalKabulFilter>("active");

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setRows(await api<MalKabulLine[]>(`/api/mal-kabul?status=${filter}`));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.h1}>Mal kabul</h1>
        {canWrite && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setFormError(null);
              setModalOpen(true);
            }}
          >
            Stok girişi
          </button>
        )}
      </div>
      {!canWrite && <p className="muted" style={{ margin: "0 0 1rem" }}>Salt okunur görünüm.</p>}
      <p className="muted" style={{ margin: "0 0 1rem", maxWidth: "48rem" }}>
        Aynı irsaliyede birden fazla malzeme satırı girebilirsiniz; her satırda malzeme kodu,
        <strong> ürün adı</strong> ve adet girilir. <strong>İşlem tarihi</strong> kayıt anındaki gün
        olarak otomatik atanır. Adet kadar stokta <strong>ayrı kayıt</strong> (her biri 1 adet)
        açılır; ürün adı <strong>Stoklar</strong> listesinde görünür. Makina ve işlem durumu{" "}
        <strong>Ata</strong> ile yapılır.
      </p>
      <div className={mkStyles.filterBar} aria-label="Mal kabul filtreleri">
        <button
          type="button"
          className={filter === "active" ? mkStyles.filterActive : mkStyles.filterButton}
          onClick={() => setFilter("active")}
        >
          Aktif
        </button>
        <button
          type="button"
          className={filter === "cancelled" ? mkStyles.filterActive : mkStyles.filterButton}
          onClick={() => setFilter("cancelled")}
        >
          İptal edilen
        </button>
        <button
          type="button"
          className={filter === "all" ? mkStyles.filterActive : mkStyles.filterButton}
          onClick={() => setFilter("all")}
        >
          Tümü
        </button>
      </div>
      {loadError && <p className={styles.banner}>{loadError}</p>}
      {loading ? (
        <p className="muted">Yükleniyor…</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>İrsaliye no</th>
                <th>İşlem tarihi</th>
                <th>Malzeme kodu</th>
                <th>Ürün adı</th>
                <th>Miktar</th>
                <th>Durum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.irsaliyeNo}</td>
                  <td>{toInputDate(r.irsaliyeTarihi)}</td>
                  <td>{r.materialCode}</td>
                  <td>{(r.materialDescription ?? "").trim() || "—"}</td>
                  <td>{formatQtyInteger(r.quantity)}</td>
                  <td>
                    {r.isCancelled ? (
                      <span className={mkStyles.cancelledBadge}>İptal edildi</span>
                    ) : (
                      <span className={mkStyles.activeBadge}>Aktif</span>
                    )}
                  </td>
                  <td className={styles.actions}>
                    {canWrite && !r.isCancelled && (
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => setCancelTarget(r)}
                      >
                        İptal Et
                      </button>
                    )}
                    {r.isCancelled && r.cancelReason && (
                      <span className="muted" title={r.cancelReason}>
                        {r.cancelReason}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modalOpen && canWrite && (
        <MalKabulEntryModal
          formError={formError}
          onError={setFormError}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      )}
      {cancelTarget && canWrite && (
        <CancelMalKabulModal
          line={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={async () => {
            setCancelTarget(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CancelMalKabulModal({
  line,
  onClose,
  onCancelled,
}: {
  line: MalKabulLine;
  onClose: () => void;
  onCancelled: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      await api<MalKabulLine>(`/api/mal-kabul/${line.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: trimmed }),
      });
      await onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İptal edilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>Mal kabul iptali</h2>
        <form className={styles.modalForm} onSubmit={onSubmit}>
          <p className="muted" style={{ margin: 0 }}>
            {line.irsaliyeNo} / {line.materialCode} satırı iptal edilecek. İptal yalnızca ilgili
            stoklar bekliyor, makinasız ve sevk edilmemişse yapılır.
          </p>
          <label className={styles.field}>
            İptal nedeni
            <textarea
              className={styles.input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
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

function MalKabulEntryModal({
  formError,
  onError,
  onClose,
  onSaved,
}: {
  formError: string | null;
  onError: (s: string | null) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [irsaliyeNo, setIrsaliyeNo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [
    { key: newLineKey(), materialCode: "", productName: "", quantity: "1" },
  ]);
  const [busy, setBusy] = useState(false);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: newLineKey(), materialCode: "", productName: "", quantity: "1" },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((l) => l.key !== key);
    });
  }

  function updateLine(
    key: string,
    patch: Partial<Pick<DraftLine, "materialCode" | "productName" | "quantity">>
  ) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    onError(null);

    const payloadLines = lines
      .map((l) => ({
        materialCode: l.materialCode.trim(),
        productName: l.productName.trim(),
        quantity: Math.floor(Number(l.quantity)),
      }))
      .filter((l) => l.materialCode.length > 0);

    if (payloadLines.length === 0) {
      onError("En az bir malzeme kodu girin");
      return;
    }

    for (const l of payloadLines) {
      if (!l.productName) {
        onError(`«${l.materialCode}» için ürün adı girin`);
        return;
      }
      if (!Number.isFinite(l.quantity) || l.quantity < 1) {
        onError(`«${l.materialCode}» için adet en az 1 tam sayı olmalı`);
        return;
      }
    }

    setBusy(true);
    try {
      await api<MalKabulBatchResponse>("/api/mal-kabul/batch", {
        method: "POST",
        body: JSON.stringify({
          irsaliyeNo,
          lines: payloadLines.map(({ materialCode, productName, quantity }) => ({
            materialCode,
            productName,
            quantity,
          })),
        }),
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modal} ${styles.modalExtraWide}`}
        role="dialog"
        aria-modal
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>Mal kabul — stok girişi</h2>
        <form className={styles.modalForm} onSubmit={onSubmit}>
          <p className={mkStyles.sectionLabel}>İrsaliye (tüm malzemeler için ortak)</p>
          <label className={styles.field}>
            İrsaliye no
            <input
              className={styles.input}
              value={irsaliyeNo}
              onChange={(e) => setIrsaliyeNo(e.target.value)}
              required
            />
          </label>
          <p className={mkStyles.autoDateNote}>
            İşlem tarihi: <strong>{dateOnlyLocal()}</strong> (kayıt anındaki gün, otomatik)
          </p>

          <p className={mkStyles.sectionLabelSpaced}>
            Malzemeler (aynı irsaliyede farklı kodlar)
          </p>
          <div className={mkStyles.linesWrap}>
            <div className={mkStyles.linesHead}>
              <span>Malzeme kodu</span>
              <span>Ürün adı</span>
              <span>Adet</span>
              <span aria-hidden="true" />
            </div>
            {lines.map((line) => (
              <div key={line.key} className={mkStyles.lineRow}>
                <input
                  className={styles.input}
                  value={line.materialCode}
                  onChange={(e) => updateLine(line.key, { materialCode: e.target.value })}
                  placeholder="Örn. ABC-001"
                  aria-label="Malzeme kodu"
                />
                <input
                  className={styles.input}
                  value={line.productName}
                  onChange={(e) => updateLine(line.key, { productName: e.target.value })}
                  placeholder="Örn. Profil 40x40"
                  aria-label="Ürün adı"
                />
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  step={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  aria-label="Adet"
                />
                <button
                  type="button"
                  className={mkStyles.rmBtn}
                  disabled={lines.length <= 1}
                  onClick={() => removeLine(line.key)}
                  aria-label="Satırı kaldır"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={`${styles.ghost} ${mkStyles.addLine}`} onClick={addLine}>
            + Malzeme satırı ekle
          </button>
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
            Boş bırakılan malzeme kodlu satırlar kayda dahil edilmez. Tüm satırlar tek seferde
            kaydedilir; biri hata verirse hiçbiri işlenmez.
          </p>

          {formError && <p className={styles.formErr}>{formError}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.ghost} onClick={onClose}>
              İptal
            </button>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "Kaydediliyor…" : "Tümünü kaydet ve stoğa işle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
