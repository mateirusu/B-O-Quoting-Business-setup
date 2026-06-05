import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../supabaseClient";
import ServiceQuoteLink from "./ServiceQuoteLink";

export default function QuoteServices() {
  const { quoteId } = useParams();
  const { profile } = useAuth();

  const [services, setServices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [modal,    setModal]    = useState(false);

  const loadServices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quote_service_link")
      .select("quote_service_link_id, quantity, task, service:service_id(service_id, title)")
      .eq("quote_id", quoteId)
      .order("created_at");
    if (error) { setError("Failed to load services."); setLoading(false); return; }
    setServices(data ?? []);
    setLoading(false);
  }, [quoteId]);

  useEffect(() => { loadServices(); }, [loadServices]);

  if (loading) return <p className="text-zinc-400 text-sm">Loading…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Services</h2>
        <button
          onClick={() => setModal(true)}
          className="px-4 py-2 bg-sky-500 text-black font-semibold rounded-xl hover:bg-sky-400 transition text-sm"
        >
          Edit Services
        </button>
      </div>

      {services.length === 0 ? (
        <p className="text-zinc-400 text-sm">No services linked to this quote yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3 w-28">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {services.map(s => (
                <tr key={s.quote_service_link_id} className="hover:bg-zinc-800 transition">
                  <td className="px-4 py-3 text-white font-medium">{s.service?.title || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{s.task || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{s.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ServiceQuoteLink
        isOpen={modal}
        onClose={() => setModal(false)}
        profile={profile}
        quoteId={quoteId}
        onSave={loadServices}
      />
    </div>
  );
}
