import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import styles from "./LandingPage.module.css";

export function RegisterPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className={styles.wrap}>
        <p className="muted">Yükleniyor...</p>
      </main>
    );
  }

  if (user) return <Navigate to="/app" replace />;

  return (
    <main className={styles.wrap}>
      <section className={styles.hero}>
        <div className={styles.brand}>
          <span className={styles.mark} />
          <span>M-BEND T.I.M</span>
        </div>
        <h1 className={styles.title}>Kayıt</h1>
        <p className={styles.text}>Kayıt ekranı henüz aktif değil. Şimdilik kullanıcıları panel içinden admin oluşturur.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} to="/login">
            Login
          </Link>
          <Link className={styles.secondary} to="/">
            Ana sayfa
          </Link>
        </div>
      </section>
    </main>
  );
}
