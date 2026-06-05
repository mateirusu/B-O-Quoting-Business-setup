import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const { public_token } = body;

    if (!public_token || typeof public_token !== "string") {
      return json({ error: "Token required" }, 400);
    }
    if (!UUID_REGEX.test(public_token)) {
      return json({ error: "Invalid token" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Single query — keep quote_id for internal joins, strip it before response
    const { data: quoteRow, error: qe } = await supabase
      .from("quote")
      .select("quote_id, quote_number, title, description, status, created_at, public_token")
      .eq("public_token", public_token)
      .single();

    if (qe || !quoteRow) {
      return json({ error: "Quote not found" }, 404);
    }

    const { quote_id, ...quote } = quoteRow; // quote_id stays internal

    // Load services
    const { data: services } = await supabase
      .from("quote_service_link")
      .select("quote_service_link_id, task, quantity, service:service_id(title)")
      .eq("quote_id", quote_id)
      .order("created_at");

    // Load job + customer (limited fields for public view)
    const { data: link } = await supabase
      .from("job_quote_link")
      .select("job:job_id(job_id, title, customer_id, customer:customer_id(first_name, last_name))")
      .eq("quote_id", quote_id)
      .maybeSingle();

    const job        = link?.job     || null;
    const customer   = job?.customer || null;
    const customerId = job?.customer_id || null;

    // Load business via customer → business_id
    let business = null;
    if (customerId) {
      const { data: cust } = await supabase
        .from("customer")
        .select("business_id")
        .eq("customer_id", customerId)
        .single();
      if (cust?.business_id) {
        const { data: biz } = await supabase
          .from("business")
          .select("business_name, phone, email, website, business_first_line, business_second_line, business_towncity, business_county, business_postcode, vat_number, company_reg_number")
          .eq("business_id", cust.business_id)
          .single();
        business = biz || null;
      }
    }

    return json({
      quote,    // does NOT contain quote_id
      services: services || [],
      customer: customer ? { first_name: customer.first_name, last_name: customer.last_name } : null,
      job:      job ? { title: job.title } : null,
      business,
    });

  } catch (_err) {
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
