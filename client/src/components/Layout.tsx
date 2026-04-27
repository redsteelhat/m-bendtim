import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import styles from "./Layout.module.css";

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} />
          M-BEND T.İ.M
        </div>
        <nav className={styles.nav}>
          <NavLink end className={styles.navLink} to="/">
            Özet
          </NavLink>
          <NavLink className={styles.navLink} to="/mal-kabul">
            Mal kabul
          </NavLink>
          <NavLink className={styles.navLink} to="/stok">
            Stoklar
          </NavLink>
          <NavLink className={styles.navLink} to="/sevk">
            Sevk
          </NavLink>
          <NavLink className={styles.navLink} to="/raporlar">
            Raporlar
          </NavLink>
          <NavLink className={styles.navLink} to="/makina">
            Makina
          </NavLink>
          {user?.role === "admin" && (
            <NavLink className={styles.navLink} to="/users">
              Kullanıcılar
            </NavLink>
          )}
        </nav>
        <div className={styles.footer}>
          <div className={styles.user}>
            <strong>{user?.name}</strong>
            <span className={styles.role}>{user?.role}</span>
          </div>
          <button type="button" className={styles.logout} onClick={logout}>
            Çıkış
          </button>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
