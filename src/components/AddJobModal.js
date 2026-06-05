import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
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
  const [form,             setForm]             = useState(emptyForm);
  const [customers,        setCustomers]        = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [servicesModalOpen,setServicesModalOpen]= useState(false);
  const [addrView,         setAddrView]         = useState("lookup");
  const [saving,           setSaving]           = useState(false);
  const [formError,        setFormError]        = useState(null);

  // Reset form whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyForm);
    setSelectedServices([]);
    setAddrView("lookup");
    setFormError(null);
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

    const quoteId = crypto.randomUUID();
    const { error: quoteErr } = await supabase
      .from("quote")
      .insert({ quote_id: quoteId, title: form.title.trim(), description: form.description || null, status: "Draft", quote_number: nextNum || 1 });
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

    if (selectedServices.length) {
      await supabase.from("quote_service_link").insert(
        selectedServices.map(s => ({ quote_id: quoteId, service_id: s.serviceId, task: s.task || null }))
      );
    }

    setSaving(false);
    onClose();
    if (onSaved) onSaved();
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
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Customer <span className="text-red-400">*</span></label>
                <select
                  value={form.customer_id}
                  onChange={e => handleCustomerChange(e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
                  style={{ appearance: "none" }}
                >
                  <option value="">Select a customer…</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>{customerName(c)}</option>
                  ))}
                </select>
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

          <div style={{ flexShrink: 0 }} className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm">Cancel</button>
            <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition text-sm disabled:opacity-50">
              {saving ? "Saving…" : "Add Job"}
            </button>
          </div>
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
