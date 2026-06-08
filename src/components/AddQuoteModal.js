import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { sendQuote } from "../utils/quoteSend";
import ServiceQuoteLink from "../pages/CRM/Quote/ServiceQuoteLink";
import AddressLookup from "./AddressLookup";

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
  const [addrView,         setAddrView]         = useState("lookup");
  const [addrForm,         setAddrForm]         = useState({ address_line1: "", address_line2: "", town_city: "", county: "", postcode: "", country: "" });
  const [saving,           setSaving]           = useState(false);
  const [sending,          setSending]          = useState(false);
  const [formError,        setFormError]        = useState(null);
  const [sendStep,         setSendStep]         = useState(null);
  const [customerMode,     setCustomerMode]     = useState("search"); // "search" | "new"
  const [newCustForm,      setNewCustForm]      = useState({ first_name: "", last_name: "", email: "" });
  const [creatingCust,     setCreatingCust]     = useState(false);
  const [createCustError,  setCreateCustError]  = useState(null);
  const newCustIdsRef = useRef([]);

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
    setCustomerMode("search");
    setNewCustForm({ first_name: "", last_name: "", email: "" });
    setCreatingCust(false);
    setCreateCustError(null);
    newCustIdsRef.current = [];
    setAddrView("lookup");
    setAddrForm({ address_line1: "", address_line2: "", town_city: "", county: "", postcode: "", country: "" });
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
    setAddrForm({
      address_line1: c?.address_line1 || "",
      address_line2: c?.address_line2 || "",
      town_city:     c?.town_city     || "",
      county:        c?.county        || "",
      postcode:      c?.postcode      || "",
      country:       c?.country       || "",
    });
    setAddrView(c?.address_line1 || c?.postcode ? "display" : "lookup");
  };

  const handleAddressSelect = r => {
    setAddrForm({
      address_line1: r.line1    || "",
      address_line2: r.line2    || "",
      town_city:     r.city     || "",
      county:        r.county   || "",
      postcode:      r.postcode || "",
      country:       r.country  || "",
    });
    setAddrView("display");
  };

  const handleJobSelect = j => {
    setSelectedJob(j);
    setJobSearch(j.title || "");
    setJobDropOpen(false);
  };

  const save = async () => {
    if (!title.trim())                              { setFormError("Title is required.");        return; }
    if (!selectedCustomer)                         { setFormError("Please select a customer."); return; }
    if (!selectedJob && jobs.length > 0)           { setFormError("Please select a job.");      return; }
    if (!addrForm.address_line1 && !addrForm.postcode) { setFormError("Address is required."); return; }
    setSaving(true);
    setFormError(null);

    // If the customer has no jobs, auto-create one using the quote title + description
    let jobId = selectedJob?.job_id ?? null;
    if (!jobId) {
      const { data: newJob, error: jobErr } = await supabase
        .from("job")
        .insert({
          title:         title.trim(),
          description:   description || null,
          customer_id:   selectedCustomer.customer_id,
          address_line1: addrForm.address_line1 || null,
          address_line2: addrForm.address_line2 || null,
          town_city:     addrForm.town_city     || null,
          county:        addrForm.county        || null,
          postcode:      addrForm.postcode      || null,
          country:       addrForm.country       || null,
        })
        .select("job_id")
        .single();
      if (jobErr) { setSaving(false); setFormError(jobErr.message || "Failed to create job."); return; }
      jobId = newJob.job_id;
    }

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

    await supabase.from("job_quote_link").insert({ job_id: jobId, quote_id: quoteId });

    // Sync address to customer record
    await supabase.from("customer").update({
      address_line1: addrForm.address_line1 || null,
      address_line2: addrForm.address_line2 || null,
      town_city:     addrForm.town_city     || null,
      county:        addrForm.county        || null,
      postcode:      addrForm.postcode      || null,
      country:       addrForm.country       || null,
    }).eq("customer_id", selectedCustomer.customer_id);

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
    newCustIdsRef.current = [];
    setSendStep({ quoteId });
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

  const handleCreateCustomer = async () => {
    if (!newCustForm.first_name.trim()) { setCreateCustError("First name is required."); return; }
    setCreatingCust(true);
    setCreateCustError(null);
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const { data: cust, error: custErr } = await supabase
      .from("customer")
      .insert({
        first_name:  cap(newCustForm.first_name.trim()),
        last_name:   cap(newCustForm.last_name.trim())  || null,
        email:       newCustForm.email.trim()            || null,
        business_id: profile.business_id,
      })
      .select("customer_id, first_name, last_name, address_line1, address_line2, town_city, county, postcode, country")
      .single();
    if (custErr) { setCreatingCust(false); setCreateCustError(custErr.message || "Failed to create customer."); return; }
    newCustIdsRef.current.push(cust.customer_id);
    setCustomers(prev => [...prev, cust]);
    handleCustomerSelect(cust);
    setCustomerMode("search");
    setNewCustForm({ first_name: "", last_name: "", email: "" });
    setCreatingCust(false);
  };

  const handleCancel = async () => {
    if (newCustIdsRef.current.length) {
      for (const id of newCustIdsRef.current) {
        await supabase.from("customer").delete().eq("customer_id", id);
      }
      newCustIdsRef.current = [];
    }
    onClose();
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

          <h3 style={{ flexShrink: 0, paddingLeft: "24px", paddingRight: "24px" }} className="text-xl font-bold px-6 pt-6 pb-4 text-white border-b border-zinc-800">
            Add Quote
          </h3>

          <div style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0, paddingLeft: "24px", paddingRight: "24px" }} className="px-6 py-4 space-y-4">

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
                style={{ resize: "vertical", width: "100%", boxSizing: "border-box" }}
                placeholder="Details about the quote…"
              />
            </div>

            {/* Customer */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Customer <span className="text-red-400">*</span></label>

              {customerMode === "search" ? (
                <div style={{ position: "relative" }}>
                  <input
                    value={customerSearch}
                    onChange={e => {
                      setCustomerSearch(e.target.value);
                      setCustomerDropOpen(true);
                      if (!e.target.value) setSelectedCustomer(null);
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
                      borderRadius: "6px", maxHeight: "220px", overflowY: "auto",
                    }}>
                      {filteredCustomers.length === 0 && (
                        <p className="px-4 py-3 text-sm text-zinc-500 border-b border-zinc-800">No customers found.</p>
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
                      <div
                        onMouseDown={() => { setCustomerDropOpen(false); setCustomerMode("new"); setCreateCustError(null); }}
                        className="px-4 py-3 text-sm cursor-pointer hover:bg-zinc-800 transition font-medium"
                        style={{ color: "#38bdf8" }}
                      >
                        + Add new customer
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-700 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-300 font-medium">New Customer</p>
                    <button
                      type="button"
                      onClick={() => { setCustomerMode("search"); setCreateCustError(null); }}
                      className="text-zinc-500 text-xs hover:text-white transition"
                    >
                      ← Back to search
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">First Name <span className="text-red-400">*</span></label>
                      <input
                        value={newCustForm.first_name}
                        onChange={e => setNewCustForm(prev => ({ ...prev, first_name: e.target.value }))}
                        className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Last Name</label>
                      <input
                        value={newCustForm.last_name}
                        onChange={e => setNewCustForm(prev => ({ ...prev, last_name: e.target.value }))}
                        className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
                        placeholder="Last name"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-zinc-400 mb-1 block">Email</label>
                      <input
                        type="email"
                        value={newCustForm.email}
                        onChange={e => setNewCustForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
                        placeholder="Email address"
                      />
                    </div>
                  </div>
                  {createCustError && <p className="text-red-400 text-sm">{createCustError}</p>}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreateCustomer}
                      disabled={creatingCust}
                      className="px-4 py-2 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition text-sm disabled:opacity-50"
                    >
                      {creatingCust ? "Creating…" : "Add Customer"}
                    </button>
                  </div>
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
                  <p className="text-zinc-500 text-sm">No jobs yet — a job will be created automatically using the quote title.</p>
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

            {/* Address */}
            <div className="rounded-xl border border-zinc-700 p-4 space-y-3">
              <p className="text-sm text-zinc-300 font-medium">Job Address <span className="text-red-400">*</span></p>

              {addrView === "display" && (
                <>
                  <div className="bg-zinc-950 rounded-xl p-3 text-sm text-zinc-200 space-y-0.5">
                    {addrForm.address_line1 && <p>{addrForm.address_line1}</p>}
                    {addrForm.address_line2 && <p>{addrForm.address_line2}</p>}
                    {(addrForm.town_city || addrForm.postcode) && <p>{[addrForm.town_city, addrForm.postcode].filter(Boolean).join(", ")}</p>}
                    {addrForm.county  && <p>{addrForm.county}</p>}
                    {addrForm.country && <p>{addrForm.country}</p>}
                  </div>
                  <button onClick={() => setAddrView("lookup")} className="text-sky-400 text-sm hover:underline">Change address</button>
                </>
              )}

              {addrView === "lookup" && (
                <>
                  <AddressLookup
                    onSelect={handleAddressSelect}
                    onManualEntry={() => {
                      setAddrForm({ address_line1: "", address_line2: "", town_city: "", county: "", postcode: "", country: "" });
                      setAddrView("form");
                    }}
                  />
                  {(addrForm.address_line1 || addrForm.postcode) && (
                    <button onClick={() => setAddrView("display")} className="text-zinc-500 text-sm hover:underline">Cancel</button>
                  )}
                </>
              )}

              {addrView === "form" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-zinc-400 mb-1 block">Address Line 1</label>
                      <input value={addrForm.address_line1} onChange={e => setAddrForm(prev => ({ ...prev, address_line1: e.target.value }))} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Address line 1" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-zinc-400 mb-1 block">Address Line 2</label>
                      <input value={addrForm.address_line2} onChange={e => setAddrForm(prev => ({ ...prev, address_line2: e.target.value }))} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Address line 2" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Town / City</label>
                      <input value={addrForm.town_city} onChange={e => setAddrForm(prev => ({ ...prev, town_city: e.target.value }))} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Town / City" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">County</label>
                      <input value={addrForm.county} onChange={e => setAddrForm(prev => ({ ...prev, county: e.target.value }))} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="County" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Postcode</label>
                      <input value={addrForm.postcode} onChange={e => setAddrForm(prev => ({ ...prev, postcode: e.target.value }))} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Postcode" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Country</label>
                      <input value={addrForm.country} onChange={e => setAddrForm(prev => ({ ...prev, country: e.target.value }))} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Country" />
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
            <div style={{ flexShrink: 0, paddingLeft: "24px", paddingRight: "24px" }} className="px-6 py-4 border-t border-zinc-800">
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
            <div style={{ flexShrink: 0, paddingLeft: "24px", paddingRight: "24px" }} className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button
                onClick={handleCancel}
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
