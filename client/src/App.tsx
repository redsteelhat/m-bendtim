import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
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
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/app"
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
      <Route path="/mal-kabul" element={<Navigate to="/app/mal-kabul" replace />} />
      <Route path="/stok" element={<Navigate to="/app/stok" replace />} />
      <Route path="/sevk" element={<Navigate to="/app/sevk" replace />} />
      <Route path="/raporlar" element={<Navigate to="/app/raporlar" replace />} />
      <Route path="/makina" element={<Navigate to="/app/makina" replace />} />
      <Route path="/users" element={<Navigate to="/app/users" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
