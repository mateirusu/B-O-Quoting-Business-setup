// @ts-nocheck — Deno runtime
// Note: Deno.serve (not the std serve) is required for EdgeRuntime.waitUntil to work
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseProductData } from "../fetch-supplier-price/supplierParsers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ZYTE_API_KEY = Deno.env.get("ZYTE_API_KEY")!;

  // Secret is passed in the body to avoid header forwarding issues
  const body = await req.json();
  const { businessId, workerSecret } = body;

  if (!businessId || workerSecret !== serviceRoleKey) {
    console.error(`[process-price-refresh] Unauthorized — businessId: ${!!businessId}, secretMatch: ${workerSecret === serviceRoleKey}`);
    return json({ error: "Unauthorized" }, 401);
  }

  const serviceClient = createClient(SUPABASE_URL, serviceRoleKey);

  // Pick one queued material for this business
  const { data: items, error: fetchErr } = await serviceClient
    .from("material")
    .select("material_id, supplier_url")
    .eq("business_id", businessId)
    .eq("price_refresh_queued", true)
    .limit(1);

  if (fetchErr) {
    console.error(`[process-price-refresh] DB fetch error: ${fetchErr.message}`);
    return json({ error: fetchErr.message }, 500);
  }

  if (!items?.length) {
    console.log(`[process-price-refresh] All done for business ${businessId}`);
    return json({ done: true, remaining: 0 });
  }

  const mat = items[0];
  console.log(`[process-price-refresh] Processing material ${mat.material_id}`);

  // Unqueue immediately so no other invocation can claim the same item
  await serviceClient
    .from("material")
    .update({ price_refresh_queued: false })
    .eq("material_id", mat.material_id);

  // Fetch from Zyte and update the price
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

    if (zyteRes.ok) {
      const zyteData = await zyteRes.json();
      const { price, name, code } = parseProductData(
        mat.supplier_url,
        zyteData.browserHtml ?? "",
        zyteData.product ?? null
      );

      const updates: Record<string, unknown> = {};
      if (price !== null) updates.base_price_no_vat = price;
      if (name) updates.name = name;
      if (code) updates.code = code;

      if (Object.keys(updates).length > 0) {
        await serviceClient
          .from("material")
          .update(updates)
          .eq("material_id", mat.material_id)
          .eq("business_id", businessId);
        console.log(`[process-price-refresh] Updated ${Object.keys(updates).join(", ")} for ${mat.material_id}`);
      } else {
        console.log(`[process-price-refresh] No data found for ${mat.material_id}`);
      }
    } else {
      console.warn(`[process-price-refresh] Zyte returned ${zyteRes.status} for ${mat.supplier_url}`);
    }
  } catch (e) {
    console.error(`[process-price-refresh] Zyte error for ${mat.material_id}: ${e.message}`);
  }

  // How many items are still waiting?
  const { count: remaining } = await serviceClient
    .from("material")
    .select("material_id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("price_refresh_queued", true);

  console.log(`[process-price-refresh] Remaining: ${remaining ?? 0}`);

  if (remaining && remaining > 0) {
    // Chain to the next item — each call gets its own independent 400s budget
    EdgeRuntime.waitUntil(
      fetch(`${SUPABASE_URL}/functions/v1/process-price-refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
        },
        body: JSON.stringify({ businessId, workerSecret: serviceRoleKey }),
      }).then(r => console.log(`[process-price-refresh] Next worker responded ${r.status}`))
        .catch(e => console.error(`[process-price-refresh] Next worker failed: ${e.message}`))
    );
  }

  return json({ processed: mat.material_id, remaining: remaining ?? 0 });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
