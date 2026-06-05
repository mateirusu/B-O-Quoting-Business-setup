import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient";
import QuotesTable from "../../../components/QuotesTable";

export default function Quotes() {
  const [quotes,  setQuotes]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const loadQuotes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quote")
      .select(`
        quote_id, title, status, created_at,
        job_quote_link(
          job_id,
          job:job_id(
            job_id, title,
            address_line1, address_line2, town_city, county, postcode, country,
            customer:customer_id(customer_id, first_name, last_name)
          )
        )
      `)
      .order("created_at", { ascending: false });
    if (error) { setError("Failed to load quotes."); setLoading(false); return; }
    const normalised = (data ?? []).map(q => {
      const link = q.job_quote_link?.[0];
      return {
        quote_id:   q.quote_id,
        title:      q.title,
        status:     q.status,
        created_at: q.created_at,
        job:        link?.job     || null,
        customer:   link?.job?.customer || null,
      };
    });
    setQuotes(normalised);
    setLoading(false);
  };

  useEffect(() => { loadQuotes(); }, []);

  if (loading) return <p className="text-zinc-400 text-sm">Loading quotes…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4">Quotes</h2>
      <QuotesTable quotes={quotes} showCustomer={true} showJob={true} emptyMessage="No quotes yet." />
    </div>
  );
}
