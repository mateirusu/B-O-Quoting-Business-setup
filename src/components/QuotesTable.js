import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const customerName = c =>
  [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unnamed";

const statusColour = s => {
  switch (s?.toLowerCase()) {
    case "accepted": return "text-emerald-400";
    case "rejected": return "text-red-400";
    case "sent":     return "text-sky-400";
    default:         return "text-zinc-400";
  }
};

const formatAddressParts = job => {
  if (!job) return [];
  return [
    [job.address_line1, job.address_line2].filter(Boolean).join(", "),
    [job.town_city, job.postcode].filter(Boolean).join(" "),
    job.county,
    job.country,
  ].filter(Boolean);
};

const STATUS_OPTIONS = ["All", "Draft", "Sent", "Accepted", "Rejected"];

export default function QuotesTable({
  quotes,
  showCustomer = true,
  showJob      = true,
  emptyMessage = "No quotes yet.",
}) {
  const navigate = useNavigate();

  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("Draft");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [filtersOpen,  setFiltersOpen]  = useState(false);

  const bubbleRef = useRef(null);
  const btnRef    = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (
        filtersOpen &&
        bubbleRef.current && !bubbleRef.current.contains(e.target) &&
        btnRef.current    && !btnRef.current.contains(e.target)
      ) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filtersOpen]);

  const hasNonDefaultFilters = statusFilter !== "Draft" || !!dateFrom || !!dateTo;

  const filtered = quotes.filter(q => {
    if (statusFilter !== "All") {
      const qs = q.status?.toLowerCase() || "draft";
      if (qs !== statusFilter.toLowerCase()) return false;
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (new Date(q.created_at) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(q.created_at) > to) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const match =
        q.title?.toLowerCase().includes(s) ||
        [q.customer?.first_name, q.customer?.last_name].filter(Boolean).join(" ").toLowerCase().includes(s) ||
        q.job?.title?.toLowerCase().includes(s) ||
        (q.status || "draft").toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div>
      {/* ── Search + filter bar ── */}
      <div style={{ position: "relative", marginBottom: "16px" }}>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search quotes…"
            className="flex-1 p-3 rounded-xl bg-zinc-950 text-white text-sm"
          />
          <button
            ref={btnRef}
            onClick={() => setFiltersOpen(p => !p)}
            style={{ position: "relative", flexShrink: 0 }}
            className={`px-4 py-3 rounded-xl text-sm font-semibold transition ${
              filtersOpen
                ? "bg-sky-500 text-black"
                : "bg-zinc-800 text-white hover:bg-zinc-700"
            }`}
          >
            Filters
            {hasNonDefaultFilters && (
              <span style={{
                position: "absolute", top: "-4px", right: "-4px",
                width: "8px", height: "8px", borderRadius: "50%",
                background: "#f87171",
              }} />
            )}
          </button>
        </div>

        {/* ── Filter bubble ── */}
        {filtersOpen && (
          <div
            ref={bubbleRef}
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              zIndex: 40,
              width: "300px",
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.65)",
              padding: "16px",
            }}
          >
            {/* Arrow pointing up to button */}
            <div style={{
              position: "absolute", top: "-8px", right: "38px",
              width: 0, height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderBottom: "8px solid #3f3f46",
            }} />
            <div style={{
              position: "absolute", top: "-7px", right: "39px",
              width: 0, height: 0,
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderBottom: "7px solid #18181b",
            }} />

            {/* Status filter */}
            <div style={{ marginBottom: "14px" }}>
              <p style={{
                fontSize: "11px", color: "#71717a", textTransform: "uppercase",
                fontWeight: 700, marginBottom: "8px", letterSpacing: "0.06em",
              }}>
                Status
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "none",
                      background: statusFilter === s ? "#0ea5e9" : "#27272a",
                      color: statusFilter === s ? "#000" : "#d4d4d8",
                      transition: "background 0.15s",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div style={{ marginBottom: "14px" }}>
              <p style={{
                fontSize: "11px", color: "#71717a", textTransform: "uppercase",
                fontWeight: 700, marginBottom: "8px", letterSpacing: "0.06em",
              }}>
                Created Date
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div>
                  <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: "10px",
                      background: "#09090b", border: "1px solid #3f3f46",
                      color: "#fff", fontSize: "13px", boxSizing: "border-box",
                      colorScheme: "dark",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: "10px",
                      background: "#09090b", border: "1px solid #3f3f46",
                      color: "#fff", fontSize: "13px", boxSizing: "border-box",
                      colorScheme: "dark",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: "10px", borderTop: "1px solid #27272a",
            }}>
              <button
                onClick={() => { setStatusFilter("Draft"); setDateFrom(""); setDateTo(""); }}
                style={{
                  fontSize: "12px", color: "#71717a", background: "none",
                  border: "none", cursor: "pointer", padding: 0,
                }}
                onMouseEnter={e => (e.target.style.color = "#fff")}
                onMouseLeave={e => (e.target.style.color = "#71717a")}
              >
                Reset to defaults
              </button>
              <button
                onClick={() => setFiltersOpen(false)}
                style={{
                  padding: "4px 14px", borderRadius: "10px",
                  background: "#0ea5e9", color: "#000",
                  fontSize: "12px", fontWeight: 700,
                  border: "none", cursor: "pointer",
                }}
                onMouseEnter={e => (e.target.style.background = "#38bdf8")}
                onMouseLeave={e => (e.target.style.background = "#0ea5e9")}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <p className="text-zinc-400 text-sm">
          {quotes.length === 0 ? emptyMessage : "No quotes match your filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Title</th>
                {showCustomer && <th className="px-4 py-3">Customer</th>}
                {showJob      && <th className="px-4 py-3">Job</th>}
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {filtered.map(q => {
                const addrParts = formatAddressParts(q.job);
                return (
                  <tr key={q.quote_id} className="hover:bg-zinc-800 transition">
                    <td className="px-4 py-3 text-white font-medium">{q.title || "Untitled"}</td>
                    {showCustomer && (
                      <td className="px-4 py-3 text-zinc-300">{customerName(q.customer)}</td>
                    )}
                    {showJob && (
                      <td className="px-4 py-3 text-zinc-300">{q.job?.title || "—"}</td>
                    )}
                    <td className="px-4 py-3 text-zinc-300">
                      {addrParts.length > 0 ? (
                        <div>
                          {addrParts.map((p, i) => (
                            <div key={i} style={{ fontSize: "12px", lineHeight: "1.5" }}>{p}</div>
                          ))}
                        </div>
                      ) : "—"}
                    </td>
                    <td className={`px-4 py-3 capitalize ${statusColour(q.status)}`}>
                      {q.status || "Draft"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {new Date(q.created_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => navigate(`/crm/quotes/${q.quote_id}`)}
                          className="px-3 py-1 text-xs rounded-lg bg-sky-500 text-black font-semibold hover:bg-sky-400 transition"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
