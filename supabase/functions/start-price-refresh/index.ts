// @ts-nocheck — Deno runtime
// Note: Deno.serve (not the std serve) is required for EdgeRuntime.waitUntil to work
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the caller is an authenticated user
  const anonClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const { data: profile } = await anonClient
    .from("profile")
    .select("business_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.business_id) return json({ error: "No business found" }, 400);

  const businessId = profile.business_id;
  const serviceClient = createClient(SUPABASE_URL, serviceRoleKey);

  // Reject if a refresh is already in progress for this business
  const { count: alreadyQueued } = await serviceClient
    .from("material")
    .select("material_id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("price_refresh_queued", true);

  if (alreadyQueued && alreadyQueued > 0) {
    return json({ error: "A refresh is already running", remaining: alreadyQueued }, 409);
  }

  // Mark all materials with a supplier URL as queued
  const { data: queued, error: queueErr } = await serviceClient
    .from("material")
    .update({ price_refresh_queued: true })
    .eq("business_id", businessId)
    .not("supplier_url", "is", null)
    .neq("supplier_url", "")
    .select("material_id");

  if (queueErr) return json({ error: queueErr.message }, 500);

  const total = queued?.length ?? 0;
  if (total === 0) return json({ message: "No materials with supplier URLs", total: 0 });

  console.log(`[start-price-refresh] Queued ${total} materials for business ${businessId}. Kicking off worker.`);

  // Kick off the first worker — secret passed in body to avoid header forwarding issues
  EdgeRuntime.waitUntil(
    fetch(`${SUPABASE_URL}/functions/v1/process-price-refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
      },
      body: JSON.stringify({ businessId, workerSecret: serviceRoleKey }),
    }).then(r => console.log(`[start-price-refresh] Worker responded with status ${r.status}`))
      .catch(e => console.error(`[start-price-refresh] Worker call failed: ${e.message}`))
  );

  return json({ message: "Refresh started", total });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
