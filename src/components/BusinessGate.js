import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

export default function BusinessGate({ children }) {
  
  const { session, profile: authProfile, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [businessName, setBusinessName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
  let cancelled = false;

  const load = async () => {
    if (!session?.user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    if (authProfile) {
      setProfile(authProfile);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("profile")
        .select("business_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) throw error;

      if (!cancelled) {
        setProfile(data ?? null);
      }
    } catch (error) {
      console.error("Failed to load business profile:", error);

      if (!cancelled) {
        setProfile(null);
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  };

  load();

  return () => {
    cancelled = true;
  };
}, [session, authProfile]);

  const createBusiness = async () => {
    if (!session?.user) return;
    if (!businessName.trim()) return;

    setSaving(true);

    try {
      const { data: biz, error: bizError } = await supabase
        .from("business")
        .insert({ business_name: businessName.trim() })
        .select("business_id")
        .single();

      if (bizError || !biz?.business_id) {
        console.error("Business insert failed:", bizError);
        return;
      }

      const { error: profileError } = await supabase
        .from("profile")
        .update({ business_id: biz.business_id })
        .eq("user_id", session.user.id);

      if (profileError) {
        console.error("Profile update failed:", profileError);
        return;
      }

      const { data: verify } = await supabase
        .from("profile")
        .select("business_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      setProfile(verify);
      await refreshProfile();

    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-white p-6">Loading...</div>;

  if (!profile?.business_id) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center p-6">
        <div className="bg-zinc-900 p-6 rounded-2xl w-full max-w-md space-y-4">
          <h2 className="text-xl font-bold">Set up your business</h2>
          <input
            placeholder="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full p-4 bg-zinc-800 rounded-xl"
          />
          <button
            onClick={createBusiness}
            disabled={saving}
            className="w-full bg-sky-400 text-black p-4 rounded-xl"
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  return children;
}
