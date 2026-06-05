import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loadingLocal, setLoadingLocal] = useState(false);

  if (loading) return <div className="text-white p-6">Loading authentication...</div>;
  if (session) return <Navigate to="/app" />;

  const login = async () => {
    setLoadingLocal(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoadingLocal(false);

    if (error) return setError(error.message);

    navigate("/app");
  };

  return (
    <div className="fixed inset-0 bg-black text-white overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 pt-12">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
          <h1 className="text-3xl font-bold">Welcome back</h1>

          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-90 p-4 bg-zinc-800 rounded-xl"
          />

          <div className="relative input-90">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 pr-12 bg-zinc-800 rounded-xl"
            />
            <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-4">
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <button onClick={login} className="w-full bg-sky-400 text-black p-4 rounded-xl">
            {loadingLocal ? "Signing in..." : "Sign in"}
          </button>

          <div onClick={() => navigate("/register")} className="text-center text-sky-400 text-sm cursor-pointer hover-underline">
            Register
          </div>
        </div>
      </div>
    </div>
  );
}
