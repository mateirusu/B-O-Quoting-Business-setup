import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { sendQuote } from "../utils/quoteSend";
import ServiceQuoteLink from "../pages/CRM/Quote/ServiceQuoteLink";

const customerName = c =>
  [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unnamed";

export default function AddQuoteModal({ isOpen, onClose, onSaved, profile }) {
  const navigate = useNavigate();

  const [title,            setTitle]            = useState("");
  const [description,      setDescription]      = useState("");
  const [customers,        setCustomers]        = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch,   setCustomerSearch]   = useState("");
  const [customerDropOpen, setCustomerDropOpen] = useState(false);
  const [jobs,             setJobs]             = useState([]);
  const [jobsLoading,      setJobsLoading]      = useState(false);
  const [selectedJob,      setSelectedJob]      = useState(null);
  const [jobSearch,        setJobSearch]        = useState("");
  const [jobDropOpen,      setJobDropOpen]      = useState(false);
  const [selectedServices, setSelectedServices] = useState([]);
  const [servicesModalOpen,setServicesModalOpen]= useState(false);
  const [saving,           setSaving]           = useState(false);
  const [sending,          setSending]          = useState(false);
  const [formError,        setFormError]        = useState(null);
  const [sendStep,         setSendStep]         = useState(null);

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setDescription("");
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerDropOpen(false);
    setJobs([]);
    setSelectedJob(null);
    setJobSearch("");
    setJobDropOpen(false);
    setSelectedServices([]);
    setFormError(null);
    setSendStep(null);
  }, [isOpen]);

  // Load all customers for this business
  useEffect(() => {
    if (!isOpen || !profile?.business_id) return;
    supabase
      .from("customer")
      .select("customer_id, first_name, last_name, address_line1, address_line2, town_city, county, postcode, country")
      .eq("business_id", profile.business_id)
      .order("first_name")
      .then(({ data }) => setCustomers(data ?? []));
  }, [isOpen, profile?.business_id]);

  // Load jobs for the selected customer
  useEffect(() => {
    if (!selectedCustomer) { setJobs([]); setSelectedJob(null); setJobSearch(""); return; }
    setJobsLoading(true);
    setSelectedJob(null);
    setJobSearch("");
    supabase
      .from("job")
      .select("job_id, title")
      .eq("customer_id", selectedCustomer.customer_id)
      .order("title")
      .then(({ data }) => { setJobs(data ?? []); setJobsLoading(false); });
  }, [selectedCustomer]);

  const handleCustomerSelect = c => {
    setSelectedCustomer(c);
    setCustomerSearch(customerName(c));
    setCustomerDropOpen(false);
  };

  const handleJobSelect = j => {
    setSelectedJob(j);
    setJobSearch(j.title);
    setJobDropOpen(false);
  };

  // Address lines from the selected customer
  const addrLines = selectedCustomer
    ? [
        selectedCustomer.address_line1,
        selectedCustomer.address_line2,
        [selectedCustomer.town_city, selectedCustomer.postcode].filter(Boolean).join(", "),
        selectedCustomer.county,
        selectedCustomer.country,
      ].filter(Boolean)
    : [];

  const save = async () => {
    if (!title.trim())       { setFormError("Title is required.");           return; }
    if (!selectedCustomer)   { setFormError("Please select a customer.");    return; }
    if (!selectedJob)        { setFormError("Please select a job.");         return; }
    setSaving(true);
    setFormError(null);

    // Get next quote number for this customer
    const { data: nextNum } = await supabase.rpc("get_next_quote_number", {
      p_customer_id: selectedCustomer.customer_id,
    });

    // Snapshot callout_charge at creation time
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
    const { error: quoteErr } = await supabase.from("quote").insert({
      quote_id:       quoteId,
      title:          title.trim(),
      description:    description || null,
      status:         "Draft",
      quote_number:   nextNum || 1,
      callout_charge: calloutCharge,
    });
    if (quoteErr) { setSaving(false); setFormError(quoteErr.message || "Failed to create quote."); return; }

    await supabase.from("job_quote_link").insert({
      job_id:   selectedJob.job_id,
      quote_id: quoteId,
    });

    if (profile?.business_id) {
      await supabase.from("quote_timeline").insert({
        quote_id:    quoteId,
        business_id: profile.business_id,
        status:      "Draft",
        notes:       "Quote created",
      });
    }

    // Materialise service recipes
    const defaultImg = "https://images.unsplash.com/photo-1581090464777-f3220bbe1b8b?q=80&w=1200&auto=format&fit=crop";
    for (const s of selectedServices) {
      let serviceId;

      if (!s.sourceServiceId) {
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
        const { data: src } = await supabase
          .from("service")
          .select("title, description, image_url, hours")
          .eq("service_id", s.sourceServiceId)
          .single();
        const { data: copy, error: copyErr } = await supabase
          .from("service")
          .insert({
            title:        s.name,
            description:  src?.description || null,
            image_url:    src?.image_url   || defaultImg,
            hours:        s.hours,
            business_id:  profile.business_id,
            service_type: "Custom",
            main_service: true,
          })
          .select("service_id")
          .single();
        if (copyErr) { setSaving(false); setFormError("Failed to copy service: " + copyErr.message); return; }
        serviceId = copy.service_id;

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
                name:              m.name,
                base_price_no_vat: parseFloat(m.basePrice) || 0,
                markup:            parseFloat(m.markup)    || 0,
                image_url:         m.imageUrl || defaultImg,
                business_id:       profile.business_id,
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
        quote_id:   quoteId,
        service_id: serviceId,
        task:       s.task    || null,
        quantity:   parseInt(s.quantity) || 1,
      });
    }

    setSaving(false);

    if (!selectedServices.length) {
      if (onSaved) onSaved();
      onClose();
      navigate(`/crm/quotes/${quoteId}`);
    } else {
      setSendStep({ quoteId });
    }
  };

  const handleSendYes = async () => {
    if (!sendStep) return;
    setSending(true);
    try {
      await sendQuote({ quoteId: sendStep.quoteId, profile, updateStatus: true });
    } catch (e) {
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

  if (!isOpen) return null;

  const filteredCustomers = customers.filter(c =>
    customerName(c).toLowerCase().includes(customerSearch.toLowerCase())
  );
  const filteredJobs = jobs.filter(j =>
    j.title.toLowerCase().includes(jobSearch.toLowerCase())
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 rounded-2xl w-full max-w-2xl" style={{ height: "90vh", display: "flex", flexDirection: "column" }}>

          <h3 style={{ flexShrink: 0 }} className="text-xl font-bold px-6 pt-6 pb-4 text-white border-b border-zinc-800">
            Add Quote
          </h3>

          <div style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0 }} className="px-6 py-4 space-y-4">

            {/* Title */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Title <span className="text-red-400">*</span></label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
                placeholder="e.g. Kitchen Renovation"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm resize-none"
                placeholder="Details about the quote…"
              />
            </div>

            {/* Customer dropdown */}
            <div style={{ position: "relative" }}>
              <label className="text-xs text-zinc-400 mb-1 block">Customer <span className="text-red-400">*</span></label>
              <input
                value={customerSearch}
                onChange={e => {
                  setCustomerSearch(e.target.value);
                  setCustomerDropOpen(true);
                  if (!e.target.value) { setSelectedCustomer(null); }
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
                  {filteredCustomers.length === 0 && (
                    <p className="px-4 py-3 text-sm text-zinc-500">No customers found.</p>
                  )}
                  {filteredCustomers.map(c => (
                    <div
                      key={c.customer_id}
                      onMouseDown={() => handleCustomerSelect(c)}
                      className="px-4 py-3 text-sm text-white cursor-pointer hover:bg-zinc-800 transition"
                      style={{ borderBottom: "1px solid #27272a" }}
                    >
                      {customerName(c)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Job dropdown — only shown once a customer is selected */}
            {selectedCustomer && (
              <div style={{ position: "relative" }}>
                <label className="text-xs text-zinc-400 mb-1 block">Job <span className="text-red-400">*</span></label>
                {jobsLoading ? (
                  <p className="text-zinc-500 text-sm">Loading jobs…</p>
                ) : jobs.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No jobs found for this customer.</p>
                ) : (
                  <>
                    <input
                      value={jobSearch}
                      onChange={e => { setJobSearch(e.target.value); setJobDropOpen(true); }}
                      onFocus={() => setJobDropOpen(true)}
                      onBlur={() => setTimeout(() => setJobDropOpen(false), 150)}
                      placeholder="Search job…"
                      className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
                    />
                    {jobDropOpen && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                        zIndex: 200, background: "#09090b", border: "1px solid #3f3f46",
                        borderRadius: "6px", maxHeight: "200px", overflowY: "auto",
                      }}>
                        {filteredJobs.length === 0 && (
                          <p className="px-4 py-3 text-sm text-zinc-500">No jobs match.</p>
                        )}
                        {filteredJobs.map(j => (
                          <div
                            key={j.job_id}
                            onMouseDown={() => handleJobSelect(j)}
                            className="px-4 py-3 text-sm text-white cursor-pointer hover:bg-zinc-800 transition"
                            style={{ borderBottom: "1px solid #27272a" }}
                          >
                            {j.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Customer address — read-only */}
            {addrLines.length > 0 && (
              <div className="rounded-xl border border-zinc-700 p-4">
                <p className="text-sm text-zinc-300 font-medium mb-2">Customer Address</p>
                <div className="bg-zinc-950 rounded-xl p-3 text-sm text-zinc-200 space-y-0.5">
                  {addrLines.map((l, i) => <p key={i}>{l}</p>)}
                </div>
              </div>
            )}

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
                Quote saved. Would you like to send it to the customer now?
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
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition text-sm disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add Quote"}
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
