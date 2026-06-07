import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import QuotesTable from "../../../components/QuotesTable";

export default function CustomerQuotes() {
  const { customerId } = useParams();
  const [quotes,  setQuotes]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const loadQuotes = async () => {
    setLoading(true);
    const { data: jobs, error: je } = await supabase
      .from("job")
      .select("job_id, title, address_line1, address_line2, town_city, county, postcode, country")
      .eq("customer_id", customerId);
    if (je) { setError("Failed to load quotes."); setLoading(false); return; }
    const jobIds = (jobs || []).map(j => j.job_id);
    if (!jobIds.length) { setQuotes([]); setLoading(false); return; }
    const jobMap = Object.fromEntries((jobs || []).map(j => [j.job_id, j]));
    const { data: links, error: le } = await supabase
      .from("job_quote_link")
      .select("quote_id, job_id, quote:quote_id(quote_id, title, status, created_at)")
      .in("job_id", jobIds);
    if (le) { setError("Failed to load quotes."); setLoading(false); return; }
    const normalised = (links || [])
      .map(l => ({ ...l.quote, job: jobMap[l.job_id] || null }))
      .filter(q => q.quote_id);
    setQuotes(normalised);
    setLoading(false);
  };

  useEffect(() => { loadQuotes(); }, [customerId]);

  if (loading) return <p className="text-zinc-400 text-sm">Loading quotes…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4">Quotes</h2>
      <QuotesTable quotes={quotes} showCustomer={false} showJob={true} emptyMessage="No quotes for this client yet." defaultStatus="All" />
    </div>
  );
}
