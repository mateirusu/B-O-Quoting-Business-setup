import "./App.css";
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import { AuthProvider } from "./context/AuthContext";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-shell">
          <AppRoutes />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
