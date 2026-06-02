import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import AddressLookup from "../components/AddressLookup";

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
  const [addrView, setAddrView]   = useState("lookup"); // "lookup" | "display" | "form"
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteId, setDeleteId]   = useState(null);

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

  const closeModal = () => { setModal(null); setForm(emptyForm); setFormError(null); };

  const handleChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

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
    if (!form.first_name.trim() && !form.last_name.trim()) {
      setFormError("Please enter at least a first or last name.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = { ...form };
    delete payload._id;
    Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });

    let error;
    if (modal === "add") {
      ({ error } = await supabase.from("customer").insert({ ...payload, business_id: profile.business_id }));
    } else {
      ({ error } = await supabase.from("customer").update(payload).eq("customer_id", form._id));
    }
    setSaving(false);
    if (error) { setFormError(error.message || "Failed to save."); return; }
    closeModal();
    load();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await supabase.from("customer").delete().eq("customer_id", deleteId);
    setDeleteId(null);
    load();
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
                <th className="px-4 py-3"></th>
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
                      <button onClick={() => openEdit(c.customer_id)} className="px-3 py-1 text-xs rounded-lg bg-sky-500 text-black font-semibold hover:bg-sky-400 transition">Edit</button>
                      <button onClick={() => setDeleteId(c.customer_id)} className="px-3 py-1 text-xs rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 transition">Delete</button>
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

            {/* Fixed header */}
            <h3 style={{ flexShrink: 0 }} className="text-xl font-bold px-6 pt-6 pb-4 text-white border-b border-zinc-800">
              {modal === "add" ? "Add Client" : "Edit Client"}
            </h3>

            {/* Scrollable body */}
            <div style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0 }} className="px-6 py-4 space-y-4">

              {/* Name & contact */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">First Name</label>
                  <input value={form.first_name} onChange={e => handleChange("first_name", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="John" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Last Name</label>
                  <input value={form.last_name} onChange={e => handleChange("last_name", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="Smith" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Email</label>
                  <input type="email" value={form.email} onChange={e => handleChange("email", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Phone</label>
                  <input value={form.phone} onChange={e => handleChange("phone", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm" placeholder="+44 7700 000000" />
                </div>
              </div>

              {/* Address — three-view pattern matching Business section */}
              <div className="rounded-xl border border-zinc-700 p-4 space-y-3">
                <p className="text-sm text-zinc-300 font-medium">Address</p>

                {/* DISPLAY view */}
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

                {/* LOOKUP view */}
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

                {/* FORM view */}
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

              {/* Notes */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => handleChange("notes", e.target.value)} rows={3} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm resize-none" placeholder="Any additional notes…" />
              </div>

              {formError && <p className="text-red-400 text-sm">{formError}</p>}
            </div>

            {/* Sticky footer */}
            <div style={{ flexShrink: 0 }} className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
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
    </div>
  );
}
