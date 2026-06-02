import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import AddressLookup from "../components/AddressLookup";

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

export default function Jobs() {
  const { profile } = useAuth();
  const [jobs, setJobs]           = useState([]);
  const [customers, setCustomers] = useState([]);
  const [services, setServices]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");

  const [modal, setModal]             = useState(false);
  const [form, setForm]               = useState(emptyForm);
  const [selectedServices, setSelectedServices] = useState([]);
  const [addrView, setAddrView]       = useState("lookup");
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState(null);

  const loadJobs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job")
      .select("job_id, title, description, town_city, postcode, created_at, customer:customer_id(customer_id, first_name, last_name)")
      .order("created_at", { ascending: false });
    if (error) setError("Failed to load jobs.");
    else setJobs(data ?? []);
    setLoading(false);
  };

  const loadCustomers = async () => {
    if (!profile?.business_id) return;
    const { data } = await supabase
      .from("customer")
      .select("customer_id, first_name, last_name, address_line1, address_line2, town_city, county, postcode, country")
      .eq("business_id", profile.business_id)
      .order("first_name");
    setCustomers(data ?? []);
  };

  const loadServices = async () => {
    if (!profile?.business_id) return;
    const { data } = await supabase
      .from("service")
      .select("service_id, title")
      .eq("business_id", profile.business_id)
      .order("title");
    setServices(data ?? []);
  };

  useEffect(() => {
    loadJobs();
    loadCustomers();
    loadServices();
  }, [profile?.business_id]);

  const openAdd = () => {
    setForm(emptyForm);
    setSelectedServices([]);
    setAddrView("lookup");
    setFormError(null);
    setModal(true);
  };

  const closeModal = () => { setModal(false); setForm(emptyForm); setFormError(null); };

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

  const toggleService = id =>
    setSelectedServices(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );

  const save = async () => {
    if (!form.title.trim()) { setFormError("Title is required."); return; }
    if (!form.customer_id)  { setFormError("Please select a customer."); return; }
    setSaving(true);
    setFormError(null);

    const payload = { ...form };
    Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });

    const { data: job, error } = await supabase
      .from("job").insert(payload).select("job_id").single();

    if (error) { setSaving(false); setFormError(error.message || "Failed to save."); return; }

    if (selectedServices.length) {
      await supabase.from("job_service_link").insert(
        selectedServices.map(service_id => ({ job_id: job.job_id, service_id }))
      );
    }

    setSaving(false);
    closeModal();
    loadJobs();
  };

  const customerName = c =>
    [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unnamed";

  if (loading) return <p className="text-zinc-400 text-sm">Loading jobs…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  const q = search.toLowerCase();
  const filtered = q
    ? jobs.filter(j =>
        j.title?.toLowerCase().includes(q) ||
        customerName(j.customer).toLowerCase().includes(q) ||
        j.town_city?.toLowerCase().includes(q) ||
        j.postcode?.toLowerCase().includes(q)
      )
    : jobs;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Jobs</h2>
        <button onClick={openAdd} className="px-4 py-2 bg-sky-500 text-black font-semibold rounded-xl hover:bg-sky-400 transition text-sm">
          + Add Job
        </button>
      </div>

      {/* ── Search ── */}
      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, customer, town or postcode…"
          className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
        />
      </div>

      {/* ── Table ── */}
      {jobs.length === 0 ? (
        <p className="text-zinc-400 text-sm">No jobs yet. Add your first one.</p>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-400 text-sm">No jobs match your search.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Town / City</th>
                <th className="px-4 py-3">Postcode</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {filtered.map(j => (
                <tr key={j.job_id} className="hover:bg-zinc-800 transition">
                  <td className="px-4 py-3 text-white font-medium">{j.title}</td>
                  <td className="px-4 py-3 text-zinc-300">{customerName(j.customer)}</td>
                  <td className="px-4 py-3 text-zinc-300">{j.town_city || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{j.postcode  || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{new Date(j.created_at).toLocaleDateString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Job modal ── */}
      {modal && (
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

              {/* Customer */}
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
                    <option key={c.customer_id} value={c.customer_id}>
                      {customerName(c)}
                    </option>
                  ))}
                </select>
              </div>

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
                        <input value={form.address_line1} onChange={e => handleChange("address_line1", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="1 Windsor Road" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-zinc-400 mb-1 block">Address Line 2</label>
                        <input value={form.address_line2} onChange={e => handleChange("address_line2", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Walton-le-Dale" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Town / City</label>
                        <input value={form.town_city} onChange={e => handleChange("town_city", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Preston" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">County</label>
                        <input value={form.county} onChange={e => handleChange("county", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Lancashire" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Postcode</label>
                        <input value={form.postcode} onChange={e => handleChange("postcode", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="PR5 4QE" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Country</label>
                        <input value={form.country} onChange={e => handleChange("country", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="United Kingdom" />
                      </div>
                    </div>
                    <button onClick={() => setAddrView("lookup")} className="text-sky-400 text-sm hover:underline">← Back to search</button>
                  </>
                )}
              </div>

              {/* Services */}
              {services.length > 0 && (
                <div>
                  <label className="text-xs text-zinc-400 mb-2 block">Services</label>
                  <div className="rounded-xl border border-zinc-700 overflow-hidden max-h-48 overflow-y-auto">
                    {services.map(s => (
                      <label
                        key={s.service_id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 cursor-pointer border-b border-zinc-700 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedServices.includes(s.service_id)}
                          onChange={() => toggleService(s.service_id)}
                          className="accent-sky-500"
                        />
                        <span className="text-sm text-white">{s.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {formError && <p className="text-red-400 text-sm">{formError}</p>}
            </div>

            <div style={{ flexShrink: 0 }} className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={closeModal} className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition text-sm disabled:opacity-50">
                {saving ? "Saving…" : "Add Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
