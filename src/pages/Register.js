import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function Register() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const register = async () => {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    const user = data?.user;
    if (!user?.id) {
      setLoading(false);
      setError("Signup failed");
      return;
    }

    const { error: profileError } = await supabase.from("profile").insert({
      user_id: user.id,
      first_name: firstName,
      last_name: lastName,
      mobile_number: mobile,
      email: email,
      business_id: null
    });

    if (profileError) {
      setLoading(false);
      setError(profileError.message);
      return;
    }

    setLoading(false);
    navigate("/app");
  };

  return (
    <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 p-6 rounded-2xl space-y-4">
        <h1 className="text-2xl font-bold">Create account</h1>

        <input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full p-4 bg-zinc-800 rounded-xl" />
        <input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full p-4 bg-zinc-800 rounded-xl" />
        <input placeholder="Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full p-4 bg-zinc-800 rounded-xl" />
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-4 bg-zinc-800 rounded-xl" />

        <div className="relative">
          <input
            placeholder="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 bg-zinc-800 rounded-xl"
          />
          <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-4">
            {showPassword ? <EyeOff /> : <Eye />}
          </button>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}

        <button onClick={register} className="w-full bg-sky-400 text-black p-4 rounded-xl">
          {loading ? "Creating..." : "Create Account"}
        </button>

        <div onClick={() => navigate("/login")} className="text-center text-sky-400 text-sm cursor-pointer hover-underline">
          Back to login
        </div>
      </div>
    </div>
  );
}
