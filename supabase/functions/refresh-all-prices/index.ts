// @ts-nocheck — Deno runtime; VS Code TS checker doesn't understand URL imports or Deno globals
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseProductData } from "../fetch-supplier-price/supplierParsers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  // Verify caller is authenticated
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // Look up the user's business_id
  const { data: profile } = await anonClient
    .from("profile")
    .select("business_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.business_id) return json({ error: "No business found" }, 400);

  const businessId = profile.business_id;
  const ZYTE_API_KEY = Deno.env.get("ZYTE_API_KEY");
  if (!ZYTE_API_KEY) return json({ error: "ZYTE_API_KEY not set" }, 500);

  // Service role client for background writes (user JWT expires mid-run)
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch all materials with a supplier URL for this business
  const { data: materials } = await serviceClient
    .from("material")
    .select("material_id, supplier_url")
    .eq("business_id", businessId)
    .not("supplier_url", "is", null)
    .neq("supplier_url", "");

  if (!materials?.length) {
    return json({ message: "No materials with supplier URLs", total: 0 });
  }

  // Process every material in the background — browser can close, page can change.
  // EdgeRuntime.waitUntil keeps the function alive after the response is sent.
  const backgroundWork = async () => {
    for (const mat of materials) {
      try {
        const zyteRes = await fetch("https://api.zyte.com/v1/extract", {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(ZYTE_API_KEY + ":")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: mat.supplier_url, product: true, browserHtml: true }),
          signal: AbortSignal.timeout(50_000),
        });

        if (!zyteRes.ok) continue;

        const zyteData = await zyteRes.json();
        const { price } = parseProductData(
          mat.supplier_url,
          zyteData.browserHtml ?? "",
          zyteData.product ?? null
        );

        if (price !== null) {
          await serviceClient
            .from("material")
            .update({ base_price_no_vat: price })
            .eq("material_id", mat.material_id)
            .eq("business_id", businessId);
        }
      } catch {
        // Skip failed materials and continue with the rest
      }
    }
  };

  EdgeRuntime.waitUntil(backgroundWork());

  return json({ message: "Refresh started", total: materials.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
