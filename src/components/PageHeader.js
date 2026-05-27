import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

export default function PageHeader({ title, subtitle }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const userInitial = session?.user?.email?.charAt(0)?.toUpperCase() || "U";

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="flex justify-between items-center mb-6">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {subtitle && <p className="text-slate-400 mt-1">{subtitle}</p>}
      </div>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="w-10 h-10 rounded-full bg-sky-400 text-black font-bold flex items-center justify-center"
        >
          {userInitial}
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/app");
              }}
              className="w-full text-left px-4 py-3 hover:bg-zinc-800"
            >
              Dashboard
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/crm");
              }}
              className="w-full text-left px-4 py-3 hover:bg-zinc-800"
            >
              CRM
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/schedule");
              }}
              className="w-full text-left px-4 py-3 hover:bg-zinc-800"
            >
              Schedule
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate("/settings");
              }}
              className="w-full text-left px-4 py-3 hover:bg-zinc-800"
            >
              Settings
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="w-full text-left px-4 py-3 hover:bg-zinc-800 text-red-400"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
