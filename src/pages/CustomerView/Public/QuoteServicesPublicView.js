import { useEffect, useLayoutEffect, useState, useRef, useCallback, forwardRef } from "react";
import { useParams } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { supabase } from "../../../supabaseClient";
import CustomerQuoteServiceLinkPublicView from "./CustomerQuoteServiceLinkPublicView";

const STATUS_COLOURS = {
  Draft:    { bg: "rgba(113,113,122,0.2)", text: "#a1a1aa" },
  Sent:     { bg: "rgba(14,165,233,0.2)",  text: "#38bdf8" },
  Accepted: { bg: "rgba(52,211,153,0.2)",  text: "#34d399" },
  Declined: { bg: "rgba(248,113,113,0.2)", text: "#f87171" },
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

const newSlot = () => ({
  id: crypto.randomUUID(),
  date: null, fromH: "", fromM: "", toH: "", toM: "",
  rangeEnabled: false, endDate: null,
});

function formatMasked(digits) {
  const tpl = ["-","-","/","-","-","/","-","-","-","-"];
  let di = 0;
  return tpl.map(ch => ch === "/" ? "/" : di < digits.length ? digits[di++] : "-").join("");
}

function cursorPos(n) {
  if (n <= 1) return n;
  if (n <= 3) return n + 1;
  return n + 2;
}

function maskedCursorToDigitIdx(p) {
  if (p <= 2) return p;
  if (p === 3) return 2;
  if (p <= 5) return p - 1;
  if (p === 6) return 4;
  return p - 2;
}

function slotHasError(slot) {
  if (!slot.rangeEnabled) {
    if (!slot.fromH || !slot.toH) return false;
    const fromMins = parseInt(slot.fromH, 10) * 60 + parseInt(slot.fromM || "0", 10);
    const toMins   = parseInt(slot.toH,   10) * 60 + parseInt(slot.toM   || "0", 10);
    return fromMins >= toMins;
  } else {
    if (!slot.date || !slot.endDate || !slot.fromH || !slot.toH) return false;
    const start = new Date(slot.date);
    start.setHours(parseInt(slot.fromH, 10), parseInt(slot.fromM || "0", 10), 0, 0);
    const end = new Date(slot.endDate);
    end.setHours(parseInt(slot.toH, 10), parseInt(slot.toM || "0", 10), 0, 0);
    return start >= end;
  }
}

const DateMaskInput = forwardRef(({ value, onClick, onChange, onDateChange, forceInvalid }, ref) => {
  const [digits, setDigits] = useState("");
  const isTyping    = useRef(false);
  const inputRef    = useRef(null);
  const wantCursor  = useRef(null);

  const setRef = useCallback((el) => {
    inputRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  }, [ref]);

  useLayoutEffect(() => {
    if (wantCursor.current !== null && inputRef.current) {
      const pos = wantCursor.current;
      wantCursor.current = null;
      inputRef.current.setSelectionRange(pos, pos);
    }
  });

  useEffect(() => {
    if (isTyping.current) { isTyping.current = false; return; }
    setDigits(value ? value.replace(/\D/g, "").slice(0, 8) : "");
  }, [value]);

  const commitStr = (nd, newDigitIdx) => {
    isTyping.current = true;
    wantCursor.current = cursorPos(newDigitIdx);
    setDigits(nd);
    onChange({ target: { value: nd.length > 0 ? formatMasked(nd) : "" } });
    if (nd.length === 8) {
      const date = new Date(`${nd.slice(4, 8)}-${nd.slice(2, 4)}-${nd.slice(0, 2)}`);
      onDateChange(isNaN(date.getTime()) ? null : date);
    } else {
      onDateChange(null);
    }
  };

  const handleKeyDown = (e) => {
    const el = inputRef.current;
    if (!el) return;
    const p  = el.selectionStart ?? digits.length;
    const di = maskedCursorToDigitIdx(p);

    if (e.key === "Backspace") {
      e.preventDefault();
      if (di === 0) return;
      commitStr(digits.slice(0, di - 1) + digits.slice(di), di - 1);
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      if (di >= digits.length) return;
      commitStr(digits.slice(0, di) + digits.slice(di + 1), di);
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const nd = (digits.slice(0, di) + e.key + digits.slice(di)).slice(0, 8);
      commitStr(nd, di + 1);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    const di1 = maskedCursorToDigitIdx(el.selectionStart ?? 0);
    const di2 = maskedCursorToDigitIdx(el.selectionEnd ?? el.selectionStart ?? 0);
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    const nd = (digits.slice(0, di1) + pasted + digits.slice(di2)).slice(0, 8);
    commitStr(nd, Math.min(di1 + pasted.length, 8));
  };

  let border = "1px solid rgba(255,255,255,0.09)";
  let bg = "rgba(2,6,15,0.8)";
  let errorMsg = null;

  if (digits.length === 8) {
    const d = parseInt(digits.slice(0, 2), 10);
    const m = parseInt(digits.slice(2, 4), 10);
    const yyyy = digits.slice(4, 8);
    const date = new Date(`${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(date.getTime()) || d < 1 || d > 31 || m < 1 || m > 12) {
      bg = "rgba(248,113,113,0.12)"; border = "1px solid #f87171"; errorMsg = "Invalid date";
    } else if (date < today) {
      bg = "rgba(248,113,113,0.12)"; border = "1px solid #f87171"; errorMsg = "Date can't be in the past";
    } else {
      bg = "rgba(52,211,153,0.12)"; border = "1px solid #34d399";
    }
  }

  if (forceInvalid) { bg = "rgba(248,113,113,0.12)"; border = "1px solid #f87171"; errorMsg = null; }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          ref={setRef}
          type="text"
          inputMode="numeric"
          value={formatMasked(digits)}
          onChange={() => {}}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "8px 34px 8px 10px",
            borderRadius: "6px", border,
            background: bg, color: "#f4f4f5",
            fontSize: "14px", fontFamily: "inherit", outline: "none",
          }}
        />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onClick(); }}
          tabIndex={-1}
          style={{
            position: "absolute", right: "8px",
            background: "none", border: "none",
            cursor: "pointer", padding: 0, color: "#71717a",
            display: "flex", alignItems: "center",
          }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      {errorMsg && (
        <p style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0,
          fontSize: "11px", color: "#f87171", margin: 0, whiteSpace: "nowrap", zIndex: 10,
        }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
});

const timefieldBase = (invalid, valid) => ({
  padding: "7px 4px", borderRadius: "6px", fontSize: "14px", fontFamily: "inherit",
  boxSizing: "border-box", textAlign: "center",
  background: invalid ? "rgba(248,113,113,0.12)" : valid ? "rgba(52,211,153,0.12)" : "rgba(2,6,15,0.8)",
  border:     `1px solid ${invalid ? "#f87171" : valid ? "#34d399" : "rgba(255,255,255,0.09)"}`,
  color: "#f4f4f5",
});
const dropdownList = {
  position: "absolute", top: "calc(100% + 2px)", left: 0,
  background: "#0e1729", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "6px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.5)", zIndex: 9999, overflow: "auto",
};
const dropdownItem = (active) => ({
  padding: "6px 10px", cursor: "pointer", fontSize: "14px", textAlign: "center",
  background: active ? "rgba(14,165,233,0.15)" : "#0e1729",
  color: active ? "#38bdf8" : "#f4f4f5",
});

// ── Multi-date inline calendar ─────────────────────────────────────────────────
function MultiCalendar({ selectedDates, onToggle }) {
  const [view, setView] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const y = view.getFullYear();
  const m = view.getMonth();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const firstDow  = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInM   = new Date(y, m + 1, 0).getDate();
  const isSel     = (d) => selectedDates.some(s => s.toDateString() === d.toDateString());
  const isDisabled = (d) => d < today;
  const isToday   = (d) => d.toDateString() === today.toDateString();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInM; d++) cells.push(new Date(y, m, d));

  const monthLabel = view.toLocaleString("en-GB", { month: "long", year: "numeric" });

  const navBtn = (dir, label) => (
    <button type="button" onClick={() => setView(new Date(y, m + dir, 1))}
      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#a1a1aa", padding: "2px 8px", borderRadius: "6px" }}>
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        {navBtn(-1, "‹")}
        <span style={{ fontWeight: 700, fontSize: "14px", color: "#f4f4f5" }}>{monthLabel}</span>
        {navBtn(1, "›")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: "11px", fontWeight: 600, color: "#71717a", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`_${i}`} />;
          const disabled = isDisabled(date);
          const selected = isSel(date);
          const todayDay = isToday(date);
          return (
            <div key={date.toISOString()} onClick={() => !disabled && onToggle(date)}
              style={{
                textAlign: "center", padding: "7px 2px", borderRadius: "6px", fontSize: "13px",
                lineHeight: 1, cursor: disabled ? "default" : "pointer",
                background: selected ? "#0ea5e9" : "transparent",
                color: disabled ? "#52525b" : selected ? "#fff" : "#f4f4f5",
                fontWeight: selected || todayDay ? 700 : 400,
                outline: todayDay && !selected ? "2px solid rgba(255,255,255,0.09)" : "none",
                outlineOffset: "-2px",
              }}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Hour picker ────────────────────────────────────────────────────────────────
function HourSelect({ value, onChange, invalid, valid }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ position: "relative", width: "58px", flexShrink: 0 }}
      tabIndex={0}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
    >
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          ...timefieldBase(invalid, valid), width: "100%", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
        }}
      >
        <span>{value || "--"}</span>
        <span style={{ fontSize: "9px", color: "#71717a", lineHeight: 1, flexShrink: 0 }}>▾</span>
      </div>
      {open && (
        <div style={{ ...dropdownList, maxHeight: "160px", minWidth: "58px" }}>
          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(h => (
            <div key={h} onMouseDown={() => { onChange(h); setOpen(false); }}
              style={dropdownItem(value === h)}>{h}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Minute picker ──────────────────────────────────────────────────────────────
function MinuteInput({ value, onChange, invalid, valid }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", width: "54px", flexShrink: 0 }}>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="mm"
        style={{ ...timefieldBase(invalid, valid), width: "100%", outline: "none" }}
      />
      {open && (
        <div style={{ ...dropdownList, minWidth: "54px" }}>
          {["00", "15", "30", "45"].map(m => (
            <div key={m} onMouseDown={() => { onChange(m); setOpen(false); }}
              style={dropdownItem(value === m)}>{m}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuoteServicesPublicView() {
  const { publicToken } = useParams();
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  const [action,        setAction]        = useState(null);
  const [acceptNotes,   setAcceptNotes]   = useState("");
  const [declineNotes,  setDeclineNotes]  = useState("");
  const [timeslots,     setTimeslots]     = useState([newSlot()]);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [submitError,   setSubmitError]   = useState(null);

  const [amendResult,  setAmendResult]  = useState(null);

  const [expandedSvcs,   setExpandedSvcs]   = useState(new Set());
  const toggleSvc = (i) => setExpandedSvcs(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const [multiOpen,      setMultiOpen]      = useState(false);
  const [multiDates,     setMultiDates]     = useState([]);
  const [multiFromH,     setMultiFromH]     = useState("");
  const [multiFromM,     setMultiFromM]     = useState("");
  const [multiToH,       setMultiToH]       = useState("");
  const [multiToM,       setMultiToM]       = useState("");
  const [multiOvernight, setMultiOvernight] = useState(false);

  const loadQuote = useCallback(async () => {
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
  }, [publicToken]);

  useEffect(() => { loadQuote(); }, [publicToken]);

  const addSlot    = () => setTimeslots(prev => [...prev, newSlot()]);
  const removeSlot = (id) => setTimeslots(prev => prev.filter(s => s.id !== id));
  const updateSlot = (id, field, val) =>
    setTimeslots(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
  const toggleRange = (id) =>
    setTimeslots(prev => prev.map(s => {
      if (s.id !== id) return s;
      const enabling = !s.rangeEnabled;
      return { ...s, rangeEnabled: enabling, endDate: enabling ? s.date : null };
    }));

  const openMultiModal = () => {
    setMultiDates([]);
    setMultiFromH(""); setMultiFromM("");
    setMultiToH("");   setMultiToM("");
    setMultiOvernight(false);
    setMultiOpen(true);
  };

  const toggleMultiDate = (date) =>
    setMultiDates(prev => {
      const key = date.toDateString();
      return prev.some(d => d.toDateString() === key)
        ? prev.filter(d => d.toDateString() !== key)
        : [...prev, date];
    });

  const saveMultiDates = () => {
    if (!multiDates.length) { setMultiOpen(false); return; }
    const fMins = parseInt(multiFromH || "0", 10) * 60 + parseInt(multiFromM || "0", 10);
    const tMins = parseInt(multiToH   || "0", 10) * 60 + parseInt(multiToM   || "0", 10);
    const applyOvernight = multiOvernight && multiFromH && multiToH && fMins >= tMins;
    const sorted = [...multiDates].sort((a, b) => a - b);
    const newSlots = sorted.map(date => {
      if (applyOvernight) {
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);
        return { ...newSlot(), date, fromH: multiFromH, fromM: multiFromM, toH: multiToH, toM: multiToM, rangeEnabled: true, endDate };
      }
      return { ...newSlot(), date, fromH: multiFromH, fromM: multiFromM, toH: multiToH, toM: multiToM };
    });
    setTimeslots(prev => {
      if (prev.length === 1 && !prev[0].date && !prev[0].fromH) return newSlots;
      return [...prev, ...newSlots];
    });
    setMultiOpen(false);
  };

  const buildNotes = () => {
    if (action === "accept") {
      let text = "Customer accepted the quote via the online portal.";
      if (acceptNotes.trim()) text += `\n\nSpecial requests:\n${acceptNotes.trim()}`;
      const timeStr = (h, m) => h ? `${h}:${(m || "00").padStart(2, "0")}` : null;
      const valid = timeslots.filter(s => s.date && !slotHasError(s));
      if (valid.length) {
        text += "\n\nPreferred availability:\n" +
          valid.map(s => {
            const from = timeStr(s.fromH, s.fromM);
            const to   = timeStr(s.toH,   s.toM);
            if (s.rangeEnabled && s.endDate) {
              const fp = from ? ` at ${from}` : "";
              const tp = to   ? ` at ${to}`   : "";
              return `• From ${fmtDateObj(s.date)}${fp} to ${fmtDateObj(s.endDate)}${tp}`;
            }
            const d = fmtDateObj(s.date);
            if (from && to) return `• ${d}: ${from} – ${to}`;
            if (from)       return `• ${d}: from ${from}`;
            return `• ${d}`;
          }).join("\n");
      }
      return text;
    } else {
      let text = "Customer declined the quote via the online portal.";
      if (declineNotes.trim()) text += `\n\nReason provided:\n${declineNotes.trim()}`;
      return text;
    }
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const status = action === "accept" ? "Accepted" : "Declined";
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
    setSubmitError(null);
  };

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#71717a", fontSize: "14px" }}>Loading quote…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#f87171", fontSize: "14px", marginBottom: "8px" }}>{error}</p>
          <p style={{ color: "#71717a", fontSize: "13px" }}>Please contact us if you believe this is an error.</p>
        </div>
      </div>
    );
  }

  const {
    quote, services, business,
    vat_registered: vatRegistered,
    total_labour: totalLabour,
    total_materials_inc_vat: totalMat,
    grand_total: grandTotal,
  } = data;

  const fmtGbp = (n) => `£${Number(n).toFixed(2)}`;
  const sc = STATUS_COLOURS[quote.status] || STATUS_COLOURS.Draft;

  const isSent      = quote.status === "Sent";
  const isResolved  = quote.status === "Accepted" || quote.status === "Declined";
  const hasAnyError = timeslots.some(slotHasError);

  const card = {
    background: "#0e1729", borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.09)", marginBottom: "24px",
  };

  const inputStyle = {
    padding: "8px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.09)",
    fontSize: "14px", fontFamily: "inherit", outline: "none",
    colorScheme: "dark", boxSizing: "border-box",
    background: "rgba(2,6,15,0.7)", color: "#f4f4f5",
  };

  const textareaStyle = {
    ...inputStyle, width: "100%", resize: "vertical",
    padding: "10px 12px", lineHeight: 1.5, display: "block",
  };

  return (
    <>
      {/* react-datepicker dark overrides */}
      <style>{`
        .react-datepicker-popper { z-index: 9999 !important; }
        .react-datepicker { background: #0e1729 !important; border-color: rgba(255,255,255,0.09) !important; color: #f4f4f5 !important; }
        .react-datepicker__header { background: #111e33 !important; border-color: rgba(255,255,255,0.09) !important; }
        .react-datepicker__current-month, .react-datepicker__day-name, .react-datepicker__day { color: #f4f4f5 !important; }
        .react-datepicker__day:hover { background: rgba(255,255,255,0.09) !important; }
        .react-datepicker__day--selected { background: #0ea5e9 !important; color: #fff !important; }
        .react-datepicker__day--disabled { color: #52525b !important; }
        .react-datepicker__navigation-icon::before { border-color: #a1a1aa !important; }
        .react-datepicker__triangle::before, .react-datepicker__triangle::after { border-bottom-color: rgba(255,255,255,0.09) !important; border-top-color: rgba(255,255,255,0.09) !important; }
      `}</style>

      <div style={{ minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", color: "#f4f4f5" }}>

        {/* ── Business header ── */}
        <div style={{ padding: "20px 40px 16px" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ color: "#f4f4f5", fontSize: "20px", fontWeight: 700, margin: 0 }}>
                {business?.business_name || "Quotation"}
              </p>
              {(business?.phone || business?.email) && (
                <p style={{ color: "#71717a", fontSize: "13px", margin: "4px 0 0" }}>
                  {[business.phone, business.email].filter(Boolean).join("  ·  ")}
                </p>
              )}
            </div>
            <div>
              <span style={{
                display: "inline-block", padding: "4px 14px",
                borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                background: sc.bg, color: sc.text,
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
                <p style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px", color: "#f4f4f5" }}>{quote.title}</p>
                {quote.description && (
                  <p style={{ color: "#a1a1aa", fontSize: "14px", margin: 0, lineHeight: 1.6 }}>
                    {quote.description}
                  </p>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: "13px", color: "#71717a", margin: "0 0 4px" }}>
                  Reference: <strong style={{ color: "#f4f4f5" }}>#{fmtRef(quote.quote_number)}</strong>
                </p>
                <p style={{ fontSize: "13px", color: "#71717a", margin: "0 0 4px" }}>
                  Date: <strong style={{ color: "#f4f4f5" }}>{fmt(quote.sent_at || quote.created_at)}</strong>
                </p>
                <p style={{ fontSize: "13px", color: "#71717a", margin: 0 }}>
                  Valid until: <strong style={{ color: "#f4f4f5" }}>{addDays(quote.sent_at || quote.created_at, 30)}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* ── Scope of Works ── */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.09)" }}>
              <p style={{ fontWeight: 700, fontSize: "16px", margin: 0, color: "#f4f4f5" }}>Scope of Works</p>
            </div>

            {services.length > 0 && (
              <div style={{ padding: "10px 24px 0" }}>
                <p style={{ fontWeight: 700, fontSize: "14px", color: "#38bdf8", margin: 0 }}>Services</p>
              </div>
            )}

            {services.length === 0 ? (
              <p style={{ padding: "24px", color: "#71717a", fontSize: "14px", margin: 0 }}>No services listed.</p>
            ) : services.map((sv, i) => {
              const isExpanded = expandedSvcs.has(i);
              const hasDetail  = sv.material_names?.length > 0 || sv.has_pricing;

              return (
                <div key={i} style={{ borderTop: "1px solid #111e33" }}>
                  <div
                    onClick={() => hasDetail && toggleSvc(i)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      gap: "16px", padding: "16px 24px",
                      cursor: hasDetail ? "pointer" : "default",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: "14px", margin: "0 0 3px", color: "#f4f4f5" }}>{sv.title || "—"}</p>
                      {sv.task && <p style={{ color: "#71717a", fontSize: "13px", margin: 0 }}>{sv.task}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                      <span style={{ fontSize: "13px", color: "#71717a" }}>Qty: {sv.quantity}</span>
                      {hasDetail && (
                        <span style={{
                          fontSize: "11px", color: "#71717a",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s",
                          display: "inline-block",
                        }}>▼</span>
                      )}
                    </div>
                  </div>

                  {isExpanded && hasDetail && (
                    <div style={{ padding: "0 24px 16px", borderTop: "1px solid #111e33" }}>
                      {sv.material_names?.length > 0 && (
                        <div style={{ fontSize: "13px", color: "#a1a1aa", marginBottom: sv.has_pricing ? "10px" : 0 }}>
                          <span style={{ fontWeight: 600 }}>Materials:</span>
                          {sv.material_names.map((name, mi) => (
                            <p key={mi} style={{ margin: "2px 0 0 12px" }}>{name}</p>
                          ))}
                        </div>
                      )}

                      {sv.has_pricing && (
                        <div style={{ fontSize: "13px", color: "#a1a1aa" }}>
                          <span style={{ fontWeight: 600 }}>Pricing:</span>
                          <div style={{ marginLeft: "12px", marginTop: "3px" }}>
                            {sv.labour != null && (
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                                <span>{sv.is_callout ? "Callout Charge" : "Labour"}{vatRegistered ? " (inc. 20% VAT)" : ""}</span>
                                <span>{fmtGbp(sv.labour)}</span>
                              </div>
                            )}
                            {sv.materials_inc_vat != null && (
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                                <span style={{ color: "#71717a" }}>Materials (inc. 20% VAT)</span>
                                <span>{fmtGbp(sv.materials_inc_vat)}</span>
                              </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#f4f4f5" }}>
                              <span>Total</span>
                              <span>{fmtGbp(sv.total)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Price Breakdown ── */}
            {(totalLabour > 0 || totalMat > 0) && (
              <div style={{ borderTop: "2px solid rgba(255,255,255,0.09)", padding: "16px 24px" }}>
                <p style={{ fontWeight: 700, fontSize: "14px", color: "#38bdf8", margin: "0 0 12px" }}>Total Price Breakdown</p>
                {totalLabour > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px", color: "#a1a1aa" }}>
                    <span>Labour{vatRegistered ? " (inc. 20% VAT)" : ""}</span>
                    <span style={{ fontWeight: 600, color: "#f4f4f5" }}>{fmtGbp(totalLabour)}</span>
                  </div>
                )}
                {totalMat > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px", color: "#a1a1aa" }}>
                    <span>Materials (inc. 20% VAT)</span>
                    <span style={{ fontWeight: 600, color: "#f4f4f5" }}>{fmtGbp(totalMat)}</span>
                  </div>
                )}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.09)", marginTop: "6px", paddingTop: "10px", display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700, color: "#f4f4f5" }}>
                  <span>Total</span>
                  <span>{fmtGbp(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Notes ── */}
          <div style={{ ...card, padding: "24px 28px" }}>
            <p style={{ fontWeight: 700, fontSize: "14px", marginBottom: "10px", marginTop: 0, color: "#f4f4f5" }}>Notes</p>
            <p style={{ color: "#71717a", fontSize: "13px", lineHeight: 1.6, marginBottom: "6px", marginTop: 0 }}>
              Where applicable, a full works certificate will be issued once the invoice has been paid in full.
            </p>
            <p style={{ color: "#71717a", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
              Where applicable, we will require a deposit of 50% of the quotation value, once the quotation has been accepted.
            </p>
          </div>

          {/* ── Customer request submitted thank you ── */}
          {amendResult === "draft" && (
            <div style={{
              ...card,
              padding: "28px 32px",
              background: "rgba(251,191,36,0.08)",
              borderColor: "#fbbf24",
              textAlign: "center",
            }}>
              <p style={{ fontSize: "32px", margin: "0 0 10px" }}>📋</p>
              <p style={{ fontWeight: 700, fontSize: "18px", margin: "0 0 10px", color: "#fbbf24" }}>
                Thank you for your request!
              </p>
              <p style={{ fontSize: "14px", color: "#a1a1aa", lineHeight: 1.6, margin: 0 }}>
                We have received your service request and will review it. Once reviewed, we will send you a revised quote for your approval.
              </p>
            </div>
          )}

          {/* ── Already resolved banner ── */}
          {isResolved && !submitted && (
            <div style={{
              ...card,
              padding: "24px 28px",
              background: quote.status === "Accepted" ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
              borderColor: quote.status === "Accepted" ? "#34d399" : "#f87171",
            }}>
              <p style={{
                fontWeight: 700, fontSize: "15px", margin: "0 0 6px",
                color: quote.status === "Accepted" ? "#34d399" : "#f87171",
              }}>
                {quote.status === "Accepted" ? "Quote accepted" : "Quote declined"}
              </p>
              <p style={{ color: "#a1a1aa", fontSize: "13px", margin: 0 }}>
                {quote.status === "Accepted"
                  ? "You have already accepted this quote. We will be in touch shortly."
                  : "You have already declined this quote. Please contact us if you've changed your mind."}
              </p>
            </div>
          )}

          {/* ── Accept / Decline section ── */}
          {isSent && !submitted && (
            <div style={{ ...card, padding: "28px 32px" }}>
              <p style={{ fontWeight: 700, fontSize: "16px", margin: "0 0 16px", color: "#f4f4f5" }}>Respond to this quote</p>

              {/* Amend result banner */}
              {amendResult === "updated" && (
                <div style={{ marginBottom: "20px", padding: "14px 16px", background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: "6px" }}>
                  <p style={{ margin: "0 0 3px", fontWeight: 700, fontSize: "14px", color: "#38bdf8" }}>Quote updated</p>
                  <p style={{ margin: 0, fontSize: "13px", color: "#a1a1aa" }}>Your services have been updated. You can now review the quote and accept or decline below.</p>
                </div>
              )}

              {/* Toggle buttons */}
              <div style={{ display: "flex", gap: "12px", marginBottom: action ? "24px" : "0" }}>
                <button
                  onClick={() => switchAction("accept")}
                  style={{
                    flex: 1, padding: "12px 20px", borderRadius: "8px",
                    fontWeight: 700, fontSize: "14px", cursor: "pointer",
                    border: "2px solid", transition: "all 0.15s",
                    background: action === "accept" ? "rgba(52,211,153,0.1)" : "#111e33",
                    borderColor: action === "accept" ? "#34d399" : "rgba(255,255,255,0.09)",
                    color: action === "accept" ? "#34d399" : "#a1a1aa",
                  }}
                >
                  ✓ Accept Quote
                </button>
                <button
                  onClick={() => switchAction("decline")}
                  style={{
                    flex: 1, padding: "12px 20px", borderRadius: "8px",
                    fontWeight: 700, fontSize: "14px", cursor: "pointer",
                    border: "2px solid", transition: "all 0.15s",
                    background: action === "decline" ? "rgba(248,113,113,0.1)" : "#111e33",
                    borderColor: action === "decline" ? "#f87171" : "rgba(255,255,255,0.09)",
                    color: action === "decline" ? "#f87171" : "#a1a1aa",
                  }}
                >
                  ✕ Decline Quote
                </button>
                {amendResult !== "draft" && (
                  <button
                    onClick={() => switchAction("amend")}
                    style={{
                      flex: 1, padding: "12px 20px", borderRadius: "8px",
                      fontWeight: 700, fontSize: "14px", cursor: "pointer",
                      border: "2px solid", transition: "all 0.15s",
                      background: action === "amend" ? "rgba(251,191,36,0.1)" : "#111e33",
                      borderColor: action === "amend" ? "#fbbf24" : "rgba(255,255,255,0.09)",
                      color: action === "amend" ? "#fbbf24" : "#a1a1aa",
                    }}
                  >
                    ✎ Amend Quote
                  </button>
                )}
              </div>

              {/* ── Accept form ── */}
              {action === "accept" && (
                <>
                  <div style={{ marginBottom: "22px" }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "8px", color: "#f4f4f5" }}>
                      Special requests{" "}
                      <span style={{ color: "#71717a", fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      value={acceptNotes}
                      onChange={e => setAcceptNotes(e.target.value)}
                      placeholder="Any special instructions or requirements…"
                      rows={3}
                      style={textareaStyle}
                    />
                  </div>

                  <div style={{ marginBottom: "22px" }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "10px", color: "#f4f4f5" }}>
                      Preferred dates & times{" "}
                      <span style={{ color: "#71717a", fontWeight: 400 }}>(optional)</span>
                    </label>

                    {timeslots.map(slot => {
                      const err = slotHasError(slot);
                      const timeValid = !err && !!(slot.fromH && slot.toH) &&
                        (!slot.rangeEnabled || !!(slot.date && slot.endDate));
                      const sepStyle = { color: "#52525b", fontSize: "14px", flexShrink: 0 };
                      const labelStyle = { fontSize: "12px", color: "#71717a", fontWeight: 600, flexShrink: 0 };
                      const rmBtn = (
                        <button
                          onClick={() => removeSlot(slot.id)}
                          disabled={timeslots.length === 1}
                          style={{
                            width: "32px", height: "32px", borderRadius: "6px", flexShrink: 0,
                            border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.1)",
                            color: "#f87171", cursor: timeslots.length === 1 ? "not-allowed" : "pointer",
                            opacity: timeslots.length === 1 ? 0.4 : 1, fontSize: "14px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >✕</button>
                      );

                      return (
                        <div key={slot.id} style={{ marginBottom: "12px" }}>

                          {slot.rangeEnabled ? (
                            <>
                              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
                                <span style={{ ...labelStyle, width: "32px" }}>From</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <DatePicker selected={slot.date} onChange={d => updateSlot(slot.id, "date", d)}
                                    dateFormat="dd/MM/yyyy" minDate={new Date()} calendarStartDay={1}
                                    customInput={<DateMaskInput forceInvalid={err} onDateChange={d => updateSlot(slot.id, "date", d)} />}
                                    popperPlacement="bottom-start" portalId="datepicker-portal" />
                                </div>
                                <HourSelect value={slot.fromH} onChange={h => { updateSlot(slot.id, "fromH", h); if (!slot.fromM) updateSlot(slot.id, "fromM", "00"); }} invalid={err} valid={timeValid} />
                                <span style={sepStyle}>:</span>
                                <MinuteInput value={slot.fromM} onChange={m => updateSlot(slot.id, "fromM", m)} invalid={err} valid={timeValid} />
                                {rmBtn}
                              </div>
                              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                <span style={{ ...labelStyle, width: "32px" }}>Until</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <DatePicker selected={slot.endDate} onChange={d => updateSlot(slot.id, "endDate", d)}
                                    dateFormat="dd/MM/yyyy" minDate={slot.date || new Date()} calendarStartDay={1}
                                    customInput={<DateMaskInput forceInvalid={err} onDateChange={d => updateSlot(slot.id, "endDate", d)} />}
                                    popperPlacement="bottom-start" portalId="datepicker-portal" />
                                </div>
                                <HourSelect value={slot.toH} onChange={h => { updateSlot(slot.id, "toH", h); if (!slot.toM) updateSlot(slot.id, "toM", "00"); }} invalid={err} valid={timeValid} />
                                <span style={sepStyle}>:</span>
                                <MinuteInput value={slot.toM} onChange={m => updateSlot(slot.id, "toM", m)} invalid={err} valid={timeValid} />
                                <div style={{ width: "32px" }} />
                              </div>
                            </>
                          ) : (
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <DatePicker selected={slot.date} onChange={d => updateSlot(slot.id, "date", d)}
                                  dateFormat="dd/MM/yyyy" minDate={new Date()} calendarStartDay={1}
                                  customInput={<DateMaskInput onDateChange={d => updateSlot(slot.id, "date", d)} />}
                                  popperPlacement="bottom-start" portalId="datepicker-portal" />
                              </div>
                              <span style={labelStyle}>From</span>
                              <HourSelect value={slot.fromH} onChange={h => { updateSlot(slot.id, "fromH", h); if (!slot.fromM) updateSlot(slot.id, "fromM", "00"); }} invalid={err} valid={timeValid} />
                              <span style={sepStyle}>:</span>
                              <MinuteInput value={slot.fromM} onChange={m => updateSlot(slot.id, "fromM", m)} invalid={err} valid={timeValid} />
                              <span style={labelStyle}>Until</span>
                              <HourSelect value={slot.toH} onChange={h => { updateSlot(slot.id, "toH", h); if (!slot.toM) updateSlot(slot.id, "toM", "00"); }} invalid={err} valid={timeValid} />
                              <span style={sepStyle}>:</span>
                              <MinuteInput value={slot.toM} onChange={m => updateSlot(slot.id, "toM", m)} invalid={err} valid={timeValid} />
                              {rmBtn}
                            </div>
                          )}

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "5px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", userSelect: "none" }}>
                              <input type="checkbox" checked={slot.rangeEnabled} onChange={() => toggleRange(slot.id)}
                                style={{ cursor: "pointer", accentColor: "#38bdf8" }} />
                              <span style={{ fontSize: "12px", color: "#71717a" }}>Date Range</span>
                            </label>
                          </div>

                          {err && (
                            <p style={{ fontSize: "11px", color: "#f87171", margin: "3px 0 0" }}>
                              {slot.rangeEnabled ? "Start must be before end date/time" : "Start time must be before end time"}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                      <button
                        onClick={addSlot}
                        style={{
                          padding: "6px 14px", borderRadius: "6px",
                          border: "1px solid rgba(255,255,255,0.09)", background: "#111e33",
                          fontSize: "13px", cursor: "pointer", color: "#a1a1aa",
                        }}
                      >
                        + Add Date
                      </button>
                      <button
                        onClick={openMultiModal}
                        style={{
                          padding: "6px 14px", borderRadius: "6px",
                          border: "1px solid rgba(56,189,248,0.3)", background: "rgba(56,189,248,0.08)",
                          fontSize: "13px", cursor: "pointer", color: "#38bdf8",
                        }}
                      >
                        + Add Multiple Dates
                      </button>
                    </div>
                  </div>

                  {submitError && (
                    <p style={{ color: "#f87171", fontSize: "13px", marginBottom: "12px" }}>{submitError}</p>
                  )}

                  {hasAnyError && (
                    <p style={{ color: "#f87171", fontSize: "13px", marginBottom: "12px", textAlign: "center" }}>
                      Please fix the date/time errors above before confirming.
                    </p>
                  )}

                  {!hasAnyError && (
                    <button
                      onClick={handleConfirm}
                      disabled={submitting}
                      style={{
                        width: "100%", padding: "14px", borderRadius: "8px",
                        background: submitting ? "rgba(52,211,153,0.5)" : "#22c55e",
                        color: "#fff", fontWeight: 700, fontSize: "15px",
                        border: "none", cursor: submitting ? "not-allowed" : "pointer",
                      }}
                    >
                      {submitting ? "Confirming…" : "Confirm Acceptance"}
                    </button>
                  )}
                </>
              )}

              {/* ── Amend form (inline) ── */}
              {action === "amend" && (
                <div style={{ marginTop: "24px" }}>
                  <CustomerQuoteServiceLinkPublicView
                    publicToken={publicToken}
                    initialServices={(data?.services || []).filter(sv => sv.title !== "Callout Charge")}
                    inline={true}
                    onClose={() => switchAction(null)}
                    onSaved={async (hasCustom) => {
                      switchAction(null);
                      setAmendResult(hasCustom ? "draft" : "updated");
                      await loadQuote();
                    }}
                  />
                </div>
              )}

              {/* ── Decline form ── */}
              {action === "decline" && (
                <>
                  <div style={{ marginBottom: "22px" }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "8px", color: "#f4f4f5" }}>
                      Would you like to share a reason?{" "}
                      <span style={{ color: "#71717a", fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      value={declineNotes}
                      onChange={e => setDeclineNotes(e.target.value)}
                      placeholder="Please let us know why you're declining this quote…"
                      rows={3}
                      style={textareaStyle}
                    />
                  </div>

                  {submitError && (
                    <p style={{ color: "#f87171", fontSize: "13px", marginBottom: "12px" }}>{submitError}</p>
                  )}

                  <button
                    onClick={handleConfirm}
                    disabled={submitting}
                    style={{
                      width: "100%", padding: "14px", borderRadius: "8px",
                      background: submitting ? "rgba(248,113,113,0.5)" : "#ef4444",
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
              background: action === "accept" ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
              borderColor: action === "accept" ? "#34d399" : "#f87171",
            }}>
              <p style={{ fontSize: "32px", margin: "0 0 8px" }}>
                {action === "accept" ? "✓" : "✕"}
              </p>
              <p style={{
                fontWeight: 700, fontSize: "18px", margin: "0 0 8px",
                color: action === "accept" ? "#34d399" : "#f87171",
              }}>
                {action === "accept" ? "Quote Accepted" : "Quote Declined"}
              </p>
              <p style={{ fontSize: "14px", margin: 0, color: "#a1a1aa" }}>
                {action === "accept"
                  ? "Thank you! We've received your acceptance and will be in touch shortly to arrange a convenient start date."
                  : "Thank you for your response. We've noted your decision. Please don't hesitate to contact us if you change your mind."}
              </p>
            </div>
          )}

          {/* ── Contact footer ── */}
          {(business?.email || business?.phone) && (
            <div style={{ textAlign: "center", padding: "24px" }}>
              <p style={{ color: "#71717a", fontSize: "13px", marginBottom: "6px" }}>
                {isSent && !submitted
                  ? "You can also accept or discuss this quote by getting in touch:"
                  : "For any questions, please get in touch:"}
              </p>
              <p style={{ fontWeight: 600, color: "#38bdf8", fontSize: "14px" }}>
                {[business.email, business.phone].filter(Boolean).join("  ·  ")}
              </p>
              {business.website && (
                <p style={{ color: "#71717a", fontSize: "13px", marginTop: "4px" }}>{business.website}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Add Multiple Dates modal ── */}
      {multiOpen && (() => {
        const fMins = parseInt(multiFromH || "0", 10) * 60 + parseInt(multiFromM || "0", 10);
        const tMins = parseInt(multiToH   || "0", 10) * 60 + parseInt(multiToM   || "0", 10);
        const timeSet         = !!(multiFromH && multiToH);
        const showOvernight   = timeSet && fMins >= tMins;
        const timeErr         = showOvernight && !multiOvernight;
        const timeValid       = timeSet && (fMins < tMins || multiOvernight);
        const canSave         = multiDates.length > 0 && !timeErr;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
            <div style={{ background: "#0e1729", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "8px", padding: "24px", width: "100%", maxWidth: "360px", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", fontFamily: "system-ui, -apple-system, sans-serif" }}>

              <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 700, color: "#f4f4f5" }}>Add Multiple Dates</h3>

              <MultiCalendar selectedDates={multiDates} onToggle={toggleMultiDate} />

              <p style={{ margin: "10px 0 14px", fontSize: "13px", color: multiDates.length ? "#38bdf8" : "#52525b", fontWeight: multiDates.length ? 600 : 400 }}>
                {multiDates.length === 0
                  ? "Click dates above to select them"
                  : `${multiDates.length} date${multiDates.length > 1 ? "s" : ""} selected`}
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#a1a1aa" }}>From</span>
                <HourSelect value={multiFromH} onChange={h => { setMultiFromH(h); if (!multiFromM) setMultiFromM("00"); }} invalid={timeErr} valid={timeValid} />
                <span style={{ color: "#52525b" }}>:</span>
                <MinuteInput value={multiFromM} onChange={setMultiFromM} invalid={timeErr} valid={timeValid} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#a1a1aa", marginLeft: "4px" }}>Until</span>
                <HourSelect value={multiToH} onChange={h => { setMultiToH(h); if (!multiToM) setMultiToM("00"); }} invalid={timeErr} valid={timeValid} />
                <span style={{ color: "#52525b" }}>:</span>
                <MinuteInput value={multiToM} onChange={setMultiToM} invalid={timeErr} valid={timeValid} />
              </div>

              {showOvernight && (
                <div style={{ marginBottom: "14px" }}>
                  {timeErr && (
                    <p style={{ color: "#f87171", fontSize: "12px", margin: "0 0 8px" }}>Start time must be before end time.</p>
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="checkbox" checked={multiOvernight} onChange={e => setMultiOvernight(e.target.checked)}
                      style={{ cursor: "pointer", accentColor: "#38bdf8", flexShrink: 0, width: "15px", height: "15px" }} />
                    <span style={{ fontSize: "13px", color: "#a1a1aa" }}>Overnight work (end time is next day)</span>
                  </label>
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
                <button onClick={() => setMultiOpen(false)}
                  style={{ padding: "8px 18px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.09)", background: "#111e33", fontSize: "13px", cursor: "pointer", color: "#a1a1aa", fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={saveMultiDates} disabled={!canSave}
                  style={{ padding: "8px 18px", borderRadius: "6px", border: "none", fontSize: "13px", cursor: canSave ? "pointer" : "not-allowed", fontWeight: 600, background: canSave ? "#0ea5e9" : "#111e33", color: canSave ? "#fff" : "#52525b", transition: "background 0.15s" }}>
                  Add {multiDates.length > 0 ? multiDates.length : ""} Date{multiDates.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Portal target for react-datepicker */}
      <div id="datepicker-portal" />
    </>
  );
}
