import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../supabaseClient";
import JobsTable from "../../../components/JobsTable";
import AddJobModal from "../../../components/AddJobModal";

export default function Jobs() {
  const { profile } = useAuth();
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [search,  setSearch]  = useState("");
  const [modal,   setModal]   = useState(false);

  const loadJobs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job")
      .select("job_id, title, description, town_city, postcode, created_at, customer:customer_id(customer_id, first_name, last_name)")
      .order("created_at", { ascending: false });
    if (error) setError("Failed to load jobs.");
    else setJobs(data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadJobs(); }, [profile?.business_id]);

  const customerName = c =>
    [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unnamed";

  if (loading) return <p className="text-zinc-400 text-sm">Loading jobs…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  const q = search.toLowerCase();
  const filtered = q
    ? jobs.filter(j =>
        j.title?.toLowerCase().includes(q) ||
        customerName(j.customer).toLowerCase().includes(q) ||
        j.town_city?.toLowerCase().includes(q) ||
        j.postcode?.toLowerCase().includes(q)
      )
    : jobs;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Jobs</h2>
        <button onClick={() => setModal(true)} className="px-4 py-2 bg-sky-500 text-black font-semibold rounded-xl hover:bg-sky-400 transition text-sm">
          + Add Job
        </button>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, customer, town or postcode…"
          className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
        />
      </div>

      {jobs.length === 0 ? (
        <p className="text-zinc-400 text-sm">No jobs yet. Add your first one.</p>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-400 text-sm">No jobs match your search.</p>
      ) : (
        <JobsTable jobs={filtered} showCustomer={true} />
      )}

      <AddJobModal
        isOpen={modal}
        onClose={() => setModal(false)}
        onSaved={loadJobs}
        profile={profile}
      />
    </div>
  );
}
