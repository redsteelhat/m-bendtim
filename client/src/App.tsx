import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { MalKabulPage } from "./pages/MalKabulPage";
import { StokPage } from "./pages/StokPage";
import { SevkDetailPage, SevkPage } from "./pages/SevkPage";
import { MakinaPage } from "./pages/MakinaPage";
import { RaporlarPage } from "./pages/RaporlarPage";
import { ToastProvider } from "./components/ui/Toast";

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
    <ToastProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="mal-kabul" element={<MalKabulPage />} />
          <Route path="stok" element={<StokPage />} />
          <Route path="sevk" element={<SevkPage />} />
          <Route path="sevk/:id" element={<SevkDetailPage />} />
          <Route path="raporlar" element={<RaporlarPage />} />
          <Route path="makina" element={<MakinaPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
