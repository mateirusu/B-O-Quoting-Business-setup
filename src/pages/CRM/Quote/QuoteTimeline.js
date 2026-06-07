import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../supabaseClient";

const STATUS_COLOURS = {
  Draft:    { bg: "rgba(113,113,122,0.15)", text: "#a1a1aa" },
  Sent:     { bg: "rgba(14,165,233,0.15)",  text: "#38bdf8" },
  Accepted: { bg: "rgba(52,211,153,0.15)",  text: "#34d399" },
  Declined: { bg: "rgba(248,113,113,0.15)", text: "#f87171" },
};

function StatusBadge({ status }) {
  const c = STATUS_COLOURS[status] || STATUS_COLOURS.Draft;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: 600,
      background: c.bg,
      color: c.text,
    }}>
      {status}
    </span>
  );
}

export default function QuoteTimeline() {
  const { quoteId } = useParams();
  const { profile } = useAuth();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quote_timeline")
      .select("timeline_id, status, notes, created_at, quote_file")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: false });
    if (error) { setError("Failed to load timeline."); setLoading(false); return; }
    setEntries(data ?? []);
    setLoading(false);
  }, [quoteId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-zinc-400 text-sm">Loading…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Timeline</h2>

      {entries.length === 0 ? (
        <p className="text-zinc-400 text-sm">No timeline entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 w-32">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {entries.map(e => (
                <tr key={e.timeline_id} className="hover:bg-zinc-800 transition">
                  <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-300" style={{ whiteSpace: "pre-wrap" }}>{e.notes || "—"}</td>
                  <td className="px-4 py-3">
                    {e.quote_file ? (
                      <a
                        href={e.quote_file}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 text-xs rounded-lg bg-sky-500 text-black font-semibold hover:bg-sky-400 transition"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
