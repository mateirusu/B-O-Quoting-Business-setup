import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import QuotesTable from "../../../components/QuotesTable";

export default function JobQuotes() {
  const { jobId }  = useParams();
  const [quotes,  setQuotes]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const loadQuotes = async () => {
    setLoading(true);
    const { data: links, error: le } = await supabase
      .from("job_quote_link")
      .select(`
        quote:quote_id(quote_id, title, status, created_at),
        job:job_id(job_id, title, address_line1, address_line2, town_city, county, postcode, country)
      `)
      .eq("job_id", jobId);
    if (le) { setError("Failed to load quotes."); setLoading(false); return; }
    setQuotes(
      (links || [])
        .filter(l => l.quote)
        .map(l => ({ ...l.quote, job: l.job || null }))
    );
    setLoading(false);
  };

  useEffect(() => { loadQuotes(); }, [jobId]);

  if (loading) return <p className="text-zinc-400 text-sm">Loading quotes…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4">Quotes</h2>
      <QuotesTable quotes={quotes} showCustomer={false} showJob={false} emptyMessage="No quotes for this job yet." />
    </div>
  );
}
