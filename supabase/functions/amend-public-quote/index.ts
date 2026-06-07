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
    const { public_token, action } = body;

    if (!public_token || typeof public_token !== "string" || !UUID_REGEX.test(public_token)) {
      return json({ error: "Invalid token" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve quote from token
    const { data: quoteRow, error: qe } = await supabase
      .from("quote")
      .select("quote_id, status")
      .eq("public_token", public_token)
      .single();

    if (qe || !quoteRow) return json({ error: "Quote not found" }, 404);

    // Prevent amending already-resolved quotes
    if (quoteRow.status === "Accepted" || quoteRow.status === "Declined") {
      return json({ error: "This quote has already been responded to" }, 409);
    }

    // Resolve business_id via job_quote_link → job → customer
    const { data: linkRow } = await supabase
      .from("job_quote_link")
      .select("job:job_id(customer_id)")
      .eq("quote_id", quoteRow.quote_id)
      .maybeSingle();

    let businessId: string | null = null;
    if (linkRow?.job?.customer_id) {
      const { data: cust } = await supabase
        .from("customer")
        .select("business_id")
        .eq("customer_id", linkRow.job.customer_id)
        .single();
      businessId = cust?.business_id ?? null;
    }
    if (!businessId) return json({ error: "Business not found" }, 404);

    // ── GET SERVICES — returns Custom services for this quote + Reusable templates
    //    that don't already have a Custom copy in the quote. No DB IDs exposed. ──
    if (action === "get_services") {
      const [{ data: quoteLinks }, { data: reusable }] = await Promise.all([
        supabase
          .from("quote_service_link")
          .select("service:service_id(title, description, service_type)")
          .eq("quote_id", quoteRow.quote_id),
        supabase
          .from("service")
          .select("title, description")
          .eq("business_id", businessId)
          .eq("main_service", true)
          .eq("service_type", "Reusable")
          .order("title"),
      ]);

      // Custom services already in this quote
      const customForQuote = (quoteLinks || [])
        .filter((l: any) => l.service?.service_type === "Custom")
        .map((l: any) => ({ title: l.service.title, description: l.service.description || null }));

      // Reusable templates that don't have a Custom copy in this quote
      const customTitles = new Set(customForQuote.map((s: any) => s.title.trim().toLowerCase()));
      const filteredReusable = (reusable || [])
        .filter((s: any) => !customTitles.has(s.title.trim().toLowerCase()))
        .map((s: any) => ({ title: s.title, description: s.description || null }));

      const combined = [...customForQuote, ...filteredReusable]
        .sort((a: any, b: any) => a.title.localeCompare(b.title));

      return json({ services: combined });
    }

    // ── SAVE — resolves service names to IDs server-side, never trusts client IDs ──
    if (action === "save") {
      const { services } = body;
      if (!Array.isArray(services)) return json({ error: "services array required" }, 400);
      if (services.length > 20) return json({ error: "Too many services (max 20)" }, 400);

      // Strip HTML and enforce length caps on all string inputs from the client
      const strip = (v: unknown, max: number): string =>
        typeof v === "string" ? v.replace(/<[^>]*>/g, "").slice(0, max).trim() : "";

      let hasCustom = false;

      // Build lookup maps (server-side only — no IDs exposed to client)
      const [{ data: reusableCat }, { data: oldLinks }] = await Promise.all([
        supabase
          .from("service")
          .select("service_id, title")
          .eq("business_id", businessId)
          .eq("main_service", true)
          .eq("service_type", "Reusable"),
        supabase
          .from("quote_service_link")
          .select("service_id, service:service_id(title, service_type)")
          .eq("quote_id", quoteRow.quote_id),
      ]);

      // Reusable templates: title → service_id
      const reusableMap: Record<string, string> = {};
      (reusableCat || []).forEach((s: any) => {
        reusableMap[s.title.trim().toLowerCase()] = s.service_id;
      });

      // Custom services already in this quote: title → service_id (re-link rather than copy)
      const customForQuoteMap: Record<string, string> = {};
      const tempServiceIds: string[] = [];
      (oldLinks || []).forEach((l: any) => {
        if (l.service?.service_type === "Custom" || l.service?.service_type === "Customer Request") {
          tempServiceIds.push(l.service_id);
        }
        if (l.service?.service_type === "Custom") {
          customForQuoteMap[l.service.title.trim().toLowerCase()] = l.service_id;
        }
      });

      // Copy a Reusable template into a new Custom service (with its material links)
      const copyAsCustom = async (sourceId: string): Promise<string> => {
        const { data: src } = await supabase.from("service").select("*").eq("service_id", sourceId).single();
        if (!src) throw new Error("Source service not found");
        const { data: copy, error: ce } = await supabase.from("service").insert({
          title:           src.title,
          description:     src.description,
          hours:           src.hours,
          image_url:       src.image_url,
          business_id:     businessId,
          service_type:    "Custom",
          main_service:    true,
          main_service_id: null,
        }).select("service_id").single();
        if (ce) throw ce;
        const { data: mats } = await supabase
          .from("material_service_link")
          .select("material_id, quantity, sort_order")
          .eq("service_id", sourceId);
        if (mats?.length) {
          await supabase.from("material_service_link").insert(
            mats.map((m: any) => ({
              service_id:  copy.service_id,
              material_id: m.material_id,
              business_id: businessId,
              quantity:    m.quantity,
              sort_order:  m.sort_order ?? 0,
            }))
          );
        }
        return copy.service_id;
      };

      // Replace all existing service links for this quote
      const { error: delErr } = await supabase
        .from("quote_service_link")
        .delete()
        .eq("quote_id", quoteRow.quote_id);
      if (delErr) throw new Error("Failed to clear services: " + delErr.message);

      for (const svc of services) {
        const name = strip(svc.name, 200);
        if (!name) continue;
        const qty          = Math.max(1, Math.min(999, parseInt(svc.quantity) || 1));
        const task         = strip(svc.task, 1000) || null;
        const taskModified = svc.task_modified === true;
        const nameLower    = name.toLowerCase();
        let serviceId: string;

        if (customForQuoteMap[nameLower]) {
          // Existing Custom service for this quote — re-link directly, no copy needed
          if (taskModified) hasCustom = true;
          serviceId = customForQuoteMap[nameLower];
        } else if (reusableMap[nameLower]) {
          // Known Reusable template → create a Custom copy
          if (taskModified) hasCustom = true;
          serviceId = await copyAsCustom(reusableMap[nameLower]);
        } else {
          // Unknown name — customer typed their own; business will review and price
          hasCustom = true;
          const { data: newSvc, error: createErr } = await supabase
            .from("service")
            .insert({
              title:           name,
              description:     task || null,
              hours:           1,
              business_id:     businessId,
              service_type:    "Customer Request",
              main_service:    true,
              main_service_id: null,
            })
            .select("service_id")
            .single();
          if (createErr) throw new Error("Failed to create service: " + createErr.message);
          serviceId = newSvc.service_id;
        }

        const { error: linkErr } = await supabase.from("quote_service_link").insert({
          quote_id:   quoteRow.quote_id,
          service_id: serviceId,
          task:       task || null,
          quantity:   qty,
        });
        if (linkErr) throw new Error("Failed to link service: " + linkErr.message);
      }

      // Delete old Custom/Customer Request services that are no longer linked to any quote
      for (const svcId of tempServiceIds) {
        const { count } = await supabase
          .from("quote_service_link")
          .select("quote_service_link_id", { count: "exact", head: true })
          .eq("service_id", svcId);
        if (!count) {
          await supabase.from("material_service_link").delete().eq("service_id", svcId);
          await supabase.from("service").delete().eq("service_id", svcId);
        }
      }

      if (hasCustom) {
        // New services the business hasn't priced yet → move to Draft for review
        await supabase.from("quote").update({ status: "Draft" }).eq("quote_id", quoteRow.quote_id);
        await supabase.from("quote_timeline").insert({
          quote_id:    quoteRow.quote_id,
          business_id: businessId,
          status:      "Draft",
          notes:       "Customer submitted service requests. Quote moved to Draft pending review.",
        });
      } else {
        // Customer only removed/reordered existing services — keep Sent, no review needed
        await supabase.from("quote_timeline").insert({
          quote_id:    quoteRow.quote_id,
          business_id: businessId,
          status:      "Sent",
          notes:       "Customer amended the service list.",
        });
      }

      return json({ success: true, has_custom: hasCustom });
    }

    return json({ error: "Unknown action" }, 400);

  } catch (err) {
    console.error("amend-public-quote error:", err);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
