import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../supabaseClient";
import JobsTable from "../../../components/JobsTable";
import AddJobModal from "../../../components/AddJobModal";

export default function CustomerJobs() {
  const { customerId } = useParams();
  const { profile }    = useAuth();
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [modal,   setModal]   = useState(false);

  const loadJobs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job")
      .select("job_id, title, description, town_city, postcode, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) setError("Failed to load jobs.");
    else setJobs(data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadJobs(); }, [customerId]);

  if (loading) return <p className="text-zinc-400 text-sm">Loading jobs…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Jobs</h2>
        <button onClick={() => setModal(true)} className="px-4 py-2 bg-sky-500 text-black font-semibold rounded-xl hover:bg-sky-400 transition text-sm">
          + Add Job
        </button>
      </div>

      <JobsTable jobs={jobs} showCustomer={false} emptyMessage="No jobs for this client yet." />

      <AddJobModal
        isOpen={modal}
        onClose={() => setModal(false)}
        onSaved={loadJobs}
        profile={profile}
        fixedCustomerId={customerId}
      />
    </div>
  );
}
