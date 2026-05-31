import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("profile")
      .select("profile_id, first_name, last_name, email, mobile_number, profile_image_url, business_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch profile:", error);
      return;
    }

    setProfile(data);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  }, [session, fetchProfile]);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;

      const init = async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) console.error(error);
          const currentSession = data?.session ?? null;
          setSession(currentSession);

          if (currentSession?.user?.id) {
            await fetchProfile(currentSession.user.id);
          }
        } catch (error) {
          console.error(error);
          setSession(null);
        } finally {
          setLoading(false);
        }
      };

      init();
    }

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener?.subscription?.unsubscribe();
  }, [fetchProfile]);


  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
