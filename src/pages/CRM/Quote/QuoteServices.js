import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../supabaseClient";
import { sendQuote } from "../../../utils/quoteSend";
import ServiceQuoteLink from "./ServiceQuoteLink";
import ServiceForm from "../../Settings/Services/ServiceForm";
import MaterialServiceLink from "../../Settings/Services/MaterialServiceLink";

export default function QuoteServices() {
  const { quoteId } = useParams();
  const { profile } = useAuth();

  const [services,     setServices]     = useState([]);
  const [quoteStatus,  setQuoteStatus]  = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [modal,        setModal]        = useState(false);

  const [editServiceId,      setEditServiceId]      = useState(null);
  const [viewMaterialsId,    setViewMaterialsId]    = useState(null);
  const [convertCopyId,      setConvertCopyId]      = useState(null);
  const [convertError,   setConvertError]   = useState(null);
  const [converting,     setConverting]     = useState(null);
  const convertSavedRef = useRef(false);

  // Post-save send dialog
  const [sendDialog,    setSendDialog]    = useState(false);
  const [sending,       setSending]       = useState(false);
  const [sendError,     setSendError]     = useState(null);
  const [sentMsg,       setSentMsg]       = useState(null);
  const [draftWarning,  setDraftWarning]  = useState(false);

  const loadServices = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: quoteRow }] = await Promise.all([
      supabase
        .from("quote_service_link")
        .select("quote_service_link_id, quantity, task, service:service_id(service_id, title, service_type, hours)")
        .eq("quote_id", quoteId)
        .order("created_at"),
      supabase.from("quote").select("status").eq("quote_id", quoteId).single(),
    ]);
    if (error) { setError("Failed to load services."); setLoading(false); return; }
    setServices(data ?? []);
    setQuoteStatus(quoteRow?.status ?? null);
    setLoading(false);
  }, [quoteId]);

  useEffect(() => { loadServices(); }, [loadServices]);

  const STATUS_COLOURS = {
    Draft:    { bg: "rgba(113,113,122,0.15)", text: "#a1a1aa" },
    Sent:     { bg: "rgba(14,165,233,0.15)",  text: "#38bdf8" },
    Accepted: { bg: "rgba(52,211,153,0.15)",  text: "#34d399" },
    Declined: { bg: "rgba(248,113,113,0.15)", text: "#f87171" },
  };

  const svcTypeBadge = t => {
    if (t === "Reusable")         return { bg: "#064e3b", color: "#34d399" };
    if (t === "Custom")           return { bg: "#0c4a6e", color: "#38bdf8" };
    if (t === "Customer Request") return { bg: "#451a03", color: "#fbbf24" };
    return { bg: "#27272a", color: "#a1a1aa" };
  };

  const handleServicesSaved = (hasCustomerRequests = false) => {
    loadServices();
    setSendError(null);
    setSentMsg(null);
    if (hasCustomerRequests) {
      setDraftWarning(true);
    } else {
      setSendDialog(true);
    }
  };

  const handleSendQuote = async () => {
    setSending(true);
    setSendError(null);
    try {
      await sendQuote({ quoteId, profile, updateStatus: true });
      setSentMsg("Quote sent successfully and PDF emailed to the customer.");
      setSendDialog(false);
      loadServices();
    } catch (err) {
      setSendError(err.message || "Failed to send quote.");
    } finally {
      setSending(false);
    }
  };

  // Creates a Reusable copy of a service and opens it in the edit form.
  // If the user saves → copy stays in catalogue. If cancelled → copy is deleted.
  const handleConvertToReusable = async (svcRow) => {
    const svcId = svcRow.service?.service_id;
    if (!svcId) return;
    setConvertError(null);
    setConverting(svcId);

    const { data: svcData } = await supabase
      .from("service").select("*").eq("service_id", svcId).single();
    if (!svcData) { setConverting(null); return; }

    const { data: copy } = await supabase
      .from("service")
      .insert({
        title:           svcData.title,
        description:     svcData.description,
        hours:           svcData.hours,
        image_url:       svcData.image_url,
        business_id:     profile.business_id,
        service_type:    "Reusable",
        main_service:    true,
        main_service_id: null,
      })
      .select("service_id")
      .single();

    if (!copy) { setConverting(null); return; }

    const { data: mats } = await supabase
      .from("material_service_link")
      .select("material_id, quantity, sort_order")
      .eq("service_id", svcId);
    if (mats?.length) {
      await supabase.from("material_service_link").insert(
        mats.map(m => ({
          service_id:  copy.service_id,
          material_id: m.material_id,
          business_id: profile.business_id,
          quantity:    m.quantity,
          sort_order:  m.sort_order ?? 0,
        }))
      );
    }

    convertSavedRef.current = false;
    setConvertCopyId(copy.service_id);
    setEditServiceId(copy.service_id);
    setConverting(null);
  };

  if (loading) return <p className="text-zinc-400 text-sm">Loading…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-2xl font-bold text-white">Services</h2>
          {quoteStatus && (() => {
            const c = STATUS_COLOURS[quoteStatus] || STATUS_COLOURS.Draft;
            return (
              <span style={{
                display: "inline-block", padding: "3px 12px",
                borderRadius: "6px", fontSize: "13px", fontWeight: 600,
                background: c.bg, color: c.text, whiteSpace: "nowrap",
              }}>
                Quote Status: {quoteStatus}
              </span>
            );
          })()}
          {services.some(s => s.service?.service_type === "Customer Request") && (
            <span style={{ fontSize: "13px", color: "#fbbf24", fontWeight: 500, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "1px" }}>
              <span>⚠&nbsp; The customer has submitted service requests that require approval. To review and approve them use one of the options:</span>
              <span style={{ paddingLeft: "20px" }}>- Click <strong>Edit Services</strong> then use the <strong style={{ color: "#34d399" }}>Reusable</strong> or <strong style={{ color: "#38bdf8" }}>Custom</strong> buttons to classify and approve each service.</span>
              <span style={{ paddingLeft: "20px" }}>- Use the <strong>Edit</strong> button on each amber row.</span>
            </span>
          )}
        </div>
        {quoteStatus === "Draft" && (
          <button
            onClick={() => { setModal(true); setDraftWarning(false); }}
            className="px-4 py-2 bg-sky-500 text-black font-semibold rounded-xl hover:bg-sky-400 transition text-sm whitespace-nowrap"
          >
            Edit Services
          </button>
        )}
      </div>

      {convertError && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex justify-between items-start gap-3">
          <span>{convertError}</span>
          <button onClick={() => setConvertError(null)} style={{ flexShrink: 0, background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>×</button>
        </div>
      )}

      {draftWarning && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
          Services saved. This quote will remain in <strong>Draft</strong> until all customer requests have been reviewed and changed to Custom or Reusable.
        </div>
      )}

      {sentMsg && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
          {sentMsg}
        </div>
      )}

      {services.length === 0 ? (
        <p className="text-zinc-400 text-sm">No services linked to this quote yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3 w-32">Materials</th>
                <th className="px-4 py-3 w-28">Quantity</th>
                <th className="px-4 py-3 w-36">Type</th>
                <th className="px-4 py-3 w-64"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {services.map(s => {
                const svcType    = s.service?.service_type;
                const svcId      = s.service?.service_id;
                const canConvert = (svcType === "Custom" || svcType === "Customer Request") && quoteStatus !== "Draft";
                const isConverting = converting === svcId;
                return (
                  <tr key={s.quote_service_link_id} className="hover:bg-zinc-800 transition">
                    <td className="px-4 py-3 text-white font-medium">{s.service?.title || "—"}</td>
                    <td className="px-4 py-3 text-zinc-300">{s.task || "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewMaterialsId(svcId)}
                        className="px-3 py-1 text-xs rounded-lg font-semibold transition"
                        style={{ background: "rgba(14,165,233,0.15)", color: "#38bdf8", border: "1px solid rgba(14,165,233,0.3)" }}
                      >
                        View
                      </button>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{s.quantity}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const b = svcTypeBadge(svcType);
                        return (
                          <span style={{
                            display: "inline-block", padding: "3px 10px",
                            borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                            background: b.bg, color: b.color,
                          }}>
                            {svcType || "—"}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        {canConvert && (
                          <button
                            onClick={() => handleConvertToReusable(s)}
                            disabled={isConverting}
                            className="px-3 py-1 text-xs rounded-lg font-semibold transition disabled:opacity-50"
                            style={{ background: "#34d399", color: "#000" }}
                          >
                            {isConverting ? "Copying…" : "Convert to Reusable Template"}
                          </button>
                        )}
                        {quoteStatus === "Draft" && (
                          <button
                            onClick={() => { setConvertError(null); setEditServiceId(svcId); }}
                            className="px-3 py-1 text-xs bg-sky-500 text-black rounded-lg font-semibold hover:bg-sky-400 transition"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Row edit / convert modal ── */}
      {editServiceId && (
        <ServiceForm
          serviceId={editServiceId}
          profile={profile}
          hideDelete={true}
          onClose={async () => {
            if (convertCopyId && !convertSavedRef.current) {
              await supabase.from("material_service_link").delete().eq("service_id", convertCopyId);
              await supabase.from("service").delete().eq("service_id", convertCopyId);
            }
            setConvertCopyId(null);
            setEditServiceId(null);
          }}
          onSaved={() => {
            convertSavedRef.current = true;
            setConvertCopyId(null);
            setEditServiceId(null);
            loadServices();
          }}
        />
      )}

      {viewMaterialsId && (
        <MaterialServiceLink
          isOpen={true}
          serviceId={viewMaterialsId}
          profile={profile}
          onClose={() => setViewMaterialsId(null)}
          readOnly={true}
        />
      )}

      <ServiceQuoteLink
        isOpen={modal}
        onClose={() => setModal(false)}
        profile={profile}
        quoteId={quoteId}
        onSave={handleServicesSaved}
      />

      {/* ── Post-save dialog: Send / Save as Draft ── */}
      {sendDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl p-8 space-y-5" style={{ width: "100%", maxWidth: "460px" }}>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-white mb-1">Services saved</h3>
              <p className="text-zinc-400 text-sm">Would you like to send the quote to the customer now?</p>
            </div>

            {sendError && (
              <p className="text-red-400 text-sm">{sendError}</p>
            )}

            <div className="space-y-3 flex flex-col items-center">
              <button
                onClick={handleSendQuote}
                disabled={sending}
                className="px-5 py-3 rounded-xl bg-sky-500 text-black font-semibold hover:bg-sky-400 transition disabled:opacity-50"
                style={{ width: "35%" }}
              >
                {sending ? "Sending…" : "Send Quote"}
              </button>
              <button
                onClick={() => setSendDialog(false)}
                disabled={sending}
                className="px-5 py-3 rounded-xl bg-zinc-800 text-white font-semibold hover:bg-zinc-700 transition disabled:opacity-50"
                style={{ width: "35%" }}
              >
                Save as Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
