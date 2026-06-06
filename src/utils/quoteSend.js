import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { supabase } from "../supabaseClient";
import QuotePdf from "../components/QuotePdf";

const APP_PUBLIC_URL =
  process.env.REACT_APP_PUBLIC_URL || "http://localhost:3000";

/**
 * Generates the quote PDF, uploads it to Storage, records a timeline entry,
 * and sends the email via the send-quote-email edge function.
 *
 * @param {string}  quoteId       - UUID of the quote
 * @param {object}  profile       - Supabase profile (must include business_id)
 * @param {boolean} updateStatus  - If true, sets quote.status = "Sent" in DB
 * @returns {{ pdfUrl: string }}
 */
export async function sendQuote({ quoteId, profile, updateStatus = false }) {
  // ── 1. Load quote ──────────────────────────────────────────────────────────
  const { data: quote, error: qe } = await supabase
    .from("quote")
    .select("quote_id, quote_number, public_token, title, description, status, created_at")
    .eq("quote_id", quoteId)
    .single();
  if (qe) throw new Error("Failed to load quote: " + qe.message);

  // ── 2. Load services (with hours for price breakdown) ─────────────────────
  const { data: servicesRaw } = await supabase
    .from("quote_service_link")
    .select("quote_service_link_id, task, quantity, service_id, service:service_id(title, hours)")
    .eq("quote_id", quoteId)
    .order("created_at");

  // Load materials linked to these services
  const serviceIds = (servicesRaw || []).map(sv => sv.service_id).filter(Boolean);
  let materialsMap = {};
  if (serviceIds.length > 0) {
    const { data: matLinks } = await supabase
      .from("material_service_link")
      .select("service_id, quantity, material:material_id(name, base_price_no_vat, markup)")
      .in("service_id", serviceIds);
    (matLinks || []).forEach(link => {
      if (!materialsMap[link.service_id]) materialsMap[link.service_id] = [];
      materialsMap[link.service_id].push({
        name: link.material?.name,
        base_price_no_vat: link.material?.base_price_no_vat,
        markup: link.material?.markup,
        qty: link.quantity,
      });
    });
  }
  const services = (servicesRaw || []).map(sv => ({
    ...sv, materials: materialsMap[sv.service_id] || [],
  }));

  // ── 3. Load job + customer ─────────────────────────────────────────────────
  const { data: link } = await supabase
    .from("job_quote_link")
    .select(
      "job:job_id(job_id, title, address_line1, address_line2, town_city, county, postcode, " +
        "customer:customer_id(customer_id, first_name, last_name, email, phone, " +
          "address_line1, address_line2, town_city, county, postcode))"
    )
    .eq("quote_id", quoteId)
    .maybeSingle();

  const job      = link?.job      || null;
  const customer = job?.customer  || null;

  // ── 4. Load business + hourly rate ────────────────────────────────────────
  const { data: business } = await supabase
    .from("business")
    .select(
      "business_name, phone, email, website, " +
      "business_first_line, business_second_line, business_towncity, " +
      "business_county, business_postcode, vat_number, company_reg_number, vat_registered"
    )
    .eq("business_id", profile.business_id)
    .single();

  const { data: pricing } = await supabase
    .from("basic_pricing")
    .select("hourly_rate")
    .eq("business_id", profile.business_id)
    .maybeSingle();
  const hourlyRate = pricing?.hourly_rate ?? 0;

  // ── 5. Generate PDF blob ───────────────────────────────────────────────────
  const element = createElement(QuotePdf, {
    quote,
    services,
    customer,
    job,
    business,
    hourlyRate,
  });
  const blob = await pdf(element).toBlob();

  // ── 6. Upload PDF to Supabase Storage ─────────────────────────────────────
  // Use public_token as filename to avoid exposing internal quote_id in storage URLs.
  // Falls back to quoteId for quotes created before the public_token migration.
  const filePath = `${quote.public_token || quoteId}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from("quote-pdfs")
    .upload(filePath, blob, { contentType: "application/pdf", upsert: true });
  if (uploadErr) throw new Error("Failed to upload PDF: " + uploadErr.message);

  const { data: urlData } = supabase.storage
    .from("quote-pdfs")
    .getPublicUrl(filePath);
  const pdfUrl = urlData.publicUrl;

  // ── 7. Optionally update quote status ─────────────────────────────────────
  if (updateStatus) {
    await supabase.from("quote").update({ status: "Sent" }).eq("quote_id", quoteId);
  }

  // ── 8. Record timeline entry ───────────────────────────────────────────────
  await supabase.from("quote_timeline").insert({
    quote_id:    quoteId,
    business_id: profile.business_id,
    status:      "Sent",
    notes:       "Quote emailed to customer",
    quote_file:  pdfUrl,
  });

  // ── 9. Send email ──────────────────────────────────────────────────────────
  if (customer?.email) {
    const custName = [customer.first_name, customer.last_name]
      .filter(Boolean).join(" ");

    const { error: emailErr } = await supabase.functions.invoke(
      "send-quote-email",
      {
        body: {
          to_email:           customer.email,
          customer_name:      custName,
          customer_first_name:customer.first_name || "there",
          business_name:      business?.business_name || "Us",
          business_phone:     business?.phone || null,
          contact_name:       business?.business_name || "The Team",
          quote_number:       quote.quote_number,
          quote_title:        quote.title,
          pdf_url:            pdfUrl,
          public_quote_url:   quote.public_token ? `${APP_PUBLIC_URL}/public/quote/${quote.public_token}` : null,
        },
      }
    );
    if (emailErr) throw new Error("PDF saved but email failed: " + emailErr.message);
  }

  return { pdfUrl };
}
