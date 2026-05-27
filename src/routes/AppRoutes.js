import { Navigate, Route, Routes } from "react-router-dom";
import BusinessGate from "../components/BusinessGate";
import ProtectedRoute from "../components/ProtectedRoute";
import Dashboard from "../pages/Dashboard";
import Login from "../pages/Login";
import Profile from "../pages/Profile";
import Register from "../pages/Register";
import Settings from "../pages/Settings";
import CRM from "../pages/CRM";
import Schedule from "../pages/Schedule";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <BusinessGate>
              <Dashboard />
            </BusinessGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/crm"
        element={
          <ProtectedRoute>
            <BusinessGate>
              <CRM />
            </BusinessGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <BusinessGate>
              <Schedule />
            </BusinessGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <BusinessGate>
              <Profile />
            </BusinessGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <BusinessGate>
              <Settings />
            </BusinessGate>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}
