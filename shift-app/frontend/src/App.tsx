import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Nav } from "./components/Nav";
import { LoginPage } from "./pages/LoginPage";
import { AvailabilityPage } from "./pages/AvailabilityPage";
import { ShiftCalendarPage } from "./pages/ShiftCalendarPage";
import { RequestsPage } from "./pages/RequestsPage";
import { AdminHolidaysPage } from "./pages/AdminHolidaysPage";

export function App() {
  const { user, loading } = useAuth();

  if (loading) return <p className="center-message">読み込み中...</p>;
  if (!user) return <LoginPage />;

  return (
    <>
      <Nav />
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/availability" replace />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/calendar" element={<ShiftCalendarPage />} />
          <Route path="/requests" element={<RequestsPage />} />
          {user.isAdmin && <Route path="/holidays" element={<AdminHolidaysPage />} />}
          <Route path="*" element={<Navigate to="/availability" replace />} />
        </Routes>
      </main>
    </>
  );
}
