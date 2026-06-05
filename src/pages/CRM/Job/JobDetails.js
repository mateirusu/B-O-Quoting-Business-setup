import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import AddressLookup from "../../../components/AddressLookup";

const SECTION_KEYS = {
  details: ["title", "description"],
  address: ["address_line1", "address_line2", "town_city", "county", "postcode", "country"],
};

const hasAddress = f => !!(f.address_line1 || f.postcode);

export default function JobDetails() {
  const { jobId }  = useParams();
  const navigate   = useNavigate();

  const [job,     setJob]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const [fields,   setFields]   = useState({});
  const [original, setOriginal] = useState({});

  const [open, setOpen] = useState({ details: false, address: false, legal: false });

  const [sectionSaving, setSectionSaving] = useState({ details: false, address: false });
  const [sectionMsg,    setSectionMsg]    = useState({ details: null,  address: null  });
  const [sectionErr,    setSectionErr]    = useState({ details: null,  address: null  });

  const [addrView, setAddrView] = useState("display");

  const [deleteOpen,  setDeleteOpen]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job")
      .select("*, customer:customer_id(customer_id, first_name, last_name)")
      .eq("job_id", jobId)
      .single();
    if (error || !data) { setError("Job not found."); setLoading(false); return; }
    setJob(data);
    const f = {
      title:         data.title         || "",
      description:   data.description   || "",
      address_line1: data.address_line1 || "",
      address_line2: data.address_line2 || "",
      town_city:     data.town_city     || "",
      county:        data.county        || "",
      postcode:      data.postcode      || "",
      country:       data.country       || "",
    };
    setFields(f);
    setOriginal(f);
    setAddrView(hasAddress(f) ? "display" : "lookup");
    setLoading(false);
  }, [jobId]);

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
      const { error } = await supabase.from("job").update(update).eq("job_id", jobId);
      if (error) throw error;
      setOriginal(prev => ({ ...prev, ...update }));
      setJob(prev => ({ ...prev, ...update }));
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
    const { error } = await supabase.from("job").update(patch).eq("job_id", jobId);
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

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: jqlRows } = await supabase
        .from("job_quote_link").select("quote_id").eq("job_id", jobId);
      if (jqlRows?.length) {
        const quoteIds = jqlRows.map(q => q.quote_id);
        await supabase.from("quote_service_link").delete().in("quote_id", quoteIds);
        await supabase.from("job_quote_link").delete().eq("job_id", jobId);
        await supabase.from("quote").delete().in("quote_id", quoteIds);
      }
      await supabase.from("job").delete().eq("job_id", jobId);
      navigate("/crm");
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
          <button onClick={() => cancelSection(section)} disabled={sectionSaving[section]}
            className="px-4 py-2 border border-zinc-600 rounded-xl text-white hover:bg-zinc-800 disabled:opacity-50 text-sm">
            Cancel
          </button>
          <button onClick={() => saveSection(section)} disabled={sectionSaving[section]}
            className="px-4 py-2 bg-sky-500 text-black rounded-xl font-bold hover:bg-sky-400 disabled:opacity-50 text-sm">
            {sectionSaving[section] ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </>
  );

  if (loading) return <p className="text-zinc-400 text-sm">Loading…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  const clientName = [job.customer?.first_name, job.customer?.last_name].filter(Boolean).join(" ") || "Unknown Client";

  return (
    <div className="space-y-6">

      {/* ── Details ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer select-none" onClick={() => toggle("details")}>
          <h2 className="text-2xl font-bold">Details</h2>
          <span className="text-sky-400">{open.details ? "▲" : "▼"}</span>
        </div>
        {open.details && (
          <div className="border-t border-zinc-800 p-5 space-y-4">
            <div>
              <h3 className="text-sm text-zinc-300 mb-2">Client</h3>
              <div className="flex items-center gap-3">
                <p className="flex-1 p-3 rounded-xl bg-zinc-950 text-zinc-400 text-sm">{clientName}</p>
                <button
                  onClick={() => navigate(`/crm/clients/${job.customer_id}`)}
                  className="px-3 py-2 text-xs rounded-lg bg-sky-500 text-black font-semibold hover:bg-sky-400 transition whitespace-nowrap"
                >
                  View Client
                </button>
              </div>
            </div>
            <div>
              <h3 className="text-sm text-zinc-300 mb-2">Title</h3>
              <input value={fields.title} onChange={e => handleChange("title", e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Job title" />
            </div>
            <div>
              <h3 className="text-sm text-zinc-300 mb-2">Description</h3>
              <textarea value={fields.description} onChange={e => handleChange("description", e.target.value)}
                rows={4} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm resize-none"
                placeholder="Job description…" />
            </div>
            <SectionFooter section="details" />
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
                      className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Address line 2" />
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

      {/* ── Legal ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer select-none" onClick={() => toggle("legal")}>
          <h2 className="text-2xl font-bold">Legal</h2>
          <span className="text-sky-400">{open.legal ? "▲" : "▼"}</span>
        </div>
        {open.legal && (
          <div className="border-t border-zinc-800 p-5">
            <p className="text-sm text-zinc-400 mb-4">
              Permanently remove this job and all its associated quotes. This cannot be undone.
            </p>
            <button onClick={() => setDeleteOpen(true)}
              className="px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-500 transition text-sm">
              Delete Job
            </button>
          </div>
        )}
      </div>

      {/* ── Delete confirmation ── */}
      {deleteOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
              <h3 className="text-xl font-bold text-white">Delete this job?</h3>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-zinc-300 text-sm">
                This will permanently delete <span className="text-white font-semibold">{job.title}</span> along
                with all its linked <span className="text-white font-semibold">quotes</span>. This cannot be undone.
              </p>
              {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={() => { setDeleteOpen(false); setDeleteError(null); }} disabled={deleting}
                className="px-5 py-2 rounded-xl border border-zinc-600 text-white hover:bg-zinc-800 transition text-sm disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-5 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-500 transition text-sm disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
