import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

export default function PageHeader({ title, subtitle }) {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const userInitial = session?.user?.email?.charAt(0)?.toUpperCase() || "U";
  const avatarUrl = profile?.profile_image_url;

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

      <div className="flex items-center gap-2">
        {(profile?.first_name || profile?.last_name) && (
          <span className="text-sm text-slate-300">
            {[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
          </span>
        )}
        <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="w-10 h-10 rounded-full bg-sky-400 text-black font-bold flex items-center justify-center"
          style={{ padding: 0, overflow: 'hidden' }}
        >
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : userInitial}
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-44 rounded-xl shadow-lg overflow-hidden" style={{ background: "#0e1729", border: "1px solid rgba(255,255,255,0.09)" }}>
            <button
              onClick={() => { setMenuOpen(false); navigate("/app"); }}
              className="w-full text-left px-4 py-3"
              style={{ borderRadius: 0, background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = "#111e33"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Dashboard
            </button>
            <button
              onClick={() => { setMenuOpen(false); navigate("/crm"); }}
              className="w-full text-left px-4 py-3"
              style={{ borderRadius: 0, background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = "#111e33"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              CRM
            </button>
            <button
              onClick={() => { setMenuOpen(false); navigate("/schedule"); }}
              className="w-full text-left px-4 py-3"
              style={{ borderRadius: 0, background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = "#111e33"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Schedule
            </button>
            <button
              onClick={() => { setMenuOpen(false); navigate("/settings"); }}
              className="w-full text-left px-4 py-3"
              style={{ borderRadius: 0, background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = "#111e33"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Settings
            </button>
            <button
              onClick={() => { setMenuOpen(false); logout(); }}
              className="w-full text-left px-4 py-3 text-red-400"
              style={{ borderRadius: 0, background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = "#111e33"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Logout
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}