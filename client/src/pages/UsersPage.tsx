import { FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { User, UserRole } from "../types";
import styles from "./dataPage.module.css";

export function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const list = await api<User[]>("/api/users");
      setUsers(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me?.role === "admin") void load();
  }, [me?.role, load]);

  if (me?.role !== "admin") return <Navigate to="/dashboard" replace />;

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.h1}>Kullanıcılar</h1>
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setModal("create");
          }}
        >
          Yeni kullanıcı
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
                <th>ID</th>
                <th>Ad</th>
                <th>E-posta</th>
                <th>Rol</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={styles.role}>{u.role}</span>
                  </td>
                  <td className={styles.actions}>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => {
                        setEditing(u);
                        setFormError(null);
                        setModal("edit");
                      }}
                    >
                      Düzenle
                    </button>
                    {u.id !== me.id && (
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={async () => {
                          if (!confirm(`${u.email} silinsin mi?`)) return;
                          try {
                            await api(`/api/users/${u.id}`, { method: "DELETE" });
                            await load();
                          } catch (e) {
                            alert(
                              e instanceof Error ? e.message : "Silinemedi"
                            );
                          }
                        }}
                      >
                        Sil
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <UserFormModal
          mode={modal}
          initial={editing}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await load();
          }}
          onError={setFormError}
          formError={formError}
        />
      )}
    </div>
  );
}

function UserFormModal({
  mode,
  initial,
  onClose,
  onSaved,
  formError,
  onError,
}: {
  mode: "create" | "edit";
  initial: User | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  formError: string | null;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(initial?.role ?? "operator");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      if (mode === "create") {
        if (!password) {
          onError("Şifre gerekli");
          setBusy(false);
          return;
        }
        await api<User>("/api/users", {
          method: "POST",
          body: JSON.stringify({ name, email, password, role }),
        });
      } else if (initial) {
        const body: Record<string, unknown> = { name, email, role };
        if (password.length > 0) body.password = password;
        await api(`/api/users/${initial.id}`, {
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
        className={styles.modal}
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>
          {mode === "create" ? "Yeni kullanıcı" : "Kullanıcı düzenle"}
        </h2>
        <form className={styles.modalForm} onSubmit={onSubmit}>
          <label className={styles.field}>
            Ad
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            E-posta
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            {mode === "create" ? "Şifre" : "Yeni şifre (isteğe bağlı)"}
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === "create"}
              placeholder={mode === "edit" ? "Boş bırakırsanız değişmez" : ""}
            />
          </label>
          <label className={styles.field}>
            Rol
            <select
              className={styles.input}
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="admin">Yönetici</option>
              <option value="operator">Operatör</option>
              <option value="viewer">Görüntüleyici</option>
            </select>
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
