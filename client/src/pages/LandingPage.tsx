import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import styles from "./LandingPage.module.css";

export function LandingPage() {
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
        <h1 className={styles.title}>Üretim takip paneli</h1>
        <p className={styles.text}>Mal kabul, stok, sevk ve makina durumlarını tek panelden izleyin.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} to="/login">
            Login
          </Link>
          <Link className={styles.secondary} to="/register">
            Register
          </Link>
        </div>
      </section>
    </main>
  );
}
