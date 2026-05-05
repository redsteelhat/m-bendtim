import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { Machine } from "../types";
import styles from "./dataPage.module.css";
import mStyles from "./MakinaPage.module.css";

function durumCell(m: Machine) {
  const d = m.makinaStokDurumu ?? "atama_yok";
  const atanan = m.stokAtananSatir ?? 0;
  const tamam = m.stokTamamlananSatir ?? 0;
  if (d === "atama_yok") {
    return (
      <span>
        <span className={mStyles.badgeYok}>Atama yok</span>
        <span className={mStyles.detail}>Bu makinaya atanmış stok satırı yok.</span>
      </span>
    );
  }
  if (d === "tamamlandi") {
    return (
      <span>
        <span className={mStyles.badgeTamam}>Tamamlandı</span>
        <span className={mStyles.detail}>
          Atanan {atanan} malzeme satırının tamamı «Tamamlandı».
        </span>
      </span>
    );
  }
  return (
    <span>
      <span className={mStyles.badgeDevam}>Devam ediyor</span>
      <span className={mStyles.detail}>
        {tamam} / {atanan} satır tamamlandı
      </span>
    </span>
  );
}

export function MakinaPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("machines.write");
  const [rows, setRows] = useState<Machine[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setRows(await api<Machine[]>("/api/machines"));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.h1}>Makina</h1>
        {canWrite && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setEditing(null);
              setFormError(null);
              setModal("create");
            }}
          >
            Yeni makina
          </button>
        )}
      </div>
      {!canWrite && <p className="muted" style={{ margin: "0 0 1rem" }}>Salt okunur görünüm.</p>}
      {loadError && <p className={styles.banner}>{loadError}</p>}
      {loading ? (
        <p className="muted">Yükleniyor…</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Makina kodu</th>
                <th>Makina seri no</th>
                <th>Atanan stok</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{durumCell(r)}</td>
                  {canWrite && (
                    <td className={styles.actions}>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => {
                          setEditing(r);
                          setFormError(null);
                          setModal("edit");
                        }}
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={async () => {
                          if (!confirm(`Seri no «${r.name}» silinsin mi?`)) return;
                          try {
                            await api(`/api/machines/${r.id}`, { method: "DELETE" });
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
      {modal && canWrite && (
        <MachineModal
          mode={modal}
          initial={editing}
          formError={formError}
          onError={setFormError}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function MachineModal({
  mode,
  initial,
  formError,
  onError,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: Machine | null;
  formError: string | null;
  onError: (s: string | null) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      const body = { code, name };
      if (mode === "create") {
        await api<Machine>("/api/machines", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else if (initial) {
        await api(`/api/machines/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
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
        className={`${styles.modal} ${styles.modalWide}`}
        role="dialog"
        aria-modal
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>
          {mode === "create" ? "Yeni makina" : "Makina düzenle"}
        </h2>
        <form className={styles.modalForm} onSubmit={onSubmit}>
          <label className={styles.field}>
            Makina kodu
            <input
              className={styles.input}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            Makina seri no
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          {formError && <p className={styles.formErr}>{formError}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.ghost} onClick={onClose}>
              İptal
            </button>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
