import { useEffect, useLayoutEffect, useState, useRef, useCallback, forwardRef } from "react";
import { useParams } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { supabase } from "../../../supabaseClient";

const STATUS_COLOURS = {
  Draft:    { bg: "#3f3f46", text: "#a1a1aa" },
  Sent:     { bg: "#0c4a6e", text: "#38bdf8" },
  Accepted: { bg: "#064e3b", text: "#34d399" },
  Declined: { bg: "#450a0a", text: "#f87171" },
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

// Builds "DD/MM/YYYY" mask, replacing trailing hyphens for un-typed positions.
// e.g. digits="1206" → "12/06/----"
function formatMasked(digits) {
  const tpl = ["-","-","/","-","-","/","-","-","-","-"];
  let di = 0;
  return tpl.map(ch => ch === "/" ? "/" : di < digits.length ? digits[di++] : "-").join("");
}

// Character index in the masked string right after n typed digits,
// accounting for the two "/" separators at indices 2 and 5.
// e.g. 2 digits → position 3 (after "12/"), 4 digits → position 6 (after "12/06/")
function cursorPos(n) {
  if (n <= 1) return n;
  if (n <= 3) return n + 1; // past first "/"
  return n + 2;             // past both "/"s
}

// Converts a cursor position in the masked string to the digit index
// (= number of typed digits to the left of the cursor).
// Positions that land on "/" separators map to the digit index just after them.
// Mask layout: D D / M M / Y Y Y Y  (indices 0-9, "/" at 2 and 5)
function maskedCursorToDigitIdx(p) {
  if (p <= 2) return p;       // 0→0, 1→1, 2→2
  if (p === 3) return 2;      // right after first "/"
  if (p <= 5) return p - 1;  // 4→3, 5→4
  if (p === 6) return 4;      // right after second "/"
  return p - 2;               // 7→5, 8→6, 9→7, 10→8
}

// Returns true if the slot's time range is invalid (start >= end)
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

// Masked date input with static --/--/---- template.
// Keys are intercepted via onKeyDown so hyphens stay in place while typing.
// Green background = valid future date; red = past or invalid.
const DateMaskInput = forwardRef(({ value, onClick, onChange, onDateChange, forceInvalid }, ref) => {
  const [digits, setDigits] = useState("");
  const isTyping    = useRef(false);
  const inputRef    = useRef(null);
  const wantCursor  = useRef(null); // desired cursor position after next render

  // Wire both the forwarded ref and our own internal ref to the same element
  const setRef = useCallback((el) => {
    inputRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  }, [ref]);

  // Apply cursor position right after the DOM updates (before paint)
  useLayoutEffect(() => {
    if (wantCursor.current !== null && inputRef.current) {
      const pos = wantCursor.current;
      wantCursor.current = null;
      inputRef.current.setSelectionRange(pos, pos);
    }
  });

  // Sync only when the calendar selects a date (not during keyboard input)
  useEffect(() => {
    if (isTyping.current) { isTyping.current = false; return; }
    setDigits(value ? value.replace(/\D/g, "").slice(0, 8) : "");
  }, [value]);

  // Core update: new digit string → state + parent callbacks
  const commitStr = (nd, newDigitIdx) => {
    isTyping.current = true;
    wantCursor.current = cursorPos(newDigitIdx);
    setDigits(nd);
    onChange({ target: { value: nd.length > 0 ? formatMasked(nd) : "" } });
    // react-datepicker's handleChangeRaw (passed as onChange to customInput)
    // only stores the raw string — it never parses or updates `selected`.
    // So we parse the date ourselves and call onDateChange directly.
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
    // Read where the cursor actually is in the masked string
    const p  = el.selectionStart ?? digits.length;
    const di = maskedCursorToDigitIdx(p);

    if (e.key === "Backspace") {
      e.preventDefault();
      if (di === 0) return;
      // Delete digit to the left of cursor
      commitStr(digits.slice(0, di - 1) + digits.slice(di), di - 1);
      return;
    }

    if (e.key === "Delete") {
      e.preventDefault();
      if (di >= digits.length) return;
      // Delete digit to the right of cursor
      commitStr(digits.slice(0, di) + digits.slice(di + 1), di);
      return;
    }

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      // Insert digit at cursor, shift right, cap at 8 chars
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
    // Replace selected digit range with pasted digits, cap at 8
    const nd = (digits.slice(0, di1) + pasted + digits.slice(di2)).slice(0, 8);
    commitStr(nd, Math.min(di1 + pasted.length, 8));
  };

  // Validation (only when all 8 digits are present)
  let border = "1px solid #e5e7eb";
  let bg = "#fff";
  let errorMsg = null;

  if (digits.length === 8) {
    const d = parseInt(digits.slice(0, 2), 10);
    const m = parseInt(digits.slice(2, 4), 10);
    const yyyy = digits.slice(4, 8);
    const date = new Date(`${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(date.getTime()) || d < 1 || d > 31 || m < 1 || m > 12) {
      bg = "#fef2f2"; border = "1px solid #fca5a5"; errorMsg = "Invalid date";
    } else if (date < today) {
      bg = "#fef2f2"; border = "1px solid #fca5a5"; errorMsg = "Date can't be in the past";
    } else {
      bg = "#f0fdf4"; border = "1px solid #86efac";
    }
  }

  // Slot-level error from parent overrides internal colours
  if (forceInvalid) { bg = "#fef2f2"; border = "1px solid #fca5a5"; errorMsg = null; }

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
            borderRadius: "8px", border,
            background: bg, color: "#111827",
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
            cursor: "pointer", padding: 0, color: "#9ca3af",
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
          fontSize: "11px", color: "#ef4444", margin: 0, whiteSpace: "nowrap", zIndex: 10,
        }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
});

// Shared styles for both time-picker fields
const timefieldBase = (invalid, valid) => ({
  padding: "7px 4px", borderRadius: "8px", fontSize: "14px", fontFamily: "inherit",
  boxSizing: "border-box", textAlign: "center",
  background: invalid ? "#fef2f2" : valid ? "#f0fdf4" : "#fff",
  border:     `1px solid ${invalid ? "#fca5a5" : valid ? "#86efac" : "#e5e7eb"}`,
  color: "#111827",
});
const dropdownList = {
  position: "absolute", top: "calc(100% + 2px)", left: 0,
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 9999, overflow: "auto",
};
const dropdownItem = (active) => ({
  padding: "6px 10px", cursor: "pointer", fontSize: "14px", textAlign: "center",
  background: active ? "#f0f9ff" : "#fff", color: active ? "#0369a1" : "#111827",
});

// ── Multi-date inline calendar for the "Add Multiple Dates" modal ─────────────
function MultiCalendar({ selectedDates, onToggle }) {
  const [view, setView] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const y = view.getFullYear();
  const m = view.getMonth();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const firstDow  = (new Date(y, m, 1).getDay() + 6) % 7; // Monday=0
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
      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#374151", padding: "2px 8px", borderRadius: "6px" }}>
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        {navBtn(-1, "‹")}
        <span style={{ fontWeight: 700, fontSize: "14px", color: "#111827" }}>{monthLabel}</span>
        {navBtn(1, "›")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: "11px", fontWeight: 600, color: "#9ca3af", padding: "2px 0" }}>{d}</div>
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
                background: selected ? "#0369a1" : "transparent",
                color: disabled ? "#d1d5db" : selected ? "#fff" : "#111827",
                fontWeight: selected || todayDay ? 700 : 400,
                outline: todayDay && !selected ? "2px solid #e5e7eb" : "none",
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

// ── Hour picker 00–23 — custom white dropdown ─────────────────────────────────
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
        <span style={{ fontSize: "9px", color: "#9ca3af", lineHeight: 1, flexShrink: 0 }}>▾</span>
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

// ── Minute picker — preset 00/15/30/45 but accepts any typed value ────────────
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

  // Accept / decline flow
  const [action,        setAction]        = useState(null); // "accept" | "decline" | null
  const [acceptNotes,   setAcceptNotes]   = useState("");
  const [declineNotes,  setDeclineNotes]  = useState("");
  const [timeslots,     setTimeslots]     = useState([newSlot()]);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [submitError,   setSubmitError]   = useState(null);

  // Expandable services
  const [expandedSvcs,   setExpandedSvcs]   = useState(new Set());
  const toggleSvc = (i) => setExpandedSvcs(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  // Multi-date modal state
  const [multiOpen,      setMultiOpen]      = useState(false);
  const [multiDates,     setMultiDates]     = useState([]);
  const [multiFromH,     setMultiFromH]     = useState("");
  const [multiFromM,     setMultiFromM]     = useState("");
  const [multiToH,       setMultiToH]       = useState("");
  const [multiToM,       setMultiToM]       = useState("");
  const [multiOvernight, setMultiOvernight] = useState(false);

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
    background: "#fff", borderRadius: "12px",
    border: "1px solid #e5e7eb", marginBottom: "24px",
  };

  const inputStyle = {
    padding: "8px 10px", borderRadius: "8px", border: "1px solid #e5e7eb",
    fontSize: "14px", fontFamily: "inherit", outline: "none",
    colorScheme: "light", boxSizing: "border-box",
    background: "#fff", color: "#111827",
  };

  const textareaStyle = {
    ...inputStyle, width: "100%", resize: "vertical",
    padding: "10px 12px", lineHeight: 1.5, display: "block",
  };

  return (
    <>
      {/* react-datepicker z-index fix */}
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

          {/* ── Scope of Works ── */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #f3f4f6" }}>
              <p style={{ fontWeight: 700, fontSize: "16px", margin: 0 }}>Scope of Works</p>
            </div>

            {services.length > 0 && (
              <div style={{ padding: "10px 24px 0" }}>
                <p style={{ fontWeight: 700, fontSize: "14px", color: "#0369a1", margin: 0 }}>Services</p>
              </div>
            )}

            {services.length === 0 ? (
              <p style={{ padding: "24px", color: "#9ca3af", fontSize: "14px", margin: 0 }}>No services listed.</p>
            ) : services.map((sv, i) => {
              const isExpanded = expandedSvcs.has(i);
              const hasDetail  = sv.material_names?.length > 0 || sv.has_pricing;

              return (
                <div key={i} style={{ borderTop: "1px solid #f3f4f6" }}>
                  {/* Clickable service header */}
                  <div
                    onClick={() => hasDetail && toggleSvc(i)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      gap: "16px", padding: "16px 24px",
                      cursor: hasDetail ? "pointer" : "default",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: "14px", margin: "0 0 3px" }}>{sv.title || "—"}</p>
                      {sv.task && <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>{sv.task}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                      <span style={{ fontSize: "13px", color: "#6b7280" }}>Qty: {sv.quantity}</span>
                      {hasDetail && (
                        <span style={{
                          fontSize: "11px", color: "#9ca3af",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s",
                          display: "inline-block",
                        }}>▼</span>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && hasDetail && (
                    <div style={{ padding: "0 24px 16px", borderTop: "1px solid #f9fafb" }}>
                      {/* Materials */}
                      {sv.material_names?.length > 0 && (
                        <div style={{ fontSize: "13px", color: "#374151", marginBottom: sv.has_pricing ? "10px" : 0 }}>
                          <span style={{ fontWeight: 600 }}>Materials:</span>
                          {sv.material_names.map((name, mi) => (
                            <p key={mi} style={{ margin: "2px 0 0 12px" }}>{name}</p>
                          ))}
                        </div>
                      )}

                      {/* Pricing */}
                      {sv.has_pricing && (
                        <div style={{ fontSize: "13px", color: "#374151" }}>
                          <span style={{ fontWeight: 600 }}>Pricing:</span>
                          <div style={{ marginLeft: "12px", marginTop: "3px" }}>
                            {sv.labour != null && (
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                                <span>Labour{vatRegistered ? " (inc. 20% VAT)" : ""}</span>
                                <span>{fmtGbp(sv.labour)}</span>
                              </div>
                            )}
                            {sv.materials_inc_vat != null && (
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                                <span style={{ color: "#6b7280" }}>Materials (inc. 20% VAT)</span>
                                <span>{fmtGbp(sv.materials_inc_vat)}</span>
                              </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
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
              <div style={{ borderTop: "2px solid #e5e7eb", padding: "16px 24px" }}>
                <p style={{ fontWeight: 700, fontSize: "14px", color: "#0369a1", margin: "0 0 12px" }}>Total Price Breakdown</p>
                {totalLabour > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                    <span>Labour{vatRegistered ? " (inc. 20% VAT)" : ""}</span>
                    <span style={{ fontWeight: 600 }}>{fmtGbp(totalLabour)}</span>
                  </div>
                )}
                {totalMat > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                    <span>Materials (inc. 20% VAT)</span>
                    <span style={{ fontWeight: 600 }}>{fmtGbp(totalMat)}</span>
                  </div>
                )}
                <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "6px", paddingTop: "10px", display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700 }}>
                  <span>Total</span>
                  <span>{fmtGbp(grandTotal)}</span>
                </div>
              </div>
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
                      value={acceptNotes}
                      onChange={e => setAcceptNotes(e.target.value)}
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

                    {timeslots.map(slot => {
                      const err = slotHasError(slot);
                      // Green when both hours are filled and the range is valid
                      const timeValid = !err && !!(slot.fromH && slot.toH) &&
                        (!slot.rangeEnabled || !!(slot.date && slot.endDate));
                      const sepStyle = { color: "#9ca3af", fontSize: "14px", flexShrink: 0 };
                      const labelStyle = { fontSize: "12px", color: "#6b7280", fontWeight: 600, flexShrink: 0 };
                      const rmBtn = (
                        <button
                          onClick={() => removeSlot(slot.id)}
                          disabled={timeslots.length === 1}
                          style={{
                            width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
                            border: "1px solid #fee2e2", background: "#fef2f2",
                            color: "#ef4444", cursor: timeslots.length === 1 ? "not-allowed" : "pointer",
                            opacity: timeslots.length === 1 ? 0.4 : 1, fontSize: "14px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >✕</button>
                      );

                      return (
                        <div key={slot.id} style={{ marginBottom: "12px" }}>

                          {slot.rangeEnabled ? (
                            /* ── Date range mode ── */
                            <>
                              {/* From row */}
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
                              {/* To row */}
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
                            /* ── Single-date mode ── */
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

                          {/* Checkbox row */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "5px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", userSelect: "none" }}>
                              <input type="checkbox" checked={slot.rangeEnabled} onChange={() => toggleRange(slot.id)}
                                style={{ cursor: "pointer", accentColor: "#0369a1" }} />
                              <span style={{ fontSize: "12px", color: "#6b7280" }}>Date Range</span>
                            </label>
                          </div>

                          {err && (
                            <p style={{ fontSize: "11px", color: "#ef4444", margin: "3px 0 0" }}>
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
                          padding: "6px 14px", borderRadius: "8px",
                          border: "1px solid #e5e7eb", background: "#f9fafb",
                          fontSize: "13px", cursor: "pointer", color: "#374151",
                        }}
                      >
                        + Add Date
                      </button>
                      <button
                        onClick={openMultiModal}
                        style={{
                          padding: "6px 14px", borderRadius: "8px",
                          border: "1px solid #bfdbfe", background: "#eff6ff",
                          fontSize: "13px", cursor: "pointer", color: "#1d4ed8",
                        }}
                      >
                        + Add Multiple Dates
                      </button>
                    </div>
                  </div>

                  {submitError && (
                    <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{submitError}</p>
                  )}

                  {hasAnyError && (
                    <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px", textAlign: "center" }}>
                      Please fix the date/time errors above before confirming.
                    </p>
                  )}

                  {!hasAnyError && (
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
                  )}
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
                      value={declineNotes}
                      onChange={e => setDeclineNotes(e.target.value)}
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
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
            <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "360px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", fontFamily: "system-ui, -apple-system, sans-serif" }}>

              <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 700, color: "#111827" }}>Add Multiple Dates</h3>

              <MultiCalendar selectedDates={multiDates} onToggle={toggleMultiDate} />

              <p style={{ margin: "10px 0 14px", fontSize: "13px", color: multiDates.length ? "#0369a1" : "#9ca3af", fontWeight: multiDates.length ? 600 : 400 }}>
                {multiDates.length === 0
                  ? "Click dates above to select them"
                  : `${multiDates.length} date${multiDates.length > 1 ? "s" : ""} selected`}
              </p>

              {/* Time fields */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>From</span>
                <HourSelect value={multiFromH} onChange={h => { setMultiFromH(h); if (!multiFromM) setMultiFromM("00"); }} invalid={timeErr} valid={timeValid} />
                <span style={{ color: "#9ca3af" }}>:</span>
                <MinuteInput value={multiFromM} onChange={setMultiFromM} invalid={timeErr} valid={timeValid} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginLeft: "4px" }}>Until</span>
                <HourSelect value={multiToH} onChange={h => { setMultiToH(h); if (!multiToM) setMultiToM("00"); }} invalid={timeErr} valid={timeValid} />
                <span style={{ color: "#9ca3af" }}>:</span>
                <MinuteInput value={multiToM} onChange={setMultiToM} invalid={timeErr} valid={timeValid} />
              </div>

              {/* Error + overnight checkbox */}
              {showOvernight && (
                <div style={{ marginBottom: "14px" }}>
                  {timeErr && (
                    <p style={{ color: "#ef4444", fontSize: "12px", margin: "0 0 8px" }}>Start time must be before end time.</p>
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input type="checkbox" checked={multiOvernight} onChange={e => setMultiOvernight(e.target.checked)}
                      style={{ cursor: "pointer", accentColor: "#0369a1", flexShrink: 0, width: "15px", height: "15px" }} />
                    <span style={{ fontSize: "13px", color: "#374151" }}>Overnight work (end time is next day)</span>
                  </label>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
                <button onClick={() => setMultiOpen(false)}
                  style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid #e5e7eb", background: "#fff", fontSize: "13px", cursor: "pointer", color: "#374151", fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={saveMultiDates} disabled={!canSave}
                  style={{ padding: "8px 18px", borderRadius: "8px", border: "none", fontSize: "13px", cursor: canSave ? "pointer" : "not-allowed", fontWeight: 600, background: canSave ? "#0369a1" : "#e5e7eb", color: canSave ? "#fff" : "#9ca3af", transition: "background 0.15s" }}>
                  Add {multiDates.length > 0 ? multiDates.length : ""} Date{multiDates.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Portal target for react-datepicker — renders outside the grid so it can't disrupt layout */}
      <div id="datepicker-portal" />
    </>
  );
}
