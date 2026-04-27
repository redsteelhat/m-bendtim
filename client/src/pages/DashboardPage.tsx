import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api";
import type { DashboardSummary } from "../types";
import { formatQtyInteger } from "../formatQty";
import styles from "./DashboardPage.module.css";

function toDateStr(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function operasyonLinks() {
  return [
    { to: "/mal-kabul", label: "Mal kabul" },
    { to: "/stok", label: "Stoklar" },
    { to: "/sevk", label: "Sevk" },
    { to: "/raporlar", label: "Raporlar" },
    { to: "/makina", label: "Makina" },
  ];
}

function navCardHue(to: string): string {
  switch (to) {
    case "/mal-kabul":
      return styles.navMalKabul;
    case "/stok":
      return styles.navStok;
    case "/sevk":
      return styles.navSevk;
    case "/raporlar":
      return styles.navRaporlar;
    case "/makina":
      return styles.navMakina;
    default:
      return "";
  }
}

export function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setSummary(await api<DashboardSummary>("/api/dashboard/summary"));
    } catch (e) {
      setSummary(null);
      setLoadError(e instanceof Error ? e.message : "Özet alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  return (
    <div>
      <h1 className={styles.h1}>Merhaba, {user?.name}</h1>
      <p className={styles.lead}>
        Stok, sevk ve mal kabul özetini aşağıdaki kartlardan takip edebilirsiniz.
      </p>

      {loadError && <p className={styles.banner}>{loadError}</p>}

      {loading ? (
        <p className="muted">Özet yükleniyor…</p>
      ) : summary ? (
        <div className={styles.mainGrid}>
          <Link to="/stok" className={`${styles.card} ${styles.statCard} ${styles.cardStok}`}>
            <div className={styles.statCardTitle}>Stok</div>
            <p className={styles.statMain}>{summary.stock.total}</p>
            <p className={styles.statLabel}>toplam satır</p>
            <ul className={styles.statBreakdown}>
              <li>
                <span>Bekliyor</span>
                <strong>{summary.stock.bekliyor}</strong>
              </li>
              <li>
                <span>İşleniyor</span>
                <strong>{summary.stock.isleniyor}</strong>
              </li>
              <li>
                <span>Tamamlandı</span>
                <strong>{summary.stock.tamamlandi}</strong>
              </li>
            </ul>
          </Link>

          <Link to="/sevk" className={`${styles.card} ${styles.statCard} ${styles.cardSevk}`}>
            <div className={styles.statCardTitle}>Sevk</div>
            <ul className={styles.sevkPair}>
              <li>
                <p className={styles.statMain}>{summary.sevk.bekleyen}</p>
                <p className={styles.statLabel}>sevk bekleyen</p>
              </li>
              <li>
                <p className={styles.statMain}>{summary.sevk.edildi}</p>
                <p className={styles.statLabel}>sevk edildi</p>
              </li>
            </ul>
          </Link>

          <Link to="/makina" className={`${styles.card} ${styles.statCard} ${styles.cardMakina}`}>
            <div className={styles.statCardTitle}>Makina</div>
            <p className={styles.statMain}>{summary.machines.total}</p>
            <p className={styles.statLabel}>kayıtlı makina</p>
          </Link>

          <div className={`${styles.card} ${styles.cardMalKabul}`}>
            <div className={styles.statCardTitle}>
              <Link to="/mal-kabul">Son mal kabuller</Link>
            </div>
            {summary.recentMalKabul.length === 0 ? (
              <p className={styles.muted}>Henüz mal kabul kaydı yok.</p>
            ) : (
              <ul className={styles.malKabulList}>
                {summary.recentMalKabul.map((r) => {
                  const extraDesc = (r.materialDescription ?? "").trim();
                  const showDesc =
                    extraDesc.length > 0 && extraDesc !== r.materialCode.trim();
                  return (
                    <li key={r.id} className={styles.malKabulRow}>
                      <span className={styles.mkCode}>{r.materialCode}</span>
                      <span className={styles.mkQty}>{formatQtyInteger(r.quantity)} adet</span>
                      <span className={styles.mkDate}>{toDateStr(r.irsaliyeTarihi)}</span>
                      {showDesc ? (
                        <span className={styles.mkDesc} title={extraDesc}>
                          {extraDesc}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {operasyonLinks().map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`${styles.card} ${styles.navCard} ${navCardHue(to)}`}
            >
              {label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link to="/users" className={`${styles.card} ${styles.navCard} ${styles.navUsers}`}>
              Kullanıcılar
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
