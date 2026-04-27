import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { MalKabulPage } from "./pages/MalKabulPage";
import { StokPage } from "./pages/StokPage";
import { SevkPage } from "./pages/SevkPage";
import { MakinaPage } from "./pages/MakinaPage";
import { RaporlarPage } from "./pages/RaporlarPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="center-screen">
        <p className="muted">Yükleniyor…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="mal-kabul" element={<MalKabulPage />} />
        <Route path="stok" element={<StokPage />} />
        <Route path="sevk" element={<SevkPage />} />
        <Route path="raporlar" element={<RaporlarPage />} />
        <Route path="makina" element={<MakinaPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
