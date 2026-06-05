import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../../supabaseClient";

export default function SetPassword() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Wait up to 4 s for Supabase to process the URL hash from the confirmation link
    const timeout = setTimeout(() => setChecking(false), 4000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        setChecking(false);
        clearTimeout(timeout);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session);
      }
      setChecking(false);
      clearTimeout(timeout);
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const pwCriteria = [
    { label: "At least 8 characters",         met: newPassword.length >= 8 },
    { label: "At least one uppercase letter",  met: /[A-Z]/.test(newPassword) },
    { label: "At least one lowercase letter",  met: /[a-z]/.test(newPassword) },
    { label: "At least one number",            met: /[0-9]/.test(newPassword) },
    { label: "At least one special character", met: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const pwValid = pwCriteria.every(c => c.met);

  const handleSetPassword = async () => {
    setError(null);
    if (!pwValid) { setError("Password does not meet all requirements."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }

    setSaving(true);
    try {
      // Set the password via REST using the session from the confirmation link
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      let pwRes;
      try {
        pwRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ password: newPassword }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!pwRes.ok) {
        const body = await pwRes.json().catch(() => ({}));
        throw new Error(body.msg || body.message || `Failed (${pwRes.status})`);
      }

      // Create the profile record using metadata stored during registration
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata || {};
        await supabase.from("profile").upsert({
          user_id: user.id,
          first_name: meta.first_name || "",
          last_name: meta.last_name || "",
          mobile_number: meta.mobile || null,
          email: user.email,
          business_id: null,
        }, { onConflict: "user_id" });
      }

      await supabase.auth.signOut();
      setSuccess(true);
    } catch (err) {
      setError(
        err.name === "AbortError"
          ? "Request timed out — please try again."
          : err.message || "Failed to set password."
      );
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center">
        <div className="text-zinc-400">Verifying your account…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl space-y-4 text-center">
          <h1 className="text-2xl font-bold">Link Expired</h1>
          <p className="text-zinc-400 text-sm">This confirmation link is invalid or has expired. Please register again.</p>
          <button
            onClick={() => navigate("/register")}
            className="w-full bg-sky-400 text-black p-4 rounded-xl font-bold hover:bg-sky-300"
          >
            Back to Register
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl space-y-4 text-center">
          <div className="text-5xl mb-2">✅</div>
          <h1 className="text-2xl font-bold">You're all set!</h1>
          <p className="text-zinc-400 text-sm">Your password has been saved. You can now log in to B&O Quoting.</p>
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-sky-400 text-black p-4 rounded-xl font-bold hover:bg-sky-300"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 p-6 rounded-2xl space-y-4">
        <h1 className="text-2xl font-bold">Set Your Password</h1>
        <p className="text-zinc-400 text-sm">Choose a password to complete your B&O Quoting account.</p>

        {/* New password */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-400">Password</label>
          <div className="relative">
            <input
              type={showNewPw ? "text" : "password"}
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setError(null); }}
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 pr-12 text-white focus:border-sky-500 focus:outline-none"
              placeholder="Enter password"
            />
            <button
              type="button"
              onClick={() => setShowNewPw(v => !v)}
              className="absolute right-4 top-3.5 text-zinc-400 hover:text-white"
            >
              {showNewPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Live criteria */}
        {newPassword.length > 0 && (
          <ul className="space-y-1">
            {pwCriteria.map(c => (
              <li key={c.label} className="flex items-center gap-2 text-xs text-white">
                <span style={{ color: c.met ? '#34d399' : '#f87171' }} className="text-base leading-none">
                  {c.met ? '✓' : '✕'}
                </span>
                {c.label}
              </li>
            ))}
          </ul>
        )}

        {/* Confirm password */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-400">Confirm Password</label>
          <div className="relative">
            <input
              type={showConfirmPw ? "text" : "password"}
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 pr-12 text-white focus:border-sky-500 focus:outline-none"
              placeholder="Repeat password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPw(v => !v)}
              className="absolute right-4 top-3.5 text-zinc-400 hover:text-white"
            >
              {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {confirmPassword.length > 0 && newPassword !== confirmPassword && (
            <span className="text-xs text-red-400">Passwords do not match.</span>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500 p-3 text-red-200 text-sm">{error}</div>
        )}

        <button
          onClick={handleSetPassword}
          disabled={saving}
          className="w-full bg-sky-400 text-black p-4 rounded-xl font-bold hover:bg-sky-300 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Set Password & Continue"}
        </button>
      </div>
    </div>
  );
}
