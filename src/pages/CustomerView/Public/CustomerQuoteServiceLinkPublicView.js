import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../supabaseClient";

export default function CustomerQuoteServiceLinkPublicView({
  publicToken,
  initialServices = [], // [{ title, task, quantity }] — no IDs
  onClose,
  onSaved,  // (hasCustom: boolean) => void
  inline = false,
}) {
  const [rows, setRows]               = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const nextId       = useRef(1000);
  const originalTasks = useRef({}); // id → original task text

  useEffect(() => {
    const initial = initialServices.map((sv, i) => ({
      id:          i,
      name:        sv.title || "",
      task:        sv.task  || "",
      quantity:    String(sv.quantity || 1),
      serviceType: sv.service_type || null,
    }));
    setRows(initial);
    const origMap = {};
    initial.forEach(r => { origMap[r.id] = r.task; });
    originalTasks.current = origMap;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error: e } = await supabase.functions.invoke("amend-public-quote", {
        body: { public_token: publicToken, action: "get_services" },
      });
      if (!e && data?.services) setAllServices(data.services);
      setLoading(false);
    })();
  }, [publicToken]);

  useEffect(() => {
    const handler = e => {
      if (activeDropdown !== null && !e.target.closest(".cqsl-drop")) {
        setActiveDropdown(null);
        setDropdownSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeDropdown]);

  const addRow = () => {
    setRows(prev => [...prev, { id: nextId.current++, name: "", task: "", quantity: "1", serviceType: null }]);
  };
  const removeRow = id => setRows(prev => prev.filter(r => r.id !== id));
  const updateRow = (id, field, value) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const handleNameChange = (id, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, name: value } : r));
    setActiveDropdown(id);
    setDropdownSearch(value);
  };
  const selectService = (rowId, svc) => {
    const newTask = svc.description || "";
    setRows(prev => prev.map(r => r.id === rowId ? {
      ...r,
      name: svc.title,
      task: newTask,
    } : r));
    originalTasks.current = { ...originalTasks.current, [rowId]: newTask };
    setActiveDropdown(null);
    setDropdownSearch("");
  };
  const filteredServices = (rowId, search) => {
    const usedNames = rows.filter(r => r.id !== rowId && r.name).map(r => r.name.toLowerCase());
    return allServices
      .filter(s => !usedNames.includes(s.title.toLowerCase()) &&
        s.title.toLowerCase().includes((search || "").toLowerCase()))
      .slice(0, 8);
  };

  const handleSave = async () => {
    const validRows = rows.filter(r => r.name.trim());
    if (validRows.length === 0) { setError("Please add at least one service."); return; }
    setSaving(true);
    setError(null);
    const services = validRows.map(r => ({
      name:          r.name.trim(),
      task:          r.task.trim(),
      quantity:      Math.max(1, parseInt(r.quantity) || 1),
      task_modified: r.task.trim() !== (originalTasks.current[r.id] ?? "").trim(),
    }));
    const { data, error: e } = await supabase.functions.invoke("amend-public-quote", {
      body: { public_token: publicToken, action: "save", services },
    });
    setSaving(false);
    if (e || data?.error) {
      setError(data?.error || e?.message || "Failed to save. Please try again.");
      return;
    }
    onSaved(data.has_custom);
  };

  const th = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: "11px",
    fontWeight: 700,
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "1px solid rgba(255,255,255,0.09)",
    background: "#111e33",
  };
  const cellInput = {
    width: "100%",
    padding: "7px 10px",
    borderRadius: "6px",
    fontSize: "13px",
    border: "1px solid rgba(255,255,255,0.09)",
    outline: "none",
    boxSizing: "border-box",
    background: "rgba(2,6,15,0.8)",
    color: "#f4f4f5",
  };

  const infoBanner = (
    <div style={{
      padding: inline ? "12px 0" : "12px 24px",
      background: "rgba(251,191,36,0.08)",
      borderBottom: inline ? "none" : "1px solid rgba(251,191,36,0.25)",
      borderRadius: inline ? "6px" : 0,
      marginBottom: inline ? "16px" : 0,
    }}>
      <p style={{ margin: 0, fontSize: "13px", color: "#fbbf24" }}>
        <strong>Tip:</strong> Search for a service using the Service field. Can't find what you need? Type your own description — our team will review it and get back to you with a price.
      </p>
    </div>
  );

  const tableArea = (
    <div className="amend-table-scroll" style={{ overflowY: "auto", maxHeight: inline ? "340px" : undefined, padding: inline ? "0" : "16px 24px", flex: inline ? undefined : "1 1 0" }}>
      {loading ? (
        <p style={{ textAlign: "center", color: "#71717a", padding: "32px 0", margin: 0 }}>
          Loading available services…
        </p>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <colgroup>
              <col style={{ width: "35%" }} />
              <col />
              <col style={{ width: "72px" }} />
              <col style={{ width: "44px" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Service</th>
                <th style={th}>Task</th>
                <th style={{ ...th, textAlign: "center" }}>Qty</th>
                <th style={{ ...th, textAlign: "center" }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isCustom = !!(row.name.trim() && !allServices.some(s => s.title.toLowerCase() === row.name.trim().toLowerCase()));
                const filtered = activeDropdown === row.id
                  ? filteredServices(row.id, dropdownSearch)
                  : [];
                const showDrop = activeDropdown === row.id &&
                  (dropdownSearch || row.name) &&
                  filtered.length > 0;

                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #111e33" }}>
                    <td style={{ padding: "8px 12px 8px 0", position: "relative", verticalAlign: "top" }}
                      className="cqsl-drop">
                      <input
                        type="text"
                        value={row.name}
                        onChange={e => handleNameChange(row.id, e.target.value)}
                        onFocus={() => { setActiveDropdown(row.id); setDropdownSearch(row.name); }}
                        placeholder="Search or type a service…"
                        style={{
                          ...cellInput,
                          border: `1px solid ${isCustom ? "#fbbf24" : "rgba(255,255,255,0.09)"}`,
                          background: isCustom ? "rgba(251,191,36,0.08)" : "rgba(2,6,15,0.8)",
                          color: "#f4f4f5",
                          cursor: "text",
                        }}
                      />
                      {isCustom && (
                        <span style={{ display: "block", marginTop: "3px", fontSize: "11px", color: "#fbbf24", fontWeight: 600 }}>
                          Custom — team will review &amp; price
                        </span>
                      )}
                      {showDrop && (
                        <div style={{
                          position: "absolute", zIndex: 50,
                          top: "calc(100% - 4px)", left: 0, right: 0,
                          background: "#0e1729", border: "1px solid rgba(255,255,255,0.09)",
                          borderRadius: "6px", boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                          maxHeight: "200px", overflowY: "auto",
                        }}>
                          {filtered.map(s => (
                            <div
                              key={s.title}
                              onMouseDown={e => { e.preventDefault(); selectService(row.id, s); }}
                              style={{ padding: "9px 12px", cursor: "pointer", fontSize: "13px", borderBottom: "1px solid #111e33", color: "#f4f4f5" }}
                              onMouseEnter={e => e.currentTarget.style.background = "#111e33"}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                            >
                              {s.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
                      <textarea
                        value={row.task}
                        ref={el => {
                          if (el) {
                            el.style.height = "auto";
                            el.style.height = el.scrollHeight + "px";
                          }
                        }}
                        onChange={e => {
                          updateRow(row.id, "task", e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
                        }}
                        placeholder="Special requests or task description…"
                        rows={1}
                        style={{
                          ...cellInput,
                          resize: "none",
                          overflow: "hidden",
                          lineHeight: "1.4",
                          cursor: "text",
                        }}
                      />
                    </td>
                    <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>
                      <input
                        type="text"
                        value={row.quantity}
                        onChange={e => updateRow(row.id, "quantity", e.target.value.replace(/[^0-9]/g, ""))}
                        style={{ ...cellInput, textAlign: "center", width: "56px" }}
                      />
                    </td>
                    <td style={{ padding: "8px 0", verticalAlign: "top", textAlign: "center" }}>
                      <button
                        onClick={() => removeRow(row.id)}
                        style={{
                          width: "28px", height: "28px", borderRadius: "6px",
                          border: "none", background: "rgba(248,113,113,0.12)", color: "#f87171",
                          cursor: "pointer", fontSize: "14px", fontWeight: 700,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                        }}
                        title="Remove service"
                      >✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button
            onClick={addRow}
            style={{
              marginTop: "12px", padding: "8px 16px",
              background: "#111e33", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: "6px", fontSize: "13px",
              cursor: "pointer", color: "#a1a1aa",
            }}
          >
            + Add Service
          </button>
        </>
      )}
    </div>
  );

  const footer = (
    <div style={{
      paddingTop: "16px",
      borderTop: "1px solid rgba(255,255,255,0.09)",
      marginTop: "16px",
      display: "flex",
      justifyContent: "flex-end",
      gap: "10px",
      ...(inline ? {} : { padding: "16px 24px", flexShrink: 0 }),
    }}>
      <button
        onClick={onClose}
        disabled={saving}
        style={{
          padding: "9px 20px", borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.09)", background: "#111e33",
          fontSize: "14px", cursor: "pointer", color: "#a1a1aa",
        }}
      >
        Cancel
      </button>
      <button
        onClick={handleSave}
        disabled={saving || loading}
        style={{
          padding: "9px 22px", borderRadius: "6px", border: "none",
          background: saving ? "rgba(217,119,6,0.6)" : "#d97706",
          color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer",
        }}
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );

  // ── Inline mode ──────────────────────────────────────────────────────────────
  if (inline) {
    return (
      <>
        {error && (
          <div style={{
            marginBottom: "12px", padding: "10px 14px",
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)",
            borderRadius: "6px", color: "#f87171", fontSize: "13px",
          }}>
            {error}
          </div>
        )}
        {infoBanner}
        {tableArea}
        {footer}
      </>
    );
  }

  // ── Modal mode ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#0e1729", borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.09)",
        width: "100%", maxWidth: "780px",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.09)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: "16px", margin: "0 0 3px", color: "#f4f4f5" }}>Amend Quote</p>
              <p style={{ fontSize: "13px", color: "#71717a", margin: 0 }}>
                Add, remove or adjust services before responding.
              </p>
            </div>
            <button onClick={onClose} style={{
              background: "none", border: "none", fontSize: "22px",
              color: "#71717a", cursor: "pointer", lineHeight: 1, padding: "2px 4px",
            }}>×</button>
          </div>
          {error && (
            <div style={{
              marginTop: "12px", padding: "10px 14px",
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: "6px", color: "#f87171", fontSize: "13px",
            }}>
              {error}
            </div>
          )}
        </div>

        {infoBanner}
        {tableArea}
        {footer}
      </div>
    </div>
  );
}
