import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../supabaseClient";
import AddressLookup from "../../../components/AddressLookup";
import AddJobModal from "../../../components/AddJobModal";

const emptyForm = {
  first_name: "", last_name: "", email: "", phone: "",
  address_line1: "", address_line2: "", town_city: "",
  county: "", postcode: "", country: "", notes: "",
};

const hasAddress = f =>
  !!(f.address_line1 || f.postcode);

export default function Clients() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState(null); // null | "add" | "edit"
  const [form, setForm]           = useState(emptyForm);
  const [addrView, setAddrView]   = useState("lookup");
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [deleteId, setDeleteId]     = useState(null);

  // Post-creation prompt
  const [newCustomer,        setNewCustomer]        = useState(null); // { customer_id }
  const [jobModal,           setJobModal]           = useState(false);
  const [jobModalCustomerId, setJobModalCustomerId] = useState(null);

  const load = async () => {
    if (!profile?.business_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("customer")
      .select("customer_id, first_name, last_name, email, phone, town_city, postcode, created_at")
      .eq("business_id", profile.business_id)
      .order("created_at", { ascending: false });
    if (error) setError("Failed to load customers.");
    else setCustomers(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.business_id]);

  const openAdd = () => {
    setForm(emptyForm);
    setAddrView("lookup");
    setFormError(null);
    setModal("add");
  };

  const openEdit = async customerId => {
    const { data } = await supabase
      .from("customer").select("*").eq("customer_id", customerId).single();
    if (data) {
      const f = {
        _id:          data.customer_id,
        first_name:   data.first_name   || "",
        last_name:    data.last_name    || "",
        email:        data.email        || "",
        phone:        data.phone        || "",
        address_line1:data.address_line1|| "",
        address_line2:data.address_line2|| "",
        town_city:    data.town_city    || "",
        county:       data.county       || "",
        postcode:     data.postcode     || "",
        country:      data.country      || "",
        notes:        data.notes        || "",
      };
      setForm(f);
      setAddrView(hasAddress(f) ? "display" : "lookup");
      setFormError(null);
      setModal("edit");
    }
  };

  const closeModal = () => { setModal(null); setForm(emptyForm); setFormError(null); setFieldErrors({}); };

  const handleChange = (k, v) => {
    setForm(prev => ({ ...prev, [k]: v }));
    if (fieldErrors[k]) setFieldErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  };

  const validate = () => {
    const errs = {};
    if (!form.first_name.trim()) errs.first_name = "First name is required.";
    if (!form.last_name.trim())  errs.last_name  = "Last name is required.";
    if (!form.email.trim()) {
      errs.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = "Please enter a valid email address.";
    }
    if (!form.phone.trim()) {
      errs.phone = "Phone number is required.";
    } else if (!/^[\d\s+\-().]{7,}$/.test(form.phone.trim())) {
      errs.phone = "Please enter a valid phone number.";
    }
    if (!form.address_line1.trim() || !form.town_city.trim() || !form.postcode.trim()) {
      errs.address = "Please enter a full address (street, town/city and postcode are required).";
    }
    return errs;
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
    setFieldErrors(prev => { const n = { ...prev }; delete n.address; return n; });
    setAddrView("display");
  };

  const save = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSaving(true);
    setFormError(null);
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const payload = { ...form, first_name: cap(form.first_name), last_name: cap(form.last_name) };
    delete payload._id;
    Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });

    if (modal === "add") {
      const { data: inserted, error } = await supabase
        .from("customer")
        .insert({ ...payload, business_id: profile.business_id })
        .select("customer_id")
        .single();
      setSaving(false);
      if (error) { setFormError(error.message || "Failed to save."); return; }
      closeModal();
      load();
      setNewCustomer(inserted);
    } else {
      const { error } = await supabase.from("customer").update(payload).eq("customer_id", form._id);
      setSaving(false);
      if (error) { setFormError(error.message || "Failed to save."); return; }
      closeModal();
      load();
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await supabase.from("customer").delete().eq("customer_id", deleteId);
    setDeleteId(null);
    load();
  };

  const openJobModal = () => {
    const id = newCustomer.customer_id;
    setNewCustomer(null);
    setJobModalCustomerId(id);
    setJobModal(true);
  };

  if (loading) return <p className="text-zinc-400 text-sm">Loading customers…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  const q = search.toLowerCase();
  const filtered = q
    ? customers.filter(c =>
        [c.first_name, c.last_name, c.email, c.phone, c.town_city, c.postcode]
          .some(v => v?.toLowerCase().includes(q))
      )
    : customers;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Clients</h2>
        <button onClick={openAdd} className="px-4 py-2 bg-sky-500 text-black font-semibold rounded-xl hover:bg-sky-400 transition text-sm">
          + Add Client
        </button>
      </div>

      {/* ── Search ── */}
      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, phone, town or postcode…"
          className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
        />
      </div>

      {/* ── Table ── */}
      {customers.length === 0 ? (
        <p className="text-zinc-400 text-sm">No clients yet. Add your first one.</p>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-400 text-sm">No clients match your search.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Town / City</th>
                <th className="px-4 py-3">Postcode</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {filtered.map(c => (
                <tr key={c.customer_id} className="hover:bg-zinc-800 transition">
                  <td className="px-4 py-3 text-white font-medium">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{c.town_city || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{c.postcode || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{new Date(c.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => navigate(`/crm/clients/${c.customer_id}`)} className="px-3 py-1 text-xs rounded-lg bg-sky-500 text-black font-semibold hover:bg-sky-400 transition">View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-2xl" style={{ height: "90vh", display: "flex", flexDirection: "column" }}>

            <h3 style={{ flexShrink: 0, paddingLeft: "24px", paddingRight: "24px" }} className="text-xl font-bold px-6 pt-6 pb-4 text-white border-b border-zinc-800">
              {modal === "add" ? "Add Client" : "Edit Client"}
            </h3>

            <div style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0, paddingLeft: "24px", paddingRight: "24px" }} className="px-6 py-4 space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">First Name <span className="text-red-400">*</span></label>
                  <input value={form.first_name} onChange={e => handleChange("first_name", e.target.value)} className={`w-full p-3 rounded-xl bg-zinc-950 text-white text-sm ${fieldErrors.first_name ? "ring-1 ring-red-500" : ""}`} placeholder="First Name" />
                  {fieldErrors.first_name && <p className="text-red-400 text-xs mt-1">{fieldErrors.first_name}</p>}
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Last Name <span className="text-red-400">*</span></label>
                  <input value={form.last_name} onChange={e => handleChange("last_name", e.target.value)} className={`w-full p-3 rounded-xl bg-zinc-950 text-white text-sm ${fieldErrors.last_name ? "ring-1 ring-red-500" : ""}`} placeholder="Last Name" />
                  {fieldErrors.last_name && <p className="text-red-400 text-xs mt-1">{fieldErrors.last_name}</p>}
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Email <span className="text-red-400">*</span></label>
                  <input type="email" value={form.email} onChange={e => handleChange("email", e.target.value)} className={`w-full p-3 rounded-xl bg-zinc-950 text-white text-sm ${fieldErrors.email ? "ring-1 ring-red-500" : ""}`} placeholder="Email" />
                  {fieldErrors.email && <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Phone <span className="text-red-400">*</span></label>
                  <input value={form.phone} onChange={e => handleChange("phone", e.target.value)} className={`w-full p-3 rounded-xl bg-zinc-950 text-white text-sm ${fieldErrors.phone ? "ring-1 ring-red-500" : ""}`} placeholder="Phone" />
                  {fieldErrors.phone && <p className="text-red-400 text-xs mt-1">{fieldErrors.phone}</p>}
                </div>
              </div>

              <div className={`rounded-xl border p-4 space-y-3 ${fieldErrors.address ? "border-red-500" : "border-zinc-700"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-300 font-medium">Address <span className="text-red-400">*</span></p>
                  {fieldErrors.address && <p className="text-red-400 text-xs">{fieldErrors.address}</p>}
                </div>

                {addrView === "display" && (
                  <>
                    <div className="bg-zinc-950 rounded-xl p-3 text-sm text-zinc-200 space-y-0.5">
                      {form.address_line1 && <p>{form.address_line1}</p>}
                      {form.address_line2 && <p>{form.address_line2}</p>}
                      {(form.town_city || form.postcode) && (
                        <p>{[form.town_city, form.postcode].filter(Boolean).join(", ")}</p>
                      )}
                      {form.county  && <p>{form.county}</p>}
                      {form.country && <p>{form.country}</p>}
                    </div>
                    <button onClick={() => setAddrView("lookup")} className="text-sky-400 text-sm hover:underline">
                      Change address
                    </button>
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
                    {hasAddress(form) && (
                      <button onClick={() => setAddrView("display")} className="text-zinc-500 text-sm hover:underline">
                        Cancel
                      </button>
                    )}
                  </>
                )}

                {addrView === "form" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs text-zinc-400 mb-1 block">Address Line 1</label>
                        <input value={form.address_line1} onChange={e => handleChange("address_line1", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Street address" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-zinc-400 mb-1 block">Address Line 2</label>
                        <input value={form.address_line2} onChange={e => handleChange("address_line2", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Optional" />
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
                    <button onClick={() => setAddrView("lookup")} className="text-sky-400 text-sm hover:underline">
                      ← Back to search
                    </button>
                  </>
                )}
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => handleChange("notes", e.target.value)} rows={3} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm resize-none" style={{ resize: "vertical", width: "100%", boxSizing: "border-box" }} placeholder="Any additional notes…" />
              </div>

              {formError && <p className="text-red-400 text-sm">{formError}</p>}
            </div>

            <div style={{ flexShrink: 0, paddingLeft: "24px", paddingRight: "24px" }} className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={closeModal} className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition text-sm disabled:opacity-50">
                {saving ? "Saving…" : modal === "add" ? "Add Client" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Post-creation prompt ── */}
      {newCustomer && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl p-8 space-y-6" style={{ width: "50%" }}>
            <div>
              <h3 className="text-3xl font-bold text-white mb-1">Client Added</h3>
              <p className="text-zinc-400">What would you like to do next?</p>
            </div>

            <div className="space-y-3 flex flex-col items-center">
              <button
                onClick={openJobModal}
                className="px-5 py-3 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition"
                style={{ width: "50%" }}
              >
                Create Job
              </button>

              <button
                onClick={() => navigate(`/crm/clients/${newCustomer.customer_id}`)}
                className="px-5 py-3 rounded-xl bg-zinc-800 text-white font-semibold hover:bg-zinc-700 transition"
                style={{ width: "50%" }}
              >
                See Client Details
              </button>

              <button
                onClick={() => setNewCustomer(null)}
                className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition"
                style={{ width: "50%" }}
              >
                Back to Clients Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-white">Delete Client?</h3>
            <p className="text-zinc-400 text-sm">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm">Cancel</button>
              <button onClick={confirmDelete} className="px-5 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-500 transition text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Job modal (launched from post-creation prompt) ── */}
      <AddJobModal
        isOpen={jobModal}
        onClose={() => { setJobModal(false); setJobModalCustomerId(null); }}
        onSaved={load}
        profile={profile}
        fixedCustomerId={jobModalCustomerId}
      />
    </div>
  );
}
