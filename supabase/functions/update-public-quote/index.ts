import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = ["Accepted", "Declined"] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { public_token, status, notes } = body;

    if (!public_token || typeof public_token !== "string") {
      return json({ error: "Token required" }, 400);
    }
    if (!UUID_REGEX.test(public_token)) {
      return json({ error: "Invalid token" }, 400);
    }
    if (!status || !VALID_STATUSES.includes(status)) {
      return json({ error: "Status must be Accepted or Declined" }, 400);
    }
    // Sanitise notes — strip any HTML and truncate to 5000 chars
    const safeNotes = typeof notes === "string"
      ? notes.replace(/<[^>]*>/g, "").slice(0, 5000)
      : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve internal quote_id from opaque token
    const { data: quoteRow, error: lookupErr } = await supabase
      .from("quote")
      .select("quote_id, status")
      .eq("public_token", public_token)
      .single();

    if (lookupErr || !quoteRow) {
      return json({ error: "Quote not found" }, 404);
    }

    // Prevent re-submitting an already-resolved quote
    if (quoteRow.status === "Accepted" || quoteRow.status === "Declined") {
      return json({ error: "This quote has already been responded to" }, 409);
    }

    const quote_id = quoteRow.quote_id;

    // Update quote status
    const { error: updateErr } = await supabase
      .from("quote")
      .update({ status })
      .eq("quote_id", quote_id);
    if (updateErr) {
      throw new Error(`DB update failed — code: ${updateErr.code} | msg: ${updateErr.message} | hint: ${updateErr.hint}`);
    }

    // Resolve business_id via job_quote_link → job → customer
    const { data: link } = await supabase
      .from("job_quote_link")
      .select("job:job_id(customer_id)")
      .eq("quote_id", quote_id)
      .maybeSingle();

    let businessId: string | null = null;
    if (link?.job?.customer_id) {
      const { data: cust } = await supabase
        .from("customer")
        .select("business_id")
        .eq("customer_id", link.job.customer_id)
        .single();
      businessId = cust?.business_id ?? null;
    }

    if (businessId) {
      const { error: timelineErr } = await supabase.from("quote_timeline").insert({
        quote_id,
        business_id: businessId,
        status,
        notes: safeNotes || (status === "Accepted" ? "Customer accepted the quote." : "Customer declined the quote."),
      });
      if (timelineErr) {
        console.error("quote_timeline insert failed:", timelineErr.message, timelineErr.details);
      }
    }

    return json({ success: true });

  } catch (err) {
    console.error("update-public-quote unhandled error:", err);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
