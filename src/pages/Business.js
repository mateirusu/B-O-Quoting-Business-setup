import { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

const empty = {
  business_name:        "",
  phone:                "",
  email:                "",
  website:              "",
  business_first_line:  "",
  business_second_line: "",
  business_towncity:    "",
  business_county:      "",
  business_country:     "",
  business_postcode:    "",
  vat_registered:       false,
  vat_number:           "",
  company_reg_number:   "",
};

const SECTION_KEYS = {
  name:    ["business_name"],
  contact: ["phone", "email", "website"],
  address: ["business_first_line", "business_second_line", "business_towncity", "business_county", "business_country", "business_postcode"],
  legal:   ["vat_registered", "vat_number", "company_reg_number"],
};

export default function Business() {
  const { profile } = useAuth();

  const [fields, setFields]     = useState(empty);
  const [original, setOriginal] = useState(empty);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [open, setOpen] = useState({ contact: false, address: false, legal: false });

  // Per-section save state
  const [sectionSaving, setSectionSaving] = useState({ name: false, contact: false, address: false, legal: false });
  const [sectionMsg,    setSectionMsg]    = useState({ name: null,  contact: null,  address: null,  legal: null  });
  const [sectionErr,    setSectionErr]    = useState({ name: null,  contact: null,  address: null,  legal: null  });

  // Address view: 'lookup' | 'form' | 'display'
  const [addressView,   setAddressView]   = useState("lookup");
  const [searchQuery,   setSearchQuery]   = useState("");
  const [addrResults,   setAddrResults]   = useState([]);
  const [addrSearching, setAddrSearching] = useState(false);
  const [addrSearchErr, setAddrSearchErr] = useState(null);
  const textDebounce = useRef(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.business_id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("business")
        .select("*")
        .eq("business_id", profile.business_id)
        .maybeSingle();

      if (error) { setLoadError("Failed to load business details."); setLoading(false); return; }

      const loaded = {
        business_name:        data?.business_name        ?? "",
        phone:                data?.phone                ?? "",
        email:                data?.email                ?? "",
        website:              data?.website              ?? "",
        business_first_line:  data?.business_first_line  ?? "",
        business_second_line: data?.business_second_line ?? "",
        business_towncity:    data?.business_towncity    ?? "",
        business_county:      data?.business_county      ?? "",
        business_country:     data?.business_country     ?? "",
        business_postcode:    data?.business_postcode    ?? "",
        vat_registered:       data?.vat_registered       ?? false,
        vat_number:           data?.vat_number           ?? "",
        company_reg_number:   data?.company_reg_number   ?? "",
      };

      setFields(loaded);
      setOriginal(loaded);
      // If address already saved, go straight to display view
      const hasAddr = !!(loaded.business_first_line || loaded.business_postcode);
      setAddressView(hasAddr ? "display" : "lookup");
      setLoading(false);
    })();
  }, [profile?.business_id]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const handleChange = (key, value) => setFields(prev => ({ ...prev, [key]: value }));

  const toggle = key => setOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const isSectionDirty = section =>
    SECTION_KEYS[section].some(k => fields[k] !== original[k]);

  const cancelSection = section => {
    setFields(prev => {
      const reset = { ...prev };
      SECTION_KEYS[section].forEach(k => { reset[k] = original[k]; });
      return reset;
    });
    setSectionMsg(prev => ({ ...prev, [section]: null }));
    setSectionErr(prev => ({ ...prev, [section]: null }));
  };

  const saveSection = async section => {
    setSectionSaving(prev => ({ ...prev, [section]: true }));
    setSectionMsg(prev => ({ ...prev, [section]: null }));
    setSectionErr(prev => ({ ...prev, [section]: null }));
    try {
      const update = {};
      SECTION_KEYS[section].forEach(k => {
        if (k === "vat_registered") update[k] = !!fields[k];
        else update[k] = fields[k] || (k === "business_name" ? "" : null);
      });
      const { data: rows, error } = await supabase
        .from("business")
        .update(update)
        .eq("business_id", profile.business_id)
        .select();
      if (error) throw error;
      if (!rows?.length) throw new Error(`No record updated — business_id: ${profile.business_id}`);
      setOriginal(prev => ({ ...prev, ...update }));
      setSectionMsg(prev => ({ ...prev, [section]: "Saved successfully." }));
      if (section === "address") {
        const hasAddr = !!(fields.business_first_line || fields.business_postcode);
        setAddressView(hasAddr ? "display" : "lookup");
      }
    } catch (err) {
      setSectionErr(prev => ({ ...prev, [section]: err.message || "Failed to save." }));
    } finally {
      setSectionSaving(prev => ({ ...prev, [section]: false }));
    }
  };

  // ── Address lookup ────────────────────────────────────────────────────────
  const UK_POSTCODE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i;

  // Normalise any source into { line1, line2, city, county, country, postcode }
  const fromGetAddress = (a, postcode) => ({
    line1:    a.line_1 || "",
    line2:    a.line_2 || "",
    city:     a.town_or_city || "",
    county:   a.county || "",
    country:  a.country || "United Kingdom",
    postcode: postcode || "",
  });

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

  const runSearch = async query => {
    if (!query.trim()) return;
    setAddrSearching(true);
    setAddrResults([]);
    setAddrSearchErr(null);
    try {
      const q          = query.trim();
      const isPostcode = UK_POSTCODE.test(q);

      if (isPostcode) {
        // Proxy through Supabase edge function (avoids CORS + keeps API key server-side)
        const { data: fnData, error: fnErr } = await supabase.functions.invoke("get-addresses", {
          body: { postcode: q.trim().toUpperCase() },
        });
        if (fnErr || fnData?.error) {
          const msg = fnData?.error || fnErr?.message || "Address lookup failed.";
          setAddrSearchErr(`${msg} Enter your address manually.`);
          return;
        }
        // Full address list from getaddress.io
        if (fnData?.addresses?.length) {
          setAddrResults(fnData.addresses);
          return;
        }
        setAddrSearchErr("No addresses found for this postcode.");
      } else {
        // Free-text search via Nominatim
        const url = isPostcode
          ? `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(q.trim().replace(/\s+/g, "").toUpperCase())}&countrycodes=gb&format=json&addressdetails=1&limit=20`
          : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=gb&format=json&addressdetails=1&limit=15`;
        const res  = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        if (!data.length) {
          setAddrSearchErr("No addresses found. Try a different search or enter manually.");
          return;
        }
        setAddrResults(data.map(fromNominatim));
      }
    } catch {
      setAddrSearchErr("Could not reach the address service. Please enter manually.");
    } finally {
      setAddrSearching(false);
    }
  };

  const handleSearchInput = value => {
    setSearchQuery(value);
    setAddrResults([]);
    setAddrSearchErr(null);
    clearTimeout(textDebounce.current);
    if (value.trim().length < 4) return;
    textDebounce.current = setTimeout(() => runSearch(value), 500);
  };

  const formatResult = r =>
    [r.line1, r.line2, r.city, r.postcode].filter(Boolean).join(", ");

  const selectAddress = async result => {
    setAddrResults([]);

    const addr = {
      business_first_line:  result.line1  || null,
      business_second_line: result.line2  || null,
      business_towncity:    result.city   || null,
      business_county:      result.county || null,
      business_country:     result.country|| null,
      business_postcode:    result.postcode|| null,
    };

    setFields(prev => ({ ...prev, ...addr }));
    setSectionMsg(prev => ({ ...prev, address: null }));
    setSectionErr(prev => ({ ...prev, address: null }));

    const { data: rows, error } = await supabase
      .from("business")
      .update(addr)
      .eq("business_id", profile.business_id)
      .select();

    if (error) {
      setSectionErr(prev => ({ ...prev, address: error.message || "Failed to save address." }));
      setAddressView("form");
    } else if (!rows?.length) {
      setSectionErr(prev => ({ ...prev, address: `No record found for business_id: ${profile.business_id}` }));
      setAddressView("form");
    } else {
      setOriginal(prev => ({ ...prev, ...addr }));
      setAddressView("display");
    }
  };

  const changeAddress = () => {
    setAddressView("lookup");
    setSearchQuery("");
    setAddrResults([]);
    setAddrSearchErr(null);
  };

  // ── Section footer (save / cancel / feedback) ─────────────────────────────
  const SectionFooter = ({ section, showSave }) => (
    <>
      {sectionMsg[section] && (
        <p className="text-emerald-400 text-sm text-right mt-3">{sectionMsg[section]}</p>
      )}
      {sectionErr[section] && (
        <p className="text-red-400 text-sm text-right mt-3">{sectionErr[section]}</p>
      )}
      {showSave && isSectionDirty(section) && (
        <div className="flex justify-end gap-4 pt-4 border-t border-zinc-800 mt-4">
          <button
            onClick={() => cancelSection(section)}
            disabled={sectionSaving[section]}
            className="px-4 py-2 border border-zinc-600 rounded-xl text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => saveSection(section)}
            disabled={sectionSaving[section]}
            className="px-4 py-2 bg-sky-400 text-black rounded-xl font-bold hover:bg-sky-300 disabled:opacity-50"
          >
            {sectionSaving[section] ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </>
  );

  if (loading) return <div className="text-zinc-400">Loading business details…</div>;
  if (loadError) return <div className="text-red-400">{loadError}</div>;

  return (
    <div className="space-y-6">

      {/* ── Business Name ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-sm text-zinc-300 mb-2">
              Business Name <span className="text-red-400">*</span>
            </h3>
            <input
              value={fields.business_name}
              onChange={e => handleChange("business_name", e.target.value)}
              className="w-full rounded-xl bg-zinc-950 p-3 text-white"
              placeholder="Your business name"
            />
          </div>
          <SectionFooter section="name" showSave />
        </div>
      </div>

      {/* ── Contact ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer" onClick={() => toggle("contact")}>
          <h2 className="text-2xl font-bold">Contact</h2>
          <span className="text-sky-400">{open.contact ? "▲" : "▼"}</span>
        </div>
        {open.contact && (
          <div className="border-t border-zinc-800 p-5 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm text-zinc-300 mb-2">Phone</h3>
                <input value={fields.phone} onChange={e => handleChange("phone", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="+44 7700 000000" />
              </div>
              <div>
                <h3 className="text-sm text-zinc-300 mb-2">Email</h3>
                <input type="email" value={fields.email} onChange={e => handleChange("email", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="hello@yourbusiness.com" />
              </div>
            </div>
            <div>
              <h3 className="text-sm text-zinc-300 mb-2">Website</h3>
              <input value={fields.website} onChange={e => handleChange("website", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="https://www.yourbusiness.com" />
            </div>
            <SectionFooter section="contact" showSave />
          </div>
        )}
      </div>

      {/* ── Address ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer" onClick={() => toggle("address")}>
          <h2 className="text-2xl font-bold">Address</h2>
          <span className="text-sky-400">{open.address ? "▲" : "▼"}</span>
        </div>
        {open.address && (
          <div className="border-t border-zinc-800 p-5 space-y-4">

            {/* DISPLAY: saved address */}
            {addressView === "display" && (
              <>
                <div className="bg-zinc-950 rounded-xl p-4 text-sm text-zinc-200 space-y-0.5">
                  {original.business_first_line  && <p>{original.business_first_line}</p>}
                  {original.business_second_line && <p>{original.business_second_line}</p>}
                  {(original.business_towncity || original.business_postcode) && (
                    <p>{[original.business_towncity, original.business_postcode].filter(Boolean).join(", ")}</p>
                  )}
                  {original.business_county  && <p>{original.business_county}</p>}
                  {original.business_country && <p>{original.business_country}</p>}
                </div>
                <button onClick={changeAddress} className="text-sky-400 text-sm hover:underline">
                  Change address
                </button>
              </>
            )}

            {/* LOOKUP: single combined search field */}
            {addressView === "lookup" && (
              <>
                <div>
                  <h3 className="text-sm text-zinc-300 mb-2">Search by postcode or address</h3>
                  <div className="flex gap-2">
                    <input
                      value={searchQuery}
                      onChange={e => handleSearchInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && runSearch(searchQuery)}
                      className="flex-1 p-3 rounded-xl bg-zinc-950 text-white"
                      placeholder="e.g. SW1A 2AA or 1 Windsor Road"
                      autoFocus
                    />
                    <button
                      onClick={() => runSearch(searchQuery)}
                      disabled={addrSearching || !searchQuery.trim()}
                      className="px-6 py-2 bg-sky-400 text-black rounded-xl font-bold disabled:opacity-40 whitespace-nowrap"
                    >
                      {addrSearching ? "Searching…" : "Search"}
                    </button>
                  </div>
                </div>

                {addrSearching && <p className="text-sm text-zinc-400">Searching…</p>}
                {addrSearchErr  && <p className="text-sm text-red-400">{addrSearchErr}</p>}

                {addrResults.length > 0 && (
                  <div className="rounded-xl border border-zinc-700 overflow-hidden max-h-72 overflow-y-auto">
                    {addrResults.map((r, i) => (
                      <div
                        key={i}
                        onClick={() => selectAddress(r)}
                        className="px-4 py-2 hover:bg-zinc-700 cursor-pointer border-b border-zinc-700 last:border-b-0"
                      >
                        <p className="text-xs text-white">{formatResult(r)}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button onClick={() => setAddressView("form")} className="text-sky-400 text-sm hover:underline">
                    Can't find your address? Enter it manually
                  </button>
                  {(original.business_first_line || original.business_postcode) && (
                    <button onClick={() => setAddressView("display")} className="text-zinc-500 text-sm hover:underline">
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}

            {/* FORM: editable address fields */}
            {addressView === "form" && (
              <>
                <div>
                  <h3 className="text-sm text-zinc-300 mb-2">Address Line 1</h3>
                  <input value={fields.business_first_line} onChange={e => handleChange("business_first_line", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Street address" />
                </div>
                <div>
                  <h3 className="text-sm text-zinc-300 mb-2">Address Line 2</h3>
                  <input value={fields.business_second_line} onChange={e => handleChange("business_second_line", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Optional" />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Town / City</h3>
                    <input value={fields.business_towncity} onChange={e => handleChange("business_towncity", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="London" />
                  </div>
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">County</h3>
                    <input value={fields.business_county} onChange={e => handleChange("business_county", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="Greater London" />
                  </div>
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Postcode</h3>
                    <input value={fields.business_postcode} onChange={e => handleChange("business_postcode", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="SW1A 1AA" />
                  </div>
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Country</h3>
                    <input value={fields.business_country} onChange={e => handleChange("business_country", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="United Kingdom" />
                  </div>
                </div>
                <button onClick={() => setAddressView("lookup")} className="text-sky-400 text-sm hover:underline">
                  ← Back to search
                </button>
              </>
            )}

            {/* Only show Save when in form/lookup-with-changes mode */}
            {addressView !== "display" && (
              <SectionFooter section="address" showSave={addressView === "form"} />
            )}
          </div>
        )}
      </div>

      {/* ── Legal ── */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer" onClick={() => toggle("legal")}>
          <h2 className="text-2xl font-bold">Legal</h2>
          <span className="text-sky-400">{open.legal ? "▲" : "▼"}</span>
        </div>
        {open.legal && (
          <div className="border-t border-zinc-800 p-5 space-y-4">
            <div>
              <h3 className="text-sm text-zinc-300 mb-3">VAT Registered</h3>
              <div className="flex gap-3">
                <button
                  onClick={() => handleChange("vat_registered", true)}
                  className={`px-5 py-2 rounded-xl font-semibold text-sm transition ${fields.vat_registered ? "bg-sky-400 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
                >
                  Yes
                </button>
                <button
                  onClick={() => handleChange("vat_registered", false)}
                  className={`px-5 py-2 rounded-xl font-semibold text-sm transition ${!fields.vat_registered ? "bg-sky-400 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
                >
                  No
                </button>
              </div>
            </div>
            {fields.vat_registered && (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm text-zinc-300 mb-2">VAT Number</h3>
                  <input value={fields.vat_number} onChange={e => handleChange("vat_number", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="GB 123 4567 89" />
                </div>
                <div>
                  <h3 className="text-sm text-zinc-300 mb-2">Company Registration Number</h3>
                  <input value={fields.company_reg_number} onChange={e => handleChange("company_reg_number", e.target.value)} className="w-full p-3 rounded-xl bg-zinc-950 text-white" placeholder="12345678" />
                </div>
              </div>
            )}
            <SectionFooter section="legal" showSave />
          </div>
        )}
      </div>

    </div>
  );
}
