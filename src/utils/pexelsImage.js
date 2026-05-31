import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabaseClient';

export const fetchPexelsImage = async (query, page = 1) => {
  if (!query?.trim()) return null;

  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-pexels-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ query: query.trim(), page }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.url ?? null;
};
