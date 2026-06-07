import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { sendQuote } from "../utils/quoteSend";
import AddressLookup from "./AddressLookup";
import ServiceQuoteLink from "../pages/CRM/Quote/ServiceQuoteLink";

const emptyForm = {
  customer_id:   "",
  title:         "",
  description:   "",
  address_line1: "",
  address_line2: "",
  town_city:     "",
  county:        "",
  postcode:      "",
  country:       "",
};

export default function AddJobModal({ isOpen, onClose, onSaved, profile, fixedCustomerId = null }) {
  const navigate = useNavigate();
  const [form,             setForm]             = useState(emptyForm);
  const [customers,        setCustomers]        = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [servicesModalOpen,setServicesModalOpen]= useState(false);
  const [addrView,         setAddrView]         = useState("lookup");
  const [saving,           setSaving]           = useState(false);
  const [sending,          setSending]          = useState(false);
  const [formError,        setFormError]        = useState(null);
  const [customerSearch,   setCustomerSearch]   = useState("");
  const [customerDropOpen, setCustomerDropOpen] = useState(false);
  const [sendStep,         setSendStep]         = useState(null); // { quoteId } when awaiting send decision

  // Reset form whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyForm);
    setSelectedServices([]);
    setAddrView("lookup");
    setFormError(null);
    setCustomerSearch("");
    setCustomerDropOpen(false);
    setSendStep(null);
  }, [isOpen]);

  // Load customer list (only when no fixed customer)
  useEffect(() => {
    if (!isOpen || !profile?.business_id || fixedCustomerId) return;
    supabase
      .from("customer")
      .select("customer_id, first_name, last_name, address_line1, address_line2, town_city, county, postcode, country")
      .eq("business_id", profile.business_id)
      .order("first_name")
      .then(({ data }) => setCustomers(data ?? []));
  }, [isOpen, profile?.business_id, fixedCustomerId]);

  // Pre-populate fixed customer + their address
  useEffect(() => {
    if (!isOpen || !fixedCustomerId) return;
    supabase
      .from("customer")
      .select("customer_id, address_line1, address_line2, town_city, county, postcode, country")
      .eq("customer_id", fixedCustomerId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const hasAddr = !!(data.address_line1 || data.postcode);
        setForm(prev => ({
          ...prev,
          customer_id:   fixedCustomerId,
          address_line1: data.address_line1 || "",
          address_line2: data.address_line2 || "",
          town_city:     data.town_city     || "",
          county:        data.county        || "",
          postcode:      data.postcode      || "",
          country:       data.country       || "",
        }));
        setAddrView(hasAddr ? "display" : "lookup");
      });
  }, [isOpen, fixedCustomerId]);

  const handleChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleCustomerChange = customerId => {
    const c = customers.find(c => c.customer_id === customerId);
    setForm(prev => ({
      ...prev,
      customer_id:   customerId,
      address_line1: c?.address_line1 || "",
      address_line2: c?.address_line2 || "",
      town_city:     c?.town_city     || "",
      county:        c?.county        || "",
      postcode:      c?.postcode      || "",
      country:       c?.country       || "",
    }));
    setAddrView(c?.address_line1 || c?.postcode ? "display" : "lookup");
  };

  const handleAddressSelect = r => {
    setForm(prev => ({
      ...prev,
      address_line1: r.line1    || "",
      address_line2: r.line2    || "",
      town_city:     r.city     || "",
      county:        r.county   || "",
      postcode:      r.postcode || "",
      country:       r.country  || "",
    }));
    setAddrView("display");
  };

  const save = async () => {
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    if (!form.customer_id)  { setFormError("Please select a customer."); return; }
    setSaving(true);
    setFormError(null);

    const payload = { ...form };
    Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });

    const { data: job, error: jobErr } = await supabase
      .from("job").insert(payload).select("job_id").single();
    if (jobErr) { setSaving(false); setFormError(jobErr.message || "Failed to save job."); return; }

    // Get next quote number for this customer (per-customer sequential)
    const customerId = fixedCustomerId || form.customer_id;
    const { data: nextNum } = await supabase.rpc("get_next_quote_number", { p_customer_id: customerId });

    // Snapshot callout_charge from basic_pricing at quote creation time
    let calloutCharge = 0;
    if (profile?.business_id) {
      const { data: pricingRow } = await supabase
        .from("basic_pricing")
        .select("callout_charge")
        .eq("business_id", profile.business_id)
        .maybeSingle();
      calloutCharge = parseFloat(pricingRow?.callout_charge) || 0;
    }

    const quoteId = crypto.randomUUID();
    const { error: quoteErr } = await supabase
      .from("quote")
      .insert({ quote_id: quoteId, title: form.title.trim(), description: form.description || null, status: "Draft", quote_number: nextNum || 1, callout_charge: calloutCharge });
    if (quoteErr) { setSaving(false); setFormError(quoteErr.message || "Failed to create quote."); return; }

    await supabase.from("job_quote_link").insert({ job_id: job.job_id, quote_id: quoteId });

    // First timeline entry
    if (profile?.business_id) {
      await supabase.from("quote_timeline").insert({
        quote_id:    quoteId,
        business_id: profile.business_id,
        status:      "Draft",
        notes:       "Quote created",
      });
    }

    // Materialise service recipes — zero DB writes happen until this point
    const defaultImg = "https://images.unsplash.com/photo-1581090464777-f3220bbe1b8b?q=80&w=1200&auto=format&fit=crop";
    for (const s of selectedServices) {
      let serviceId;

      if (!s.sourceServiceId) {
        // Typed from scratch — create a brand-new Custom service
        const { data: svc, error: svcErr } = await supabase
          .from("service")
          .insert({
            title:        s.name.trim(),
            hours:        s.hours || 0,
            business_id:  profile.business_id,
            service_type: "Custom",
            main_service: true,
          })
          .select("service_id")
          .single();
        if (svcErr) { setSaving(false); setFormError("Failed to create service: " + svcErr.message); return; }
        serviceId = svc.service_id;
      } else {
        // Copy from Reusable template
        const { data: src } = await supabase
          .from("service")
          .select("title, description, image_url, hours")
          .eq("service_id", s.sourceServiceId)
          .single();
        const { data: copy, error: copyErr } = await supabase
          .from("service")
          .insert({
            title:        s.name,
            description:  src?.description  || null,
            image_url:    src?.image_url    || defaultImg,
            hours:        s.hours,
            business_id:  profile.business_id,
            service_type: "Custom",
            main_service: true,
          })
          .select("service_id")
          .single();
        if (copyErr) { setSaving(false); setFormError("Failed to copy service: " + copyErr.message); return; }
        serviceId = copy.service_id;

        // Mirror template materials only when the user made no material changes
        if (!s.materialsPending) {
          const { data: mats } = await supabase
            .from("material_service_link")
            .select("material_id, quantity, sort_order")
            .eq("service_id", s.sourceServiceId);
          if (mats?.length) {
            await supabase.from("material_service_link").insert(
              mats.map(m => ({
                service_id:  serviceId,
                material_id: m.material_id,
                business_id: profile.business_id,
                quantity:    m.quantity,
                sort_order:  m.sort_order ?? 0,
              }))
            );
          }
        }
      }

      // Apply user's material edits (if any)
      if (s.materialsPending) {
        const { materials = [], originalMaterials = [] } = s.materialsPending;
        for (let mi = 0; mi < materials.length; mi++) {
          const m = materials[mi];
          if (!m.materialId && !m.name?.trim()) continue;
          const o = originalMaterials[mi];
          const isModified = !!o && !!m.materialId &&
            (m.name !== o.name || m.basePrice !== o.basePrice || m.markup !== o.markup);
          let materialId = m.materialId;
          if (isModified || (!materialId && m.name?.trim())) {
            const { data: nm } = await supabase
              .from("material")
              .insert([{
                name:               m.name,
                base_price_no_vat:  parseFloat(m.basePrice) || 0,
                markup:             parseFloat(m.markup)    || 0,
                image_url:          m.imageUrl || defaultImg,
                business_id:        profile.business_id,
              }])
              .select()
              .maybeSingle();
            materialId = nm?.material_id;
          }
          if (materialId) {
            await supabase.from("material_service_link").insert([{
              material_id: materialId,
              service_id:  serviceId,
              business_id: profile.business_id,
              quantity:    parseInt(m.quantity) || 1,
              sort_order:  mi,
            }]);
          }
        }
      }

      await supabase.from("quote_service_link").insert({
        quote_id:  quoteId,
        service_id: serviceId,
        task:      s.task     || null,
        quantity:  parseInt(s.quantity) || 1,
      });
    }

    setSaving(false);

    if (!selectedServices.length) {
      // No services — go straight to the quote view
      if (onSaved) onSaved();
      onClose();
      navigate(`/crm/quotes/${quoteId}`);
    } else {
      // Services were added — ask whether to send now
      setSendStep({ quoteId });
    }
  };

  const handleSendYes = async () => {
    if (!sendStep) return;
    setSending(true);
    try {
      await sendQuote({ quoteId: sendStep.quoteId, profile, updateStatus: true });
    } catch (e) {
      // Non-fatal — quote is already saved; just navigate anyway
      console.error("Send failed:", e);
    }
    setSending(false);
    if (onSaved) onSaved();
    onClose();
    navigate(`/crm/quotes/${sendStep.quoteId}`);
  };

  const handleSendNo = () => {
    const id = sendStep.quoteId;
    if (onSaved) onSaved();
    onClose();
    navigate(`/crm/quotes/${id}`);
  };

  const customerName = c => [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unnamed";

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 rounded-2xl w-full max-w-2xl" style={{ height: "90vh", display: "flex", flexDirection: "column" }}>

          <h3 style={{ flexShrink: 0 }} className="text-xl font-bold px-6 pt-6 pb-4 text-white border-b border-zinc-800">
            Add Job
          </h3>

          <div style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0 }} className="px-6 py-4 space-y-4">

            {/* Title */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Title <span className="text-red-400">*</span></label>
              <input
                value={form.title}
                onChange={e => handleChange("title", e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
                placeholder="e.g. Kitchen Renovation"
              />
            </div>

            {/* Customer — hidden when fixed */}
            {!fixedCustomerId && (
              <div style={{ position: "relative" }}>
                <label className="text-xs text-zinc-400 mb-1 block">Customer <span className="text-red-400">*</span></label>
                <input
                  value={customerSearch}
                  onChange={e => {
                    setCustomerSearch(e.target.value);
                    setCustomerDropOpen(true);
                    if (!e.target.value) handleCustomerChange("");
                  }}
                  onFocus={() => setCustomerDropOpen(true)}
                  onBlur={() => setTimeout(() => setCustomerDropOpen(false), 150)}
                  placeholder="Search customer…"
                  className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
                />
                {customerDropOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    zIndex: 200, background: "#09090b", border: "1px solid #3f3f46",
                    borderRadius: "6px", maxHeight: "200px", overflowY: "auto",
                  }}>
                    {customers
                      .filter(c => customerName(c).toLowerCase().includes(customerSearch.toLowerCase()))
                      .map(c => (
                        <div
                          key={c.customer_id}
                          onMouseDown={() => {
                            handleCustomerChange(c.customer_id);
                            setCustomerSearch(customerName(c));
                            setCustomerDropOpen(false);
                          }}
                          className="px-4 py-3 text-sm text-white cursor-pointer hover:bg-zinc-800 transition"
                          style={{ borderBottom: "1px solid #27272a" }}
                        >
                          {customerName(c)}
                        </div>
                      ))}
                    {customers.filter(c =>
                      customerName(c).toLowerCase().includes(customerSearch.toLowerCase())
                    ).length === 0 && (
                      <p className="px-4 py-3 text-sm text-zinc-500">No customers found.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Description</label>
              <textarea
                value={form.description}
                onChange={e => handleChange("description", e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm resize-none"
                placeholder="Details about the job…"
              />
            </div>

            {/* Address */}
            <div className="rounded-xl border border-zinc-700 p-4 space-y-3">
              <p className="text-sm text-zinc-300 font-medium">Job Address</p>

              {addrView === "display" && (
                <>
                  <div className="bg-zinc-950 rounded-xl p-3 text-sm text-zinc-200 space-y-0.5">
                    {form.address_line1 && <p>{form.address_line1}</p>}
                    {form.address_line2 && <p>{form.address_line2}</p>}
                    {(form.town_city || form.postcode) && <p>{[form.town_city, form.postcode].filter(Boolean).join(", ")}</p>}
                    {form.county  && <p>{form.county}</p>}
                    {form.country && <p>{form.country}</p>}
                  </div>
                  <button onClick={() => setAddrView("lookup")} className="text-sky-400 text-sm hover:underline">Change address</button>
                </>
              )}

              {addrView === "lookup" && (
                <>
                  <AddressLookup
                    onSelect={handleAddressSelect}
                    onManualEntry={() => {
                      setForm(prev => ({ ...prev, address_line1: "", address_line2: "", town_city: "", county: "", postcode: "", country: "" }));
                      setAddrView("form");
                    }}
                  />
                  {(form.address_line1 || form.postcode) && (
                    <button onClick={() => setAddrView("display")} className="text-zinc-500 text-sm hover:underline">Cancel</button>
                  )}
                </>
              )}

              {addrView === "form" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-zinc-400 mb-1 block">Address Line 1</label>
                      <input value={form.address_line1} onChange={e => handleChange("address_line1", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Address line 1" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-zinc-400 mb-1 block">Address Line 2</label>
                      <input value={form.address_line2} onChange={e => handleChange("address_line2", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Address line 2" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Town / City</label>
                      <input value={form.town_city} onChange={e => handleChange("town_city", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Town / City" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">County</label>
                      <input value={form.county} onChange={e => handleChange("county", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="County" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Postcode</label>
                      <input value={form.postcode} onChange={e => handleChange("postcode", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Postcode" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Country</label>
                      <input value={form.country} onChange={e => handleChange("country", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Country" />
                    </div>
                  </div>
                  <button onClick={() => setAddrView("lookup")} className="text-sky-400 text-sm hover:underline">← Back to search</button>
                </>
              )}
            </div>

            {/* Services */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setServicesModalOpen(true)}
                className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl hover:bg-zinc-700 text-sm"
              >
                Select Services
              </button>
              {selectedServices.length > 0 && (
                <span className="text-xs text-zinc-400">
                  {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} selected
                </span>
              )}
            </div>

            {formError && <p className="text-red-400 text-sm">{formError}</p>}
          </div>

          {sendStep ? (
            <div style={{ flexShrink: 0 }} className="px-6 py-4 border-t border-zinc-800">
              <p className="text-sm text-white font-medium mb-3">
                Job saved. Would you like to send the quote to the customer now?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleSendNo}
                  disabled={sending}
                  className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm disabled:opacity-50"
                >
                  No, save as draft
                </button>
                <button
                  onClick={handleSendYes}
                  disabled={sending}
                  className="px-5 py-2 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition text-sm disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Yes, send quote"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ flexShrink: 0 }} className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={onClose} className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition text-sm disabled:opacity-50">
                {saving ? "Saving…" : "Add Job"}
              </button>
            </div>
          )}
        </div>
      </div>

      <ServiceQuoteLink
        isOpen={servicesModalOpen}
        onClose={() => setServicesModalOpen(false)}
        profile={profile}
        quoteId={null}
        initialServices={selectedServices}
        onSave={svcs => setSelectedServices(svcs)}
      />
    </>
  );
}
