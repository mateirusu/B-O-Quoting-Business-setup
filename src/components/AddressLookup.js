import { useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const UK_POSTCODE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i;

const fromNominatim = r => {
  const a = r.address || {};
  return {
    line1:    [a.house_number, a.road].filter(Boolean).join(" ") || r.display_name?.split(",")[0] || "",
    line2:    a.suburb || a.neighbourhood || a.quarter || "",
    city:     a.city || a.town || a.village || a.municipality || "",
    county:   a.county || a.state_district || "",
    country:  a.country || "United Kingdom",
    postcode: a.postcode || "",
  };
};

const formatResult = r =>
  [r.line1, r.line2, r.city, r.postcode].filter(Boolean).join(", ");

/**
 * Reusable postcode / address lookup component.
 *
 * Props:
 *   onSelect(result)   – called with { line1, line2, city, county, country, postcode }
 *   onManualEntry()    – optional; shows "Enter manually" link when provided
 */
export default function AddressLookup({ onSelect, onManualEntry }) {
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [error,     setError]     = useState(null);
  const debounce = useRef(null);

  const runSearch = async q => {
    q = q.trim();
    if (!q) return;
    setSearching(true);
    setResults([]);
    setError(null);
    try {
      if (UK_POSTCODE.test(q)) {
        const { data, error: fnErr } = await supabase.functions.invoke("get-addresses", {
          body: { postcode: q.toUpperCase() },
        });
        if (fnErr || data?.error) {
          setError(`${data?.error || fnErr?.message || "Lookup failed."} Enter address manually.`);
          return;
        }
        if (data?.addresses?.length) { setResults(data.addresses); return; }
        setError("No addresses found for this postcode.");
      } else {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=gb&format=json&addressdetails=1&limit=15`;
        const res  = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        if (!data.length) { setError("No addresses found. Try a different search."); return; }
        setResults(data.map(fromNominatim));
      }
    } catch {
      setError("Could not reach address service. Enter address manually.");
    } finally {
      setSearching(false);
    }
  };

  const handleInput = v => {
    setQuery(v);
    setResults([]);
    setError(null);
    clearTimeout(debounce.current);
    if (v.trim().length < 4) return;
    debounce.current = setTimeout(() => runSearch(v), 500);
  };

  const pick = r => {
    setResults([]);
    setQuery("");
    setError(null);
    onSelect(r);
  };

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={e => handleInput(e.target.value)}
        onKeyDown={e => e.key === "Enter" && runSearch(query)}
        className="w-full p-3 rounded-xl bg-zinc-950 text-white text-sm"
        placeholder="Search by postcode or address"
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      {results.length > 0 && (
        <div className="rounded-xl border border-zinc-700 overflow-hidden max-h-48 overflow-y-auto">
          {results.map((r, i) => (
            <div
              key={i}
              onClick={() => pick(r)}
              className="px-3 py-2 hover:bg-zinc-700 cursor-pointer border-b border-zinc-700 last:border-b-0"
            >
              <p className="text-xs text-white">{formatResult(r)}</p>
            </div>
          ))}
        </div>
      )}

      {onManualEntry && (
        <button onClick={onManualEntry} className="text-sky-400 text-xs hover:underline">
          Can't find your address? Enter it manually
        </button>
      )}
    </div>
  );
}
