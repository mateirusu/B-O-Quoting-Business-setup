import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { postcode } = await req.json();
    const apiKey = Deno.env.get("IDEAL_POSTCODES_API_KEY");

    if (!postcode) {
      return new Response(JSON.stringify({ error: "postcode required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pc = postcode.trim().replace(/\s+/g, "").toUpperCase();
    const isPostcode = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i.test(pc);

    if (!isPostcode) {
      return new Response(JSON.stringify({ error: "Invalid UK postcode format." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1. Try ideal-postcodes.co.uk (full PAF list) ───────────────────────
    if (apiKey) {
      const res = await fetch(
        `https://api.ideal-postcodes.co.uk/v1/postcodes/${encodeURIComponent(pc)}?api_key=${apiKey}`
      );
      if (res.ok) {
        const data = await res.json();
        const addresses = (data.result || []).map((a: Record<string, string>) => ({
          line1:    a.line_1    || "",
          line2:    [a.line_2, a.line_3].filter(Boolean).join(", "),
          city:     a.post_town || "",
          county:   a.county   || "",
          country:  a.country  || "United Kingdom",
          postcode: a.postcode || pc,
        }));
        return new Response(JSON.stringify({ addresses }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error(`ideal-postcodes returned ${res.status} for ${pc}`);
    }

    // ── 2. Postcodes.io fallback (no API key needed, geographic data only) ──
    const fallback = await fetch(`https://api.postcodes.io/postcodes/${pc}`);
    if (fallback.ok) {
      const data = await fallback.json();
      const r = data.result;
      return new Response(JSON.stringify({
        addresses: [],
        geo: {
          city:     r.admin_district || r.parish || "",
          county:   r.admin_county   || r.region || "",
          country:  r.country        || "United Kingdom",
          postcode: r.postcode       || postcode.trim().toUpperCase(),
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Postcode not found." }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
