import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Register() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const register = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Please fill in your first name, last name and email.");
      return;
    }

    setLoading(true);
    setError("");

    // Sign up with a random password — the user will set a real one after confirming
    const randomPassword = crypto.randomUUID() + crypto.randomUUID();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password: randomPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/set-password`,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          mobile: mobile.trim(),
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    // If Supabase returns a session immediately (email confirmation disabled on project),
    // the user was not sent a confirmation email — warn them.
    if (data?.session) {
      setLoading(false);
      setError("Email confirmation is not enabled on this project. Please enable it in Supabase Auth settings.");
      return;
    }

    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl space-y-4 text-center">
          <div className="text-5xl mb-2">✉️</div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            We sent a confirmation link to <span className="text-white font-semibold">{email}</span>.
            Click it to verify your address and set your password.
          </p>
          <p className="text-zinc-500 text-xs">Didn't receive it? Check your spam folder.</p>
          <button
            onClick={() => navigate("/login")}
            className="w-full border border-zinc-600 text-white p-3 rounded-xl hover:bg-zinc-800 text-sm mt-2"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 p-6 rounded-2xl space-y-4">
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="text-zinc-400 text-sm">Enter your details — you'll set a password after confirming your email.</p>

        <input
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full p-4 bg-zinc-800 rounded-xl"
        />
        <input
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full p-4 bg-zinc-800 rounded-xl"
        />
        <input
          placeholder="Mobile (optional)"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          className="w-full p-4 bg-zinc-800 rounded-xl"
        />
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-4 bg-zinc-800 rounded-xl"
        />

        {error && <div className="text-red-400 text-sm">{error}</div>}

        <button
          onClick={register}
          disabled={loading}
          className="w-full bg-sky-400 text-black p-4 rounded-xl font-bold hover:bg-sky-300 disabled:opacity-50"
        >
          {loading ? "Sending confirmation…" : "Create Account"}
        </button>

        <div
          onClick={() => navigate("/login")}
          className="text-center text-sky-400 text-sm cursor-pointer hover:underline"
        >
          Back to login
        </div>
      </div>
    </div>
  );
}
