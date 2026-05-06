import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { MalKabulBatchResponse, MalKabulLine, ParsedIrsaliye, ParsedIrsaliyeLine } from "../types";
import { formatQtyInteger } from "../formatQty";
import { dateOnlyLocal } from "../dateOnlyLocal";
import { EmptyState, LoadingState } from "../components/ui/Feedback";
import { useToast } from "../components/ui/Toast";
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
  const { showToast } = useToast();
  const canWrite = hasPermission("malKabul.write");
  const [rows, setRows] = useState<MalKabulLine[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MalKabulLine | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MalKabulFilter>("active");
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    if (!normalizedQuery) return rows;
    return rows.filter((row) =>
      [row.irsaliyeNo, row.materialCode, row.materialDescription ?? ""]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
      .includes(normalizedQuery)
    );
  }, [query, rows]);

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
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setPdfImportOpen(true)}
            >
              PDF’den Aktar
            </button>
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
          </div>
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
        <input
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="İrsaliye, malzeme kodu veya ürün adı ara"
        />
      </div>
      {loadError && <p className={styles.banner}>{loadError}</p>}
      {loading ? (
        <LoadingState />
      ) : filteredRows.length === 0 ? (
        <EmptyState title="Mal kabul kaydı bulunamadı" text="Bu filtrelerle mal kabul kalemi bulunamadı." />
      ) : (
        <>
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
              {filteredRows.map((r) => (
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
        </>
      )}
      {modalOpen && canWrite && (
        <MalKabulEntryModal
          formError={formError}
          onError={setFormError}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await load();
            showToast("Mal kabul kaydı stoğa işlendi.", "success");
          }}
        />
      )}
      {pdfImportOpen && canWrite && (
        <PdfImportModal
          onClose={() => setPdfImportOpen(false)}
          onImported={async () => {
            setPdfImportOpen(false);
            await load();
            showToast("PDF mal kabul kaydı stoğa işlendi.", "success");
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
            showToast("Mal kabul kalemi iptal edildi.", "success");
          }}
        />
      )}
    </div>
  );
}

type DraftPdfLine = ParsedIrsaliyeLine & { key: string; quantityText: string };

function PdfImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [parsed, setParsed] = useState<ParsedIrsaliye | null>(null);
  const [documentNo, setDocumentNo] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [lines, setLines] = useState<DraftPdfLine[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSha256, setFileSha256] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const validationError = useMemo(() => {
    if (!documentNo.trim()) return "İrsaliye no gerekli";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) return "İrsaliye tarihi geçerli olmalı";
    if (lines.length === 0) return "En az bir satır gerekli";
    for (const line of lines) {
      if (!line.sku.trim()) return `${line.rowNo}. satırda malzeme kodu gerekli`;
      if (!line.name.trim()) return `${line.rowNo}. satırda malzeme açıklaması gerekli`;
      if (!Number.isFinite(Number(line.quantityText)) || Number(line.quantityText) <= 0) {
        return `${line.rowNo}. satırda miktar sıfırdan büyük olmalı`;
      }
      if (!line.unit.trim()) return `${line.rowNo}. satırda birim gerekli`;
    }
    return null;
  }, [documentDate, documentNo, lines]);

  async function parseFile(file: File) {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("Sadece PDF dosyası yükleyebilirsiniz.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("PDF dosyası en fazla 10MB olabilir.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setBusy(true);
    try {
      const response = await api<{ data: ParsedIrsaliye }>("/api/mal-kabul/import/pdf/parse", {
        method: "POST",
        body: formData,
      });
      const data = response.data;
      setParsed(data);
      setDocumentNo(data.documentNo);
      setDocumentDate(data.documentDate);
      setFileName(data.sourceFileName ?? file.name);
      setFileSha256(data.sourceFileSha256 ?? null);
      setLines(
        data.lines.map((line) => ({
          ...line,
          key: `${line.rowNo}-${line.sku}-${Math.random().toString(36).slice(2)}`,
          quantityText: String(line.quantity),
        }))
      );
    } catch (err) {
      setParsed(null);
      setLines([]);
      setError(err instanceof Error ? err.message : "PDF okunamadı");
    } finally {
      setBusy(false);
    }
  }

  function updateLine(key: string, patch: Partial<DraftPdfLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function confirmImport() {
    setError(null);
    if (validationError) {
      setError(validationError);
      return;
    }
    setConfirming(true);
    try {
      await api("/api/mal-kabul/import/pdf/confirm", {
        method: "POST",
        body: JSON.stringify({
          documentNo: documentNo.trim(),
          documentDate,
          sourceFileName: fileName,
          sourceFileSha256: fileSha256,
          warnings: parsed?.warnings ?? [],
          lines: lines.map((line) => ({
            rowNo: line.rowNo,
            sku: line.sku.trim(),
            name: line.name.trim(),
            quantity: Number(line.quantityText),
            unit: line.unit.trim(),
          })),
        }),
      });
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF mal kabul kaydı oluşturulamadı");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modal} ${mkStyles.importModal}`}
        role="dialog"
        aria-modal
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>PDF’den Mal Kabul Aktar</h2>
        <div className={styles.modalForm}>
          <label className={mkStyles.uploadBox}>
            <span>{busy ? "PDF okunuyor..." : "E-irsaliye PDF seç"}</span>
            <input
              type="file"
              accept="application/pdf"
              disabled={busy || confirming}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void parseFile(file);
              }}
            />
          </label>

          {error && (
            <p className={styles.formErr}>
              {error === "Bu irsaliye daha önce işlenmiş."
                ? "Bu irsaliye daha önce işlenmiş."
                : error}
            </p>
          )}

          {parsed && (
            <>
              <div className={mkStyles.previewHeader}>
                <label className={styles.field}>
                  İrsaliye No
                  <input
                    className={styles.input}
                    value={documentNo}
                    onChange={(e) => setDocumentNo(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  İrsaliye Tarihi
                  <input
                    className={styles.input}
                    type="date"
                    value={documentDate}
                    onChange={(e) => setDocumentDate(e.target.value)}
                  />
                </label>
                <div className={mkStyles.previewStat}>
                  <span>Satır Sayısı</span>
                  <strong>{lines.length}</strong>
                </div>
              </div>

              {(parsed.warnings ?? []).length > 0 && (
                <div className={mkStyles.warningBox}>
                  {parsed.warnings.map((warning, index) => (
                    <p key={`${warning}-${index}`}>{warning}</p>
                  ))}
                </div>
              )}

              <div className={mkStyles.previewTableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Sıra No</th>
                      <th>Malzeme Kodu</th>
                      <th>Malzeme Açıklaması</th>
                      <th>Miktar</th>
                      <th>Birim</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key}>
                        <td>
                          <input
                            className={styles.input}
                            type="number"
                            min={1}
                            value={line.rowNo}
                            onChange={(e) => updateLine(line.key, { rowNo: Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.input}
                            value={line.sku}
                            onChange={(e) => updateLine(line.key, { sku: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.input}
                            value={line.name}
                            onChange={(e) => updateLine(line.key, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.input}
                            type="number"
                            min={0.001}
                            step="0.001"
                            value={line.quantityText}
                            onChange={(e) => updateLine(line.key, { quantityText: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className={styles.input}
                            value={line.unit}
                            onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                          />
                        </td>
                        <td className={styles.actions}>
                          <button
                            type="button"
                            className={styles.dangerBtn}
                            onClick={() => setLines((current) => current.filter((x) => x.key !== line.key))}
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.ghost} onClick={onClose} disabled={busy || confirming}>
              Vazgeç
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={!parsed || Boolean(validationError) || busy || confirming}
              onClick={() => void confirmImport()}
              title={validationError ?? undefined}
            >
              {confirming ? "Kaydediliyor..." : "Stok Girişini Onayla"}
            </button>
          </div>
        </div>
      </div>
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
