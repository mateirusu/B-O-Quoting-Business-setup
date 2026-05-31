// @ts-nocheck — Deno runtime; VS Code TS checker doesn't understand Deno globals
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { query, page = 1 } = await req.json();
    if (!query?.trim()) return json({ error: "query is required" }, 400);

    const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY");
    if (!PEXELS_API_KEY) return json({ error: "PEXELS_API_KEY secret not set" }, 500);

    const pexelsRes = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query.trim())}&per_page=1&page=${page}&orientation=landscape`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );

    if (!pexelsRes.ok) throw new Error(`Pexels API ${pexelsRes.status}`);

    const data = await pexelsRes.json();
    const photos = data.photos ?? [];

    if (photos.length === 0) return json({ url: null });

    return json({ url: photos[0].src.large2x ?? photos[0].src.large });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
