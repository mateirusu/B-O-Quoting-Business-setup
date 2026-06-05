import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient";

const SECTION_KEYS = {
  details: ["title", "description", "status"],
};

const STATUS_OPTIONS = ["Draft", "Sent", "Accepted", "Rejected"];

export default function QuoteDetails() {
  const { quoteId } = useParams();
  const navigate    = useNavigate();

  const [quote,   setQuote]   = useState(null);
  const [job,     setJob]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const [fields,   setFields]   = useState({});
  const [original, setOriginal] = useState({});

  const [open, setOpen] = useState({ details: false, job: false, legal: false });

  const [sectionSaving, setSectionSaving] = useState({ details: false });
  const [sectionMsg,    setSectionMsg]    = useState({ details: null  });
  const [sectionErr,    setSectionErr]    = useState({ details: null  });

  const [deleteOpen,  setDeleteOpen]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: q, error: qe } = await supabase
      .from("quote")
      .select("quote_id, title, description, status, created_at")
      .eq("quote_id", quoteId)
      .single();
    if (qe || !q) { setError("Quote not found."); setLoading(false); return; }
    setQuote(q);
    const f = {
      title:       q.title       || "",
      description: q.description || "",
      status:      q.status      || "Draft",
    };
    setFields(f);
    setOriginal(f);

    const { data: link } = await supabase
      .from("job_quote_link")
      .select("job:job_id(job_id, title, town_city, postcode, customer:customer_id(customer_id, first_name, last_name))")
      .eq("quote_id", quoteId)
      .maybeSingle();
    setJob(link?.job || null);
    setLoading(false);
  }, [quoteId]);

  useEffect(() => { load(); }, [load]);

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
  };

  const saveSection = async section => {
    setSectionSaving(prev => ({ ...prev, [section]: true }));
    setSectionMsg(prev => ({ ...prev, [section]: null }));
    setSectionErr(prev => ({ ...prev, [section]: null }));
    try {
      const update = {};
      SECTION_KEYS[section].forEach(k => { update[k] = fields[k] || null; });
      const { error } = await supabase.from("quote").update(update).eq("quote_id", quoteId);
      if (error) throw error;
      setOriginal(prev => ({ ...prev, ...update }));
      setQuote(prev => ({ ...prev, ...update }));
      setSectionMsg(prev => ({ ...prev, [section]: "Saved successfully." }));
    } catch (err) {
      setSectionErr(prev => ({ ...prev, [section]: err.message || "Failed to save." }));
    } finally {
      setSectionSaving(prev => ({ ...prev, [section]: false }));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await supabase.from("quote_service_link").delete().eq("quote_id", quoteId);
      await supabase.from("job_quote_link").delete().eq("quote_id", quoteId);
      await supabase.from("quote").delete().eq("quote_id", quoteId);
      navigate("/crm");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete.");
      setDeleting(false);
    }
  };

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

  const clientName = job?.customer
    ? [job.customer.first_name, job.customer.last_name].filter(Boolean).join(" ") || "Unknown Client"
    : null;

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
              <h3 className="text-sm text-zinc-300 mb-2">Title</h3>
              <input value={fields.title} onChange={e => handleChange("title", e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Quote title" />
            </div>
            <div>
              <h3 className="text-sm text-zinc-300 mb-2">Description</h3>
              <textarea value={fields.description} onChange={e => handleChange("description", e.target.value)}
                rows={4} className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm resize-none"
                placeholder="Quote description…" />
            </div>
            <div>
              <h3 className="text-sm text-zinc-300 mb-2">Status</h3>
              <select value={fields.status} onChange={e => handleChange("status", e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm">
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <SectionFooter section="details" />
          </div>
        )}
      </div>

      {/* ── Job Details ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer select-none" onClick={() => toggle("job")}>
          <h2 className="text-2xl font-bold">Job Details</h2>
          <span className="text-sky-400">{open.job ? "▲" : "▼"}</span>
        </div>
        {open.job && (
          <div className="border-t border-zinc-800 p-5 space-y-4">
            {!job ? (
              <p className="text-zinc-400 text-sm">No job linked to this quote.</p>
            ) : (
              <>
                <div>
                  <h3 className="text-sm text-zinc-300 mb-2">Job</h3>
                  <div className="flex items-center gap-3">
                    <p className="flex-1 p-3 rounded-xl bg-zinc-950 text-zinc-200 text-sm">{job.title || "Untitled Job"}</p>
                    <button
                      onClick={() => navigate(`/crm/jobs/${job.job_id}`)}
                      className="px-3 py-2 text-xs rounded-lg bg-sky-500 text-black font-semibold hover:bg-sky-400 transition whitespace-nowrap"
                    >
                      View Job
                    </button>
                  </div>
                </div>
                {clientName && (
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Client</h3>
                    <div className="flex items-center gap-3">
                      <p className="flex-1 p-3 rounded-xl bg-zinc-950 text-zinc-200 text-sm">{clientName}</p>
                      <button
                        onClick={() => navigate(`/crm/clients/${job.customer.customer_id}`)}
                        className="px-3 py-2 text-xs rounded-lg bg-sky-500 text-black font-semibold hover:bg-sky-400 transition whitespace-nowrap"
                      >
                        View Client
                      </button>
                    </div>
                  </div>
                )}
                {(job.town_city || job.postcode) && (
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Job Location</h3>
                    <p className="p-3 rounded-xl bg-zinc-950 text-zinc-200 text-sm">
                      {[job.town_city, job.postcode].filter(Boolean).join(", ")}
                    </p>
                  </div>
                )}
              </>
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
              Permanently remove this quote and all its linked services. This cannot be undone.
            </p>
            <button onClick={() => setDeleteOpen(true)}
              className="px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-500 transition text-sm">
              Delete Quote
            </button>
          </div>
        )}
      </div>

      {/* ── Delete confirmation ── */}
      {deleteOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
              <h3 className="text-xl font-bold text-white">Delete this quote?</h3>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-zinc-300 text-sm">
                This will permanently delete <span className="text-white font-semibold">{quote.title || "this quote"}</span> along
                with all its linked <span className="text-white font-semibold">services</span>. This cannot be undone.
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
