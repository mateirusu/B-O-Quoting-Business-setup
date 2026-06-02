import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function CustomerJobs() {
  const { customerId } = useParams();
  const [jobs, setJobs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("job")
        .select("job_id, title, description, town_city, postcode, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) setError("Failed to load jobs.");
      else setJobs(data ?? []);
      setLoading(false);
    })();
  }, [customerId]);

  if (loading) return <p className="text-zinc-400 text-sm">Loading jobs…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  const q = search.toLowerCase();
  const filtered = q
    ? jobs.filter(j =>
        j.title?.toLowerCase().includes(q) ||
        j.town_city?.toLowerCase().includes(q) ||
        j.postcode?.toLowerCase().includes(q)
      )
    : jobs;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Jobs</h2>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, town or postcode…"
          className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
        />
      </div>

      {jobs.length === 0 ? (
        <p className="text-zinc-400 text-sm">No jobs for this client yet.</p>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-400 text-sm">No jobs match your search.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Town / City</th>
                <th className="px-4 py-3">Postcode</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {filtered.map(j => (
                <tr key={j.job_id} className="hover:bg-zinc-800 transition">
                  <td className="px-4 py-3 text-white font-medium">{j.title}</td>
                  <td className="px-4 py-3 text-zinc-300">{j.town_city || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{j.postcode  || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{new Date(j.created_at).toLocaleDateString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
