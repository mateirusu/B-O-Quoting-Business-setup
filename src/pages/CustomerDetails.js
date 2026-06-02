import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import AddressLookup from "../components/AddressLookup";

const emptyForm = {
  first_name: "", last_name: "", email: "", phone: "",
  address_line1: "", address_line2: "", town_city: "",
  county: "", postcode: "", country: "", notes: "",
};

const hasAddress = f => !!(f.address_line1 || f.postcode);

export default function CustomerDetails() {
  const { customerId } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [modal, setModal]               = useState(false);
  const [form, setForm]                 = useState(emptyForm);
  const [addrView, setAddrView]         = useState("lookup");
  const [saving, setSaving]             = useState(false);
  const [formError, setFormError]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customer").select("*").eq("customer_id", customerId).single();
    if (error || !data) setError("Customer not found.");
    else setCustomer(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [customerId]);

  const openEdit = () => {
    const f = {
      first_name:    customer.first_name    || "",
      last_name:     customer.last_name     || "",
      email:         customer.email         || "",
      phone:         customer.phone         || "",
      address_line1: customer.address_line1 || "",
      address_line2: customer.address_line2 || "",
      town_city:     customer.town_city     || "",
      county:        customer.county        || "",
      postcode:      customer.postcode      || "",
      country:       customer.country       || "",
      notes:         customer.notes         || "",
    };
    setForm(f);
    setAddrView(hasAddress(f) ? "display" : "lookup");
    setFormError(null);
    setModal(true);
  };

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
    Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
    const { error } = await supabase.from("customer").update(payload).eq("customer_id", customerId);
    setSaving(false);
    if (error) { setFormError(error.message || "Failed to save."); return; }
    setModal(false);
    load();
  };

  const handleDelete = async () => {
    await supabase.from("customer").delete().eq("customer_id", customerId);
    navigate("/crm");
  };

  if (loading) return <p className="text-zinc-400 text-sm">Loading…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Unnamed Client";

  return (
    <div className="space-y-6">

      {/* ── Name + actions ── */}
      <div className="flex items-start justify-between">
        <h1 className="text-3xl font-bold text-white">{fullName}</h1>
        <div className="flex gap-3">
          <button onClick={openEdit} className="px-4 py-2 bg-sky-500 text-black font-semibold rounded-xl hover:bg-sky-400 transition text-sm">
            Edit
          </button>
          <button onClick={() => setConfirmDelete(true)} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-500 transition text-sm">
            Delete
          </button>
        </div>
      </div>

      {/* ── Details card ── */}
      <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">

          {/* Contact */}
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Contact</p>
            {customer.email && (
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Email</p>
                <p className="text-white text-sm">{customer.email}</p>
              </div>
            )}
            {customer.phone && (
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Phone</p>
                <p className="text-white text-sm">{customer.phone}</p>
              </div>
            )}
            {!customer.email && !customer.phone && (
              <p className="text-zinc-500 text-sm">No contact details on record.</p>
            )}
          </div>

          {/* Address */}
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Address</p>
            {(customer.address_line1 || customer.postcode) ? (
              <div className="text-sm text-white space-y-0.5">
                {customer.address_line1 && <p>{customer.address_line1}</p>}
                {customer.address_line2 && <p>{customer.address_line2}</p>}
                {(customer.town_city || customer.postcode) && (
                  <p>{[customer.town_city, customer.postcode].filter(Boolean).join(", ")}</p>
                )}
                {customer.county  && <p>{customer.county}</p>}
                {customer.country && <p>{customer.country}</p>}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">No address on record.</p>
            )}
          </div>
        </div>

        {/* Notes */}
        {customer.notes && (
          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Notes</p>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        )}

        <p className="text-xs text-zinc-500 border-t border-zinc-800 pt-4">
          Added {new Date(customer.created_at).toLocaleDateString("en-GB")}
        </p>
      </div>

      {/* ── Edit modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-2xl" style={{ height: "90vh", display: "flex", flexDirection: "column" }}>
            <h3 style={{ flexShrink: 0 }} className="text-xl font-bold px-6 pt-6 pb-4 text-white border-b border-zinc-800">
              Edit Client
            </h3>

            <div style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0 }} className="px-6 py-4 space-y-4">
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

              <div className="rounded-xl border border-zinc-700 p-4 space-y-3">
                <p className="text-sm text-zinc-300 font-medium">Address</p>

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
                    {hasAddress(form) && (
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

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => handleChange("notes", e.target.value)} rows={3} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm resize-none" placeholder="Any additional notes…" />
              </div>

              {formError && <p className="text-red-400 text-sm">{formError}</p>}
            </div>

            <div style={{ flexShrink: 0 }} className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition text-sm disabled:opacity-50">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-white">Delete Client?</h3>
            <p className="text-zinc-400 text-sm">This will permanently delete <span className="text-white font-medium">{fullName}</span> and cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(false)} className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-500 transition text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
