import { Navigate, Route, Routes } from "react-router-dom";
import BusinessGate from "../components/BusinessGate";
import ProtectedRoute from "../components/ProtectedRoute";
import Dashboard from "../pages/Dashboard/Dashboard";
import Login from "../pages/Registration&Login/Login";
import Register from "../pages/Registration&Login/Register";
import SetPassword from "../pages/Registration&Login/SetPassword";
import Settings from "../pages/Settings/Settings";
import CRM from "../pages/CRM/CRM";
import CustomerView from "../pages/CRM/Client/ClientView";
import JobView from "../pages/CRM/Job/JobView";
import Schedule from "../pages/Schedule/Schedule";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/set-password" element={<SetPassword />} />
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
        path="/crm/clients/:customerId"
        element={
          <ProtectedRoute>
            <BusinessGate>
              <CustomerView />
            </BusinessGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/crm/jobs/:jobId"
        element={
          <ProtectedRoute>
            <BusinessGate>
              <JobView />
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
