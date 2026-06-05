import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../supabaseClient";
import AddressLookup from "../../../components/AddressLookup";

const SECTION_KEYS = {
  contact: ["first_name", "last_name", "email", "phone"],
  address: ["address_line1", "address_line2", "town_city", "county", "postcode", "country"],
  notes:   ["notes"],
};

const hasAddress = f => !!(f.address_line1 || f.postcode);

export default function CustomerDetails() {
  const { customerId } = useParams();
  const navigate       = useNavigate();
  const { profile }    = useAuth();

  const [customer,    setCustomer]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  const [fields,   setFields]   = useState({});
  const [original, setOriginal] = useState({});

  const [open, setOpen] = useState({ contact: false, address: false, notes: false, legal: false });

  const [sectionSaving, setSectionSaving] = useState({ contact: false, address: false, notes: false });
  const [sectionMsg,    setSectionMsg]    = useState({ contact: null,  address: null,  notes: null  });
  const [sectionErr,    setSectionErr]    = useState({ contact: null,  address: null,  notes: null  });

  const [addrView, setAddrView] = useState("display");

  // Delete dialog
  const [deleteOpen,       setDeleteOpen]       = useState(false);
  const [customServices,   setCustomServices]   = useState([]);
  const [svcsLoading,      setSvcsLoading]      = useState(false);
  const [checkedServices,  setCheckedServices]  = useState(new Set());
  const [deleting,         setDeleting]         = useState(false);
  const [deleteError,      setDeleteError]      = useState(null);

  // ── Load customer ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customer").select("*").eq("customer_id", customerId).single();
    if (error || !data) { setError("Customer not found."); setLoading(false); return; }
    setCustomer(data);
    const f = {
      first_name:    data.first_name    || "",
      last_name:     data.last_name     || "",
      email:         data.email         || "",
      phone:         data.phone         || "",
      address_line1: data.address_line1 || "",
      address_line2: data.address_line2 || "",
      town_city:     data.town_city     || "",
      county:        data.county        || "",
      postcode:      data.postcode      || "",
      country:       data.country       || "",
      notes:         data.notes         || "",
    };
    setFields(f);
    setOriginal(f);
    setAddrView(hasAddress(f) ? "display" : "lookup");
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  // ── Accordion helpers ─────────────────────────────────────────────────────
  const toggle = key => setOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const isSectionDirty = section =>
    SECTION_KEYS[section].some(k => fields[k] !== original[k]);

  const handleChange = (k, v) => setFields(prev => ({ ...prev, [k]: v }));

  const cancelSection = section => {
    setFields(prev => {
      const reset = { ...prev };
      SECTION_KEYS[section].forEach(k => { reset[k] = original[k]; });
      return reset;
    });
    setSectionMsg(prev => ({ ...prev, [section]: null }));
    setSectionErr(prev => ({ ...prev, [section]: null }));
    if (section === "address") setAddrView(hasAddress(original) ? "display" : "lookup");
  };

  const saveSection = async section => {
    setSectionSaving(prev => ({ ...prev, [section]: true }));
    setSectionMsg(prev => ({ ...prev, [section]: null }));
    setSectionErr(prev => ({ ...prev, [section]: null }));
    try {
      const update = {};
      SECTION_KEYS[section].forEach(k => { update[k] = fields[k] || null; });
      const { error } = await supabase.from("customer").update(update).eq("customer_id", customerId);
      if (error) throw error;
      setOriginal(prev => ({ ...prev, ...update }));
      setCustomer(prev => ({ ...prev, ...update }));
      setSectionMsg(prev => ({ ...prev, [section]: "Saved successfully." }));
      if (section === "address") setAddrView(hasAddress(fields) ? "display" : "lookup");
    } catch (err) {
      setSectionErr(prev => ({ ...prev, [section]: err.message || "Failed to save." }));
    } finally {
      setSectionSaving(prev => ({ ...prev, [section]: false }));
    }
  };

  // ── Address lookup auto-save ──────────────────────────────────────────────
  const handleAddressSelect = async r => {
    const patch = {
      address_line1: r.line1    || null,
      address_line2: r.line2    || null,
      town_city:     r.city     || null,
      county:        r.county   || null,
      postcode:      r.postcode || null,
      country:       r.country  || null,
    };
    setFields(prev => ({
      ...prev,
      address_line1: patch.address_line1 || "",
      address_line2: patch.address_line2 || "",
      town_city:     patch.town_city     || "",
      county:        patch.county        || "",
      postcode:      patch.postcode      || "",
      country:       patch.country       || "",
    }));
    const { error } = await supabase.from("customer").update(patch).eq("customer_id", customerId);
    if (error) {
      setSectionErr(prev => ({ ...prev, address: error.message || "Failed to save address." }));
      setAddrView("form");
    } else {
      setOriginal(prev => ({
        ...prev,
        address_line1: patch.address_line1 || "",
        address_line2: patch.address_line2 || "",
        town_city:     patch.town_city     || "",
        county:        patch.county        || "",
        postcode:      patch.postcode      || "",
        country:       patch.country       || "",
      }));
      setAddrView("display");
    }
  };

  // ── Delete dialog ─────────────────────────────────────────────────────────
  const openDeleteDialog = async () => {
    setDeleteError(null);
    setDeleteOpen(true);
    setSvcsLoading(true);

    const { data: jobRows } = await supabase
      .from("job").select("job_id").eq("customer_id", customerId);

    if (!jobRows?.length) { setCustomServices([]); setSvcsLoading(false); return; }

    const jobIds = jobRows.map(j => j.job_id);
    const { data: jqlRows } = await supabase
      .from("job_quote_link").select("quote_id").in("job_id", jobIds);

    if (!jqlRows?.length) { setCustomServices([]); setSvcsLoading(false); return; }

    const quoteIds = [...new Set(jqlRows.map(q => q.quote_id))];
    const { data: qslRows } = await supabase
      .from("quote_service_link").select("service_id").in("quote_id", quoteIds);

    if (!qslRows?.length) { setCustomServices([]); setSvcsLoading(false); return; }

    const serviceIds = [...new Set(qslRows.map(q => q.service_id))];
    const { data: svcRows } = await supabase
      .from("service").select("service_id, title")
      .in("service_id", serviceIds)
      .eq("service_type", "Custom");

    const svcs = svcRows ?? [];
    setCustomServices(svcs);
    setCheckedServices(new Set());
    setSvcsLoading(false);
  };

  const toggleService = id =>
    setCheckedServices(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allChecked = customServices.length > 0 && checkedServices.size === customServices.length;

  const toggleAll = () =>
    setCheckedServices(allChecked ? new Set() : new Set(customServices.map(s => s.service_id)));

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      // 1. Delete checked custom services
      if (checkedServices.size > 0) {
        const ids = [...checkedServices];
        await supabase.from("material_service_link").delete().in("service_id", ids);
        await supabase.from("quote_service_link").delete().in("service_id", ids);
        await supabase.from("service").delete().in("service_id", ids);
      }

      // 2. Resolve jobs → quotes
      const { data: jobRows } = await supabase
        .from("job").select("job_id").eq("customer_id", customerId);

      if (jobRows?.length) {
        const jobIds = jobRows.map(j => j.job_id);
        const { data: jqlRows } = await supabase
          .from("job_quote_link").select("quote_id").in("job_id", jobIds);

        if (jqlRows?.length) {
          const quoteIds = [...new Set(jqlRows.map(q => q.quote_id))];
          await supabase.from("quote_service_link").delete().in("quote_id", quoteIds);
          await supabase.from("job_quote_link").delete().in("job_id", jobIds);
          await supabase.from("quote").delete().in("quote_id", quoteIds);
        }

        await supabase.from("job").delete().in("job_id", jobIds);
      }

      // 3. Delete customer
      await supabase.from("customer").delete().eq("customer_id", customerId);
      navigate("/crm/clients");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete.");
      setDeleting(false);
    }
  };

  // ── Section footer ────────────────────────────────────────────────────────
  const SectionFooter = ({ section }) => (
    <>
      {sectionMsg[section] && (
        <p className="text-emerald-400 text-sm text-right mt-3">{sectionMsg[section]}</p>
      )}
      {sectionErr[section] && (
        <p className="text-red-400 text-sm text-right mt-3">{sectionErr[section]}</p>
      )}
      {isSectionDirty(section) && (
        <div className="flex justify-end gap-4 pt-4 border-t border-zinc-800 mt-4">
          <button
            onClick={() => cancelSection(section)}
            disabled={sectionSaving[section]}
            className="px-4 py-2 border border-zinc-600 rounded-xl text-white hover:bg-zinc-800 disabled:opacity-50 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => saveSection(section)}
            disabled={sectionSaving[section]}
            className="px-4 py-2 bg-sky-500 text-black rounded-xl font-bold hover:bg-sky-400 disabled:opacity-50 text-sm"
          >
            {sectionSaving[section] ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </>
  );

  if (loading) return <p className="text-zinc-400 text-sm">Loading…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Unnamed Client";

  return (
    <div className="space-y-6">

      {/* ── Contact ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer select-none" onClick={() => toggle("contact")}>
          <h2 className="text-2xl font-bold">Contact</h2>
          <span className="text-sky-400">{open.contact ? "▲" : "▼"}</span>
        </div>
        {open.contact && (
          <div className="border-t border-zinc-800 p-5 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm text-zinc-300 mb-2">First Name</h3>
                <input value={fields.first_name} onChange={e => handleChange("first_name", e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="John" />
              </div>
              <div>
                <h3 className="text-sm text-zinc-300 mb-2">Last Name</h3>
                <input value={fields.last_name} onChange={e => handleChange("last_name", e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Smith" />
              </div>
              <div>
                <h3 className="text-sm text-zinc-300 mb-2">Email</h3>
                <input type="email" value={fields.email} onChange={e => handleChange("email", e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="john@example.com" />
              </div>
              <div>
                <h3 className="text-sm text-zinc-300 mb-2">Phone</h3>
                <input value={fields.phone} onChange={e => handleChange("phone", e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="+44 7700 000000" />
              </div>
            </div>
            <SectionFooter section="contact" />
          </div>
        )}
      </div>

      {/* ── Address ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer select-none" onClick={() => toggle("address")}>
          <h2 className="text-2xl font-bold">Address</h2>
          <span className="text-sky-400">{open.address ? "▲" : "▼"}</span>
        </div>
        {open.address && (
          <div className="border-t border-zinc-800 p-5 space-y-4">

            {addrView === "display" && (
              <>
                <div className="bg-zinc-950 rounded-xl p-4 text-sm text-zinc-200 space-y-0.5">
                  {original.address_line1 && <p>{original.address_line1}</p>}
                  {original.address_line2 && <p>{original.address_line2}</p>}
                  {(original.town_city || original.postcode) && (
                    <p>{[original.town_city, original.postcode].filter(Boolean).join(", ")}</p>
                  )}
                  {original.county  && <p>{original.county}</p>}
                  {original.country && <p>{original.country}</p>}
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
                    setFields(prev => ({ ...prev, address_line1: "", address_line2: "", town_city: "", county: "", postcode: "", country: "" }));
                    setAddrView("form");
                  }}
                />
                {hasAddress(original) && (
                  <button onClick={() => setAddrView("display")} className="text-zinc-500 text-sm hover:underline">Cancel</button>
                )}
              </>
            )}

            {addrView === "form" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <h3 className="text-sm text-zinc-300 mb-2">Address Line 1</h3>
                    <input value={fields.address_line1} onChange={e => handleChange("address_line1", e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Address line 1" />
                  </div>
                  <div className="col-span-2">
                    <h3 className="text-sm text-zinc-300 mb-2">Address Line 2</h3>
                    <input value={fields.address_line2} onChange={e => handleChange("address_line2", e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Optional" />
                  </div>
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Town / City</h3>
                    <input value={fields.town_city} onChange={e => handleChange("town_city", e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Town / City" />
                  </div>
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">County</h3>
                    <input value={fields.county} onChange={e => handleChange("county", e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="County" />
                  </div>
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Postcode</h3>
                    <input value={fields.postcode} onChange={e => handleChange("postcode", e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Postcode" />
                  </div>
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Country</h3>
                    <input value={fields.country} onChange={e => handleChange("country", e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Country" />
                  </div>
                </div>
                <button onClick={() => setAddrView("lookup")} className="text-sky-400 text-sm hover:underline">
                  ← Back to search
                </button>
              </>
            )}

            {addrView === "form" && <SectionFooter section="address" />}
            {sectionErr.address && addrView !== "form" && (
              <p className="text-red-400 text-sm mt-2">{sectionErr.address}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Notes ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer select-none" onClick={() => toggle("notes")}>
          <h2 className="text-2xl font-bold">Notes</h2>
          <span className="text-sky-400">{open.notes ? "▲" : "▼"}</span>
        </div>
        {open.notes && (
          <div className="border-t border-zinc-800 p-5 space-y-4">
            <textarea
              value={fields.notes}
              onChange={e => handleChange("notes", e.target.value)}
              rows={5}
              className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm resize-none"
              placeholder="Any additional notes about this client…"
            />
            <SectionFooter section="notes" />
          </div>
        )}
      </div>

      {/* ── Legal ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer select-none" onClick={() => toggle("legal")}>
          <h2 className="text-2xl font-bold">Legal</h2>
          <span className="text-sky-400">{open.legal ? "▲" : "▼"}</span>
        </div>
        {open.legal && (
          <div className="border-t border-zinc-800 p-5">
            <p className="text-sm text-zinc-400 mb-4">
              Permanently remove this client and all associated data. This cannot be undone.
            </p>
            <button
              onClick={openDeleteDialog}
              className="px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-500 transition text-sm"
            >
              Delete Client
            </button>
          </div>
        )}
      </div>

      {/* ── Delete confirmation dialog ── */}
      {deleteOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-2xl">

            <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
              <h3 className="text-xl font-bold text-white">Delete {fullName}?</h3>
            </div>

            <div className="px-6 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: "60vh" }}>
              <p className="text-zinc-300 text-sm">
                This will permanently delete <span className="text-white font-semibold">{fullName}</span> along
                with all their linked <span className="text-white font-semibold">jobs and quotes</span>.
                Services and materials in your catalogue will <span className="text-white font-semibold">not</span> be
                affected — except for any Custom services you select below.
              </p>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-zinc-300">Custom services linked to this client's quotes</p>
                  {customServices.length > 0 && (
                    <button onClick={toggleAll} className="text-xs text-sky-400 hover:underline">
                      {allChecked ? "Uncheck all" : "Check all"}
                    </button>
                  )}
                </div>

                {svcsLoading ? (
                  <p className="text-zinc-400 text-sm">Loading…</p>
                ) : customServices.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No custom services found.</p>
                ) : (
                  <div className="rounded-xl border border-zinc-700 overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
                        <tr>
                          <th className="px-4 py-2 w-10">
                            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-sky-500" />
                          </th>
                          <th className="px-4 py-2">Service Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-700">
                        {customServices.map(s => (
                          <tr key={s.service_id} className="hover:bg-zinc-800 transition">
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={checkedServices.has(s.service_id)}
                                onChange={() => toggleService(s.service_id)}
                                className="accent-sky-500"
                              />
                            </td>
                            <td className="px-4 py-2 text-zinc-200">{s.title}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button
                onClick={() => { setDeleteOpen(false); setDeleteError(null); }}
                disabled={deleting}
                className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-500 transition text-sm disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
