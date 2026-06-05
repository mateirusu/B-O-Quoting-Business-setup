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
    const {
      to_email,
      customer_name,
      customer_first_name,
      business_name,
      business_phone,
      contact_name,
      quote_number,
      quote_title,
      pdf_url,
      public_quote_url,
    } = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const RESEND_FROM    = Deno.env.get("RESEND_FROM_EMAIL");

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY secret not set" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!RESEND_FROM) {
      return new Response(JSON.stringify({ error: "RESEND_FROM_EMAIL secret not set" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch PDF from public storage URL and base64-encode it
    const pdfResponse = await fetch(pdf_url);
    if (!pdfResponse.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch PDF from storage" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const uint8     = new Uint8Array(pdfBuffer);
    let binary      = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const pdfBase64 = btoa(binary);

    const safeCustomer = (customer_name || "customer").toLowerCase().replace(/\s+/g, "-");
    const paddedRef    = String(quote_number || "").padStart(4, "0");
    const filename     = `quotation_${paddedRef}_${safeCustomer}.pdf`;

    const replyLine = business_phone
      ? `by replying to this email or calling us on <strong>${business_phone}</strong>`
      : `by replying to this email`;

    const htmlBody = `
      <p>Dear ${customer_first_name || "there"},</p>
      <p>I hope this message finds you well.</p>
      <p>Thank you for considering <strong>${business_name}</strong> and for the opportunity to quote for your project.</p>
      <p>Please find attached a detailed quote outlining the proposed work. If you have any questions or would like to discuss anything in more detail, please don't hesitate to get in touch.</p>
      ${public_quote_url
        ? `<p>You can <strong>view, accept or decline</strong> this quote online here:<br/>
           <a href="${public_quote_url}">${public_quote_url}</a></p>
           <p>Alternatively, you can accept this quote ${replyLine}.</p>`
        : `<p>To accept this quote, please ${replyLine}.</p>`
      }
      <p>If you would like to proceed, simply reply to this email and we will be in touch to arrange a convenient start date.</p>
      <br/>
      <p>Many thanks</p>
      <p><strong>${contact_name || business_name}</strong></p>
    `;

    const payload = {
      from:        `${business_name} <${RESEND_FROM}>`,
      to:          [to_email],
      subject:     `Quotation #${paddedRef} — ${quote_title}`,
      html:        htmlBody,
      attachments: [{ filename, content: pdfBase64 }],
    };

    const resendRes  = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: resendData.message || "Resend API error" }), {
        status: resendRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
