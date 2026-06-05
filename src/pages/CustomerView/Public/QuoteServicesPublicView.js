import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { supabase } from "../../../supabaseClient";

const STATUS_COLOURS = {
  Draft:    { bg: "#3f3f46", text: "#a1a1aa" },
  Sent:     { bg: "#0c4a6e", text: "#38bdf8" },
  Accepted: { bg: "#064e3b", text: "#34d399" },
  Rejected: { bg: "#450a0a", text: "#f87171" },
};

function fmt(d) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function addDays(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return fmt(dt.toISOString());
}

function fmtRef(n) {
  return n != null ? String(n).padStart(4, "0") : "—";
}

function fmtDateObj(dateObj) {
  if (!dateObj) return null;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return `${days[dateObj.getDay()]} ${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

const newSlot = () => ({ id: crypto.randomUUID(), date: null, from: "", to: "" });

export default function QuoteServicesPublicView() {
  const { publicToken } = useParams();
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  // Accept / decline flow
  const [action,        setAction]        = useState(null); // "accept" | "decline" | null
  const [customerNotes, setCustomerNotes] = useState("");
  const [timeslots,     setTimeslots]     = useState([newSlot()]);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [submitError,   setSubmitError]   = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: result, error: e } = await supabase.functions.invoke(
          "get-public-quote",
          { body: { public_token: publicToken } }
        );
        if (e || result?.error) throw new Error(result?.error || e?.message || "Failed to load quote");
        setData(result);
      } catch (err) {
        setError(err.message || "Quote not found.");
      } finally {
        setLoading(false);
      }
    })();
  }, [publicToken]);

  const addSlot    = () => setTimeslots(prev => [...prev, newSlot()]);
  const removeSlot = (id) => setTimeslots(prev => prev.filter(s => s.id !== id));
  const updateSlot = (id, field, val) =>
    setTimeslots(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));

  const buildNotes = () => {
    if (action === "accept") {
      let text = "Customer accepted the quote via the online portal.";
      if (customerNotes.trim()) text += `\n\nSpecial requests:\n${customerNotes.trim()}`;
      const valid = timeslots.filter(s => s.date);
      if (valid.length) {
        text += "\n\nPreferred availability:\n" +
          valid.map(s => {
            const d = fmtDateObj(s.date);
            if (s.from && s.to) return `• ${d}: ${s.from} – ${s.to}`;
            if (s.from)         return `• ${d}: from ${s.from}`;
            return `• ${d}`;
          }).join("\n");
      }
      return text;
    } else {
      let text = "Customer declined the quote via the online portal.";
      if (customerNotes.trim()) text += `\n\nReason provided:\n${customerNotes.trim()}`;
      return text;
    }
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const status = action === "accept" ? "Accepted" : "Rejected";
      const notes  = buildNotes();
      const { data: result, error: e } = await supabase.functions.invoke(
        "update-public-quote",
        { body: { public_token: publicToken, status, notes } }
      );
      if (e || result?.error) throw new Error(result?.error || e?.message || "Failed to submit");
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const switchAction = (a) => {
    setAction(a);
    setCustomerNotes("");
    setSubmitError(null);
    setTimeslots([newSlot()]);
  };

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#6b7280", fontSize: "14px" }}>Loading quote…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#ef4444", fontSize: "14px", marginBottom: "8px" }}>{error}</p>
          <p style={{ color: "#9ca3af", fontSize: "13px" }}>Please contact us if you believe this is an error.</p>
        </div>
      </div>
    );
  }

  const { quote, services, business } = data;
  const sc = STATUS_COLOURS[quote.status] || STATUS_COLOURS.Draft;

  const isSent     = quote.status === "Sent";
  const isResolved = quote.status === "Accepted" || quote.status === "Rejected";

  const card = {
    background: "#fff", borderRadius: "12px",
    border: "1px solid #e5e7eb", marginBottom: "24px",
  };

  const inputStyle = {
    padding: "8px 10px", borderRadius: "8px", border: "1px solid #e5e7eb",
    fontSize: "14px", fontFamily: "inherit", outline: "none",
    colorScheme: "light", boxSizing: "border-box",
  };

  const textareaStyle = {
    ...inputStyle, width: "100%", resize: "vertical",
    padding: "10px 12px", lineHeight: 1.5, display: "block",
  };

  return (
    <>
      {/* react-datepicker calendar z-index fix */}
      <style>{`.react-datepicker-popper { z-index: 9999 !important; }`}</style>

      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, -apple-system, sans-serif", color: "#111827" }}>

        {/* ── Business header ── */}
        <div style={{ background: "#0369a1", padding: "20px 40px" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ color: "#fff", fontSize: "20px", fontWeight: 700, margin: 0 }}>
                {business?.business_name || "Quotation"}
              </p>
              {(business?.phone || business?.email) && (
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px", margin: "4px 0 0" }}>
                  {[business.phone, business.email].filter(Boolean).join("  ·  ")}
                </p>
              )}
            </div>
            <div>
              <span style={{
                display: "inline-block", padding: "4px 14px",
                borderRadius: "999px", fontSize: "12px", fontWeight: 600,
                background: sc.bg, color: sc.text,
                border: "1px solid rgba(255,255,255,0.2)",
              }}>
                {quote.status}
              </span>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: "760px", margin: "0 auto", padding: "40px 24px" }}>

          {/* ── Quote meta ── */}
          <div style={{ ...card, padding: "28px 32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <p style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px" }}>{quote.title}</p>
                {quote.description && (
                  <p style={{ color: "#374151", fontSize: "14px", margin: 0, lineHeight: 1.6 }}>
                    {quote.description}
                  </p>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 4px" }}>
                  Reference: <strong style={{ color: "#111827" }}>#{fmtRef(quote.quote_number)}</strong>
                </p>
                <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 4px" }}>
                  Date: <strong style={{ color: "#111827" }}>{fmt(quote.created_at)}</strong>
                </p>
                <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>
                  Valid until: <strong style={{ color: "#111827" }}>{addDays(quote.created_at, 30)}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* ── Services ── */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #f3f4f6" }}>
              <p style={{ fontWeight: 700, fontSize: "16px", margin: 0 }}>Scope of Works</p>
            </div>
            {services.length === 0 ? (
              <p style={{ padding: "24px", color: "#9ca3af", fontSize: "14px" }}>No services listed.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ padding: "10px 24px", textAlign: "left", fontSize: "12px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Service</th>
                    <th style={{ padding: "10px 24px", textAlign: "left", fontSize: "12px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</th>
                    <th style={{ padding: "10px 24px", textAlign: "right", fontSize: "12px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", width: "80px" }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((sv, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "14px 24px", fontWeight: 600 }}>{sv.service?.title || "—"}</td>
                      <td style={{ padding: "14px 24px", color: "#6b7280" }}>{sv.task || "—"}</td>
                      <td style={{ padding: "14px 24px", textAlign: "right" }}>{sv.quantity ?? 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Notes ── */}
          <div style={{ ...card, padding: "24px 28px" }}>
            <p style={{ fontWeight: 700, fontSize: "14px", marginBottom: "10px", marginTop: 0 }}>Notes</p>
            <p style={{ color: "#6b7280", fontSize: "13px", lineHeight: 1.6, marginBottom: "6px", marginTop: 0 }}>
              Where applicable, a full works certificate will be issued once the invoice has been paid in full.
            </p>
            <p style={{ color: "#6b7280", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
              Where applicable, we will require a deposit of 50% of the quotation value, once the quotation has been accepted.
            </p>
          </div>

          {/* ── Already resolved banner ── */}
          {isResolved && !submitted && (
            <div style={{
              ...card,
              padding: "24px 28px",
              background: quote.status === "Accepted" ? "#f0fdf4" : "#fef2f2",
              borderColor: quote.status === "Accepted" ? "#bbf7d0" : "#fecaca",
            }}>
              <p style={{
                fontWeight: 700, fontSize: "15px", margin: "0 0 6px",
                color: quote.status === "Accepted" ? "#15803d" : "#b91c1c",
              }}>
                {quote.status === "Accepted" ? "Quote accepted" : "Quote declined"}
              </p>
              <p style={{ color: quote.status === "Accepted" ? "#166534" : "#991b1b", fontSize: "13px", margin: 0 }}>
                {quote.status === "Accepted"
                  ? "You have already accepted this quote. We will be in touch shortly."
                  : "You have already declined this quote. Please contact us if you've changed your mind."}
              </p>
            </div>
          )}

          {/* ── Accept / Decline section ── */}
          {isSent && !submitted && (
            <div style={{ ...card, padding: "28px 32px" }}>
              <p style={{ fontWeight: 700, fontSize: "16px", margin: "0 0 16px" }}>Respond to this quote</p>

              {/* Toggle buttons */}
              <div style={{ display: "flex", gap: "12px", marginBottom: action ? "24px" : "0" }}>
                <button
                  onClick={() => switchAction("accept")}
                  style={{
                    flex: 1, padding: "12px 20px", borderRadius: "10px",
                    fontWeight: 700, fontSize: "14px", cursor: "pointer",
                    border: "2px solid", transition: "all 0.15s",
                    background: action === "accept" ? "#f0fdf4" : "#fff",
                    borderColor: action === "accept" ? "#22c55e" : "#e5e7eb",
                    color: action === "accept" ? "#15803d" : "#374151",
                  }}
                >
                  ✓ Accept Quote
                </button>
                <button
                  onClick={() => switchAction("decline")}
                  style={{
                    flex: 1, padding: "12px 20px", borderRadius: "10px",
                    fontWeight: 700, fontSize: "14px", cursor: "pointer",
                    border: "2px solid", transition: "all 0.15s",
                    background: action === "decline" ? "#fef2f2" : "#fff",
                    borderColor: action === "decline" ? "#ef4444" : "#e5e7eb",
                    color: action === "decline" ? "#b91c1c" : "#374151",
                  }}
                >
                  ✕ Decline Quote
                </button>
              </div>

              {/* ── Accept form ── */}
              {action === "accept" && (
                <>
                  {/* Special requests */}
                  <div style={{ marginBottom: "22px" }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>
                      Special requests{" "}
                      <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      value={customerNotes}
                      onChange={e => setCustomerNotes(e.target.value)}
                      placeholder="Any special instructions or requirements…"
                      rows={3}
                      style={textareaStyle}
                    />
                  </div>

                  {/* Availability table */}
                  <div style={{ marginBottom: "22px" }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "10px" }}>
                      Preferred dates & times{" "}
                      <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 38px", gap: "8px", marginBottom: "6px" }}>
                      <p style={{ margin: 0, fontSize: "12px", color: "#6b7280", fontWeight: 600 }}>Date</p>
                      <p style={{ margin: 0, fontSize: "12px", color: "#6b7280", fontWeight: 600 }}>From</p>
                      <p style={{ margin: 0, fontSize: "12px", color: "#6b7280", fontWeight: 600 }}>To</p>
                      <span />
                    </div>

                    {timeslots.map(slot => (
                      <div
                        key={slot.id}
                        style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 38px", gap: "8px", marginBottom: "8px", alignItems: "center" }}
                      >
                        <DatePicker
                          selected={slot.date}
                          onChange={date => updateSlot(slot.id, "date", date)}
                          dateFormat="dd/MM/yyyy"
                          placeholderText="Select date"
                          minDate={new Date()}
                          customInput={
                            <input style={{ ...inputStyle, width: "100%", cursor: "pointer" }} readOnly />
                          }
                          popperPlacement="bottom-start"
                        />
                        <input
                          type="time"
                          value={slot.from}
                          onChange={e => updateSlot(slot.id, "from", e.target.value)}
                          style={{ ...inputStyle, width: "100%" }}
                        />
                        <input
                          type="time"
                          value={slot.to}
                          onChange={e => updateSlot(slot.id, "to", e.target.value)}
                          style={{ ...inputStyle, width: "100%" }}
                        />
                        <button
                          onClick={() => removeSlot(slot.id)}
                          disabled={timeslots.length === 1}
                          style={{
                            width: "38px", height: "38px", borderRadius: "8px",
                            border: "1px solid #fee2e2", background: "#fef2f2",
                            color: "#ef4444", cursor: timeslots.length === 1 ? "not-allowed" : "pointer",
                            opacity: timeslots.length === 1 ? 0.4 : 1, fontSize: "16px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={addSlot}
                      style={{
                        marginTop: "4px", padding: "6px 14px", borderRadius: "8px",
                        border: "1px solid #e5e7eb", background: "#f9fafb",
                        fontSize: "13px", cursor: "pointer", color: "#374151",
                      }}
                    >
                      + Add Date
                    </button>
                  </div>

                  {submitError && (
                    <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{submitError}</p>
                  )}

                  <button
                    onClick={handleConfirm}
                    disabled={submitting}
                    style={{
                      width: "100%", padding: "14px", borderRadius: "10px",
                      background: submitting ? "#86efac" : "#22c55e",
                      color: "#fff", fontWeight: 700, fontSize: "15px",
                      border: "none", cursor: submitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {submitting ? "Confirming…" : "Confirm Acceptance"}
                  </button>
                </>
              )}

              {/* ── Decline form ── */}
              {action === "decline" && (
                <>
                  <div style={{ marginBottom: "22px" }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>
                      Would you like to share a reason?{" "}
                      <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      value={customerNotes}
                      onChange={e => setCustomerNotes(e.target.value)}
                      placeholder="Please let us know why you're declining this quote…"
                      rows={3}
                      style={textareaStyle}
                    />
                  </div>

                  {submitError && (
                    <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{submitError}</p>
                  )}

                  <button
                    onClick={handleConfirm}
                    disabled={submitting}
                    style={{
                      width: "100%", padding: "14px", borderRadius: "10px",
                      background: submitting ? "#fca5a5" : "#ef4444",
                      color: "#fff", fontWeight: 700, fontSize: "15px",
                      border: "none", cursor: submitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {submitting ? "Confirming…" : "Confirm Decline"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Post-submit confirmation ── */}
          {submitted && (
            <div style={{
              ...card,
              padding: "32px",
              textAlign: "center",
              background: action === "accept" ? "#f0fdf4" : "#fef2f2",
              borderColor: action === "accept" ? "#bbf7d0" : "#fecaca",
            }}>
              <p style={{ fontSize: "32px", margin: "0 0 8px" }}>
                {action === "accept" ? "✓" : "✕"}
              </p>
              <p style={{
                fontWeight: 700, fontSize: "18px", margin: "0 0 8px",
                color: action === "accept" ? "#15803d" : "#b91c1c",
              }}>
                {action === "accept" ? "Quote Accepted" : "Quote Declined"}
              </p>
              <p style={{ fontSize: "14px", margin: 0, color: action === "accept" ? "#166534" : "#991b1b" }}>
                {action === "accept"
                  ? "Thank you! We've received your acceptance and will be in touch shortly to arrange a convenient start date."
                  : "Thank you for your response. We've noted your decision. Please don't hesitate to contact us if you change your mind."}
              </p>
            </div>
          )}

          {/* ── Contact footer ── */}
          {(business?.email || business?.phone) && (
            <div style={{ textAlign: "center", padding: "24px" }}>
              <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "6px" }}>
                {isSent && !submitted
                  ? "You can also accept or discuss this quote by getting in touch:"
                  : "For any questions, please get in touch:"}
              </p>
              <p style={{ fontWeight: 600, color: "#0369a1", fontSize: "14px" }}>
                {[business.email, business.phone].filter(Boolean).join("  ·  ")}
              </p>
              {business.website && (
                <p style={{ color: "#9ca3af", fontSize: "13px", marginTop: "4px" }}>{business.website}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
