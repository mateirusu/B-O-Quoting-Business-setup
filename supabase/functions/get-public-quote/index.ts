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
      .select("quote_id, quote_number, title, description, callout_charge, status, created_at, sent_at, public_token")
      .eq("public_token", public_token)
      .single();

    if (qe || !quoteRow) {
      return json({ error: "Quote not found" }, 404);
    }

    // Strip internal fields — quote_id and raw callout_charge stay server-side only
    const { quote_id, callout_charge: _callout, ...quote } = quoteRow;

    // Load services (include service_id + hours for price breakdown)
    const { data: services } = await supabase
      .from("quote_service_link")
      .select("quote_service_link_id, task, quantity, service_id, service:service_id(title, hours)")
      .eq("quote_id", quote_id)
      .order("created_at");

    // Load materials linked to these services (internal only — not sent to client)
    const serviceIds = (services || []).map((sv: any) => sv.service_id).filter(Boolean);
    let materialsMap: Record<string, any[]> = {};
    if (serviceIds.length > 0) {
      const { data: matLinks } = await supabase
        .from("material_service_link")
        .select("service_id, quantity, material:material_id(name, base_price_no_vat, markup)")
        .in("service_id", serviceIds);
      (matLinks || []).forEach((link: any) => {
        if (!materialsMap[link.service_id]) materialsMap[link.service_id] = [];
        materialsMap[link.service_id].push({
          name: link.material?.name,
          base_price_no_vat: parseFloat(link.material?.base_price_no_vat) || 0,
          markup: parseFloat(link.material?.markup) || 0,
          qty: parseInt(link.quantity) || 1,
        });
      });
    }

    // Load job + customer (limited fields for public view)
    const { data: link } = await supabase
      .from("job_quote_link")
      .select("job:job_id(title, customer_id, customer:customer_id(first_name, last_name))")
      .eq("quote_id", quote_id)
      .maybeSingle();

    const job        = link?.job     || null;
    const customer   = job?.customer || null;
    const customerId = job?.customer_id || null;

    // Load business + hourly_rate via customer → business_id (internal only)
    let business = null;
    let vatRegistered = false;
    let hourlyRate = 0;
    if (customerId) {
      const { data: cust } = await supabase
        .from("customer")
        .select("business_id")
        .eq("customer_id", customerId)
        .single();
      if (cust?.business_id) {
        const { data: biz } = await supabase
          .from("business")
          .select("business_name, phone, email, website, business_first_line, business_second_line, business_towncity, business_county, business_postcode, vat_number, company_reg_number, vat_registered")
          .eq("business_id", cust.business_id)
          .single();
        business = biz || null;
        vatRegistered = biz?.vat_registered || false;

        const { data: pricing } = await supabase
          .from("basic_pricing")
          .select("hourly_rate")
          .eq("business_id", cust.business_id)
          .maybeSingle();
        hourlyRate = parseFloat(pricing?.hourly_rate) || 0;
      }
    }

    // Callout charge — prepended as first service entry
    const calloutRaw     = parseFloat(quoteRow.callout_charge) || 0;
    const calloutDisplay = vatRegistered ? calloutRaw * 1.20 : calloutRaw;

    // Compute all prices server-side — no formula data sent to client
    let totalLabour = calloutDisplay;
    let totalMaterialsIncVat = 0;

    const calloutEntry = calloutRaw > 0 ? [{
      title:             "Callout Charge",
      task:              null,
      quantity:          1,
      material_names:    [],
      labour:            calloutDisplay,
      materials_inc_vat: null,
      total:             calloutDisplay,
      has_pricing:       true,
      is_callout:        true,
    }] : [];

    const enrichedServices = (services || []).map((sv: any) => {
      const svQty     = parseInt(sv.quantity) || 1;
      const hours     = parseFloat(sv.service?.hours) || 0;
      const mats      = materialsMap[sv.service_id] || [];

      const labSub    = hours * svQty * hourlyRate;
      const labour    = vatRegistered ? labSub * 1.20 : labSub;

      const matSub    = mats.reduce((s: number, m: any) =>
        s + m.base_price_no_vat * (1 + m.markup / 100) * m.qty, 0) * svQty;
      const materialsIncVat = matSub * 1.20;

      const total     = labour + materialsIncVat;
      const hasPricing = labour > 0 || materialsIncVat > 0;

      totalLabour          += labour;
      totalMaterialsIncVat += materialsIncVat;

      // Return display fields only — no DB IDs sent to client
      return {
        title:              sv.service?.title || "—",
        task:               sv.task || null,
        quantity:           svQty,
        service_type:       sv.service?.service_type || "Reusable",
        material_names:     mats.map((m: any) => m.name).filter(Boolean),
        labour:             hasPricing ? labour : null,
        materials_inc_vat:  materialsIncVat > 0 ? materialsIncVat : null,
        total:              hasPricing ? total : null,
        has_pricing:        hasPricing,
      };
    });

    return json({
      quote,    // does NOT contain quote_id
      services: [...calloutEntry, ...enrichedServices],
      vat_registered: vatRegistered,
      total_labour:           totalLabour > 0 ? totalLabour : null,
      total_materials_inc_vat: totalMaterialsIncVat > 0 ? totalMaterialsIncVat : null,
      grand_total:            (totalLabour + totalMaterialsIncVat) > 0 ? totalLabour + totalMaterialsIncVat : null,
      customer: customer ? { first_name: customer.first_name, last_name: customer.last_name } : null,
      job:      job ? { title: job.title } : null,
      business,
    });

  } catch (err) {
    console.error("get-public-quote unhandled error:", err);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
