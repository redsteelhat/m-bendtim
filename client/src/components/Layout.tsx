import { useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Factory,
  LayoutDashboard,
  Truck,
  Users,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import styles from "./Layout.module.css";

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className={styles.shell}>
      <button
        type="button"
        className={styles.mobileMenuButton}
        onClick={() => setSidebarOpen((open) => !open)}
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
      >
        <span />
        <span />
        <span />
      </button>
      {sidebarOpen && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Menüyü kapat"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        id="app-sidebar"
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""} ${
          sidebarCollapsed ? styles.sidebarCollapsed : ""
        }`}
      >
        <div className={styles.sidebarTop}>
          <div className={styles.brand}>
            <span className={styles.brandMark} />
            <span className={styles.brandText}>M-BEND T.İ.M</span>
          </div>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </div>
        <nav className={styles.nav}>
          <NavLink end className={styles.navLink} to="/dashboard" title="Özet">
            <LayoutDashboard className={styles.navIcon} aria-hidden="true" />
            <span className={styles.navText}>Özet</span>
          </NavLink>
          <NavLink className={styles.navLink} to="/mal-kabul" title="Mal kabul">
            <ClipboardList className={styles.navIcon} aria-hidden="true" />
            <span className={styles.navText}>Mal kabul</span>
          </NavLink>
          <NavLink className={styles.navLink} to="/stok" title="Stoklar">
            <Boxes className={styles.navIcon} aria-hidden="true" />
            <span className={styles.navText}>Stoklar</span>
          </NavLink>
          <NavLink className={styles.navLink} to="/sevk" title="Sevk">
            <Truck className={styles.navIcon} aria-hidden="true" />
            <span className={styles.navText}>Sevk</span>
          </NavLink>
          <NavLink className={styles.navLink} to="/raporlar" title="Raporlar">
            <BarChart3 className={styles.navIcon} aria-hidden="true" />
            <span className={styles.navText}>Raporlar</span>
          </NavLink>
          <NavLink className={styles.navLink} to="/makina" title="Makina">
            <Factory className={styles.navIcon} aria-hidden="true" />
            <span className={styles.navText}>Makina</span>
          </NavLink>
          {user?.role === "admin" && (
            <NavLink className={styles.navLink} to="/users" title="Kullanıcılar">
              <Users className={styles.navIcon} aria-hidden="true" />
              <span className={styles.navText}>Kullanıcılar</span>
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
