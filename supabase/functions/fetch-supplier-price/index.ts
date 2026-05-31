// @ts-nocheck — Deno runtime; VS Code TS checker doesn't understand URL imports or Deno globals
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseProductData } from "./supplierParsers.ts";

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
    // Verify the caller is an authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { url } = await req.json();
    if (!url) return json({ error: "url is required" }, 400);

    const ZYTE_API_KEY = Deno.env.get("ZYTE_API_KEY");
    if (!ZYTE_API_KEY) {
      return json({ error: "ZYTE_API_KEY secret not set on this project" }, 500);
    }

    // Call Zyte — request both automatic product extraction and full HTML
    const zyteRes = await fetch("https://api.zyte.com/v1/extract", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(ZYTE_API_KEY + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        product: true,
        browserHtml: true,
      }),
      signal: AbortSignal.timeout(50_000),
    });

    if (!zyteRes.ok) {
      const msg = await zyteRes.text();
      throw new Error(`Zyte API ${zyteRes.status}: ${msg}`);
    }

    const zyteData = await zyteRes.json();

    const result = parseProductData(
      url,
      zyteData.browserHtml ?? "",
      zyteData.product ?? null
    );

    return json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
