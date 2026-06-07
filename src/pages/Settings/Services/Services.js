import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../supabaseClient";
import ServiceForm from "./ServiceForm";

export default function Services() {
  const { profile, loading: authLoading } = useAuth();

  // Filters
  const [search,            setSearch]            = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("Reusable");
  const [dateFrom,          setDateFrom]          = useState("");
  const [dateTo,            setDateTo]            = useState("");
  const [filterCustomer,    setFilterCustomer]    = useState("");
  const [filterJob,         setFilterJob]         = useState("");
  const [filterAddress,     setFilterAddress]     = useState("");
  const [filterQuote,       setFilterQuote]       = useState("");
  const [filtersOpen,       setFiltersOpen]       = useState(false);

  // Data
  const [services,               setServices]               = useState([]);
  const [serviceContexts,        setServiceContexts]        = useState({});
  const [loading,                setLoading]                = useState(true);
  const [error,                  setError]                  = useState(null);
  const [hourlyRate,             setHourlyRate]             = useState(null);
  const [serviceMaterialsTotals, setServiceMaterialsTotals] = useState({});
  const [descriptionPopup,       setDescriptionPopup]       = useState(null);
  const [expandedSections,       setExpandedSections]       = useState(new Set());

  // Form
  const [formServiceId, setFormServiceId] = useState(undefined);
  const isFormOpen = formServiceId !== undefined;

  const filterBtnRef    = useRef(null);
  const filterBubbleRef = useRef(null);

  const fetchHourlyRate = useCallback(async () => {
    if (!profile?.business_id) return;
    const { data } = await supabase.from("basic_pricing").select("hourly_rate").eq("business_id", profile.business_id).maybeSingle();
    setHourlyRate(data?.hourly_rate ?? null);
  }, [profile?.business_id]);

  const fetchAllServicesMaterialsTotals = useCallback(async () => {
    if (!profile?.business_id) return;
    const { data } = await supabase
      .from("material_service_link")
      .select("service_id, quantity, material:material_id(base_price_no_vat, markup)")
      .eq("business_id", profile.business_id);
    const totals = {};
    (data || []).forEach(link => {
      const price  = parseFloat(link.material?.base_price_no_vat) || 0;
      const markup = parseFloat(link.material?.markup) || 0;
      const qty    = parseInt(link.quantity) || 1;
      totals[link.service_id] = (totals[link.service_id] || 0) + price * (1 + markup / 100) * qty;
    });
    setServiceMaterialsTotals(totals);
  }, [profile?.business_id]);

  const fetchServices = useCallback(async () => {
    if (!profile?.business_id) { setLoading(false); return; }
    try {
      setLoading(true); setError(null);
      const { data, error } = await supabase
        .from("service")
        .select("*")
        .eq("business_id", profile.business_id)
        .eq("main_service", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setServices(data || []);

      // Fetch quote/job/customer context for Custom and Customer Request services
      const nonReusableIds = (data || [])
        .filter(s => s.service_type !== "Reusable")
        .map(s => s.service_id);

      if (nonReusableIds.length) {
        const { data: linkData } = await supabase
          .from("quote_service_link")
          .select(`
            service_id,
            quote:quote_id(
              quote_id, title, quote_number, status,
              job_quote_link(
                job:job_id(
                  job_id, title,
                  address_line1, address_line2, town_city, county, postcode,
                  customer:customer_id(customer_id, first_name, last_name)
                )
              )
            )
          `)
          .in("service_id", nonReusableIds);

        const ctxMap = {};
        (linkData || []).forEach(link => {
          if (ctxMap[link.service_id]) return; // take first link only
          const q = link.quote;
          if (!q) return;
          const jql = Array.isArray(q.job_quote_link) ? q.job_quote_link[0] : q.job_quote_link;
          const job = jql?.job;
          ctxMap[link.service_id] = {
            quoteId:           q.quote_id,
            quoteTitle:        q.title        || "",
            quoteNumber:       q.quote_number || "",
            quoteStatus:       q.status       || "",
            jobId:             job?.job_id              || null,
            jobTitle:          job?.title               || "",
            addressLine1:      job?.address_line1        || "",
            addressLine2:      job?.address_line2        || "",
            townCity:          job?.town_city            || "",
            county:            job?.county               || "",
            postcode:          job?.postcode             || "",
            customerId:        job?.customer?.customer_id || null,
            customerFirstName: job?.customer?.first_name || "",
            customerLastName:  job?.customer?.last_name  || "",
          };
        });
        setServiceContexts(ctxMap);
      } else {
        setServiceContexts({});
      }
    } catch (err) {
      setError("Failed to load services");
    } finally {
      setLoading(false);
    }
  }, [profile?.business_id]);

  useEffect(() => {
    if (!authLoading && profile?.business_id) {
      fetchHourlyRate();
      fetchServices();
      fetchAllServicesMaterialsTotals();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, profile?.business_id, fetchHourlyRate, fetchServices, fetchAllServicesMaterialsTotals]);

  useEffect(() => {
    const handler = e => {
      if (
        filtersOpen &&
        filterBubbleRef.current && !filterBubbleRef.current.contains(e.target) &&
        filterBtnRef.current    && !filterBtnRef.current.contains(e.target)
      ) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filtersOpen]);

  const toggleSection = (key) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const calculatePrice = (hours) => {
    const h = parseFloat(hours);
    if (isNaN(h) || hourlyRate === null) return 0;
    return (h * hourlyRate).toFixed(2);
  };

  const handleFormSaved = () => {
    fetchServices();
    fetchAllServicesMaterialsTotals();
  };

  // ── Constants (must be above filteredServices) ────────────────────────────

  const padQuoteNum = (n) => String(n || "").padStart(4, "0");

  const TYPE_ACCENT = {
    Reusable:           "#34d399",
    Custom:             "#38bdf8",
    "Customer Request": "#fbbf24",
  };

  const QUOTE_STATUS_COLOURS = {
    Draft:    { bg: "rgba(113,113,122,0.15)", text: "#a1a1aa" },
    Sent:     { bg: "rgba(14,165,233,0.15)",  text: "#38bdf8" },
    Accepted: { bg: "rgba(52,211,153,0.15)",  text: "#34d399" },
    Declined: { bg: "rgba(248,113,113,0.15)", text: "#f87171" },
  };

  // ── Filtering ─────────────────────────────────────────────────────────────

  const showContextFilters = serviceTypeFilter !== "Reusable";

  const hasNonDefaultFilters = serviceTypeFilter !== "Reusable" || !!dateFrom || !!dateTo
    || !!filterCustomer || !!filterJob || !!filterAddress || !!filterQuote;

  const filteredServices = services.filter(s => {
    if (serviceTypeFilter !== "All" && s.service_type !== serviceTypeFilter) return false;

    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
      if (new Date(s.created_at) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
      if (new Date(s.created_at) > to) return false;
    }

    // Context filters only apply to non-Reusable services; ignored for Reusable
    if (s.service_type !== "Reusable") {
      const ctx = serviceContexts[s.service_id];
      if (filterCustomer) {
        const name = `${ctx?.customerFirstName || ""} ${ctx?.customerLastName || ""}`;
        if (!name.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
      }
      if (filterJob && !(ctx?.jobTitle || "").toLowerCase().includes(filterJob.toLowerCase())) return false;
      if (filterAddress) {
        const addr = [ctx?.addressLine1, ctx?.addressLine2, ctx?.townCity, ctx?.county, ctx?.postcode]
          .filter(Boolean).join(" ").toLowerCase();
        if (!addr.includes(filterAddress.toLowerCase())) return false;
      }
      if (filterQuote) {
        const q = filterQuote.toLowerCase();
        const paddedNum = padQuoteNum(ctx?.quoteNumber);
        if (!(ctx?.quoteTitle || "").toLowerCase().includes(q) && !paddedNum.includes(q) && !String(ctx?.quoteNumber || "").includes(q)) return false;
      }
    }

    // Search: title-only for Reusable; extended for Custom/Customer Request
    if (search) {
      const sl = search.toLowerCase();
      const titleMatch = s.title.toLowerCase().includes(sl);
      if (s.service_type === "Reusable") {
        if (!titleMatch) return false;
      } else {
        const ctx = serviceContexts[s.service_id];
        const customerName = `${ctx?.customerFirstName || ""} ${ctx?.customerLastName || ""}`.toLowerCase();
        const address = [ctx?.addressLine1, ctx?.addressLine2, ctx?.townCity, ctx?.county, ctx?.postcode]
          .filter(Boolean).join(" ").toLowerCase();
        const quoteMatch = (ctx?.quoteTitle || "").toLowerCase().includes(sl) || padQuoteNum(ctx?.quoteNumber).includes(sl) || String(ctx?.quoteNumber || "").includes(sl);
        if (!titleMatch && !customerName.includes(sl) && !address.includes(sl) && !quoteMatch && !(ctx?.jobTitle || "").toLowerCase().includes(sl)) return false;
      }
    }

    return true;
  });

  // ── Grouping into sections ─────────────────────────────────────────────────

  const sections = (() => {
    const result = [];

    const reusable = filteredServices.filter(s => s.service_type === "Reusable");
    if (reusable.length) result.push({ key: "reusable", isReusable: true, ctx: null, services: reusable });

    const quoteGroupsMap = {};
    filteredServices
      .filter(s => s.service_type !== "Reusable")
      .forEach(s => {
        const ctx = serviceContexts[s.service_id];
        const key = ctx?.quoteId || `unlinked-${s.service_id}`;
        if (!quoteGroupsMap[key]) quoteGroupsMap[key] = { key, isReusable: false, ctx: ctx || null, services: [] };
        quoteGroupsMap[key].services.push(s);
      });

    Object.values(quoteGroupsMap).forEach(g => result.push(g));
    return result;
  })();

  const searchPlaceholder = serviceTypeFilter === "Reusable"
    ? "Search services..."
    : "Search by service, customer, job, address or quote...";

  // ── Input style helper ─────────────────────────────────────────────────────
  const filterInput = {
    width: "100%", padding: "7px 10px", borderRadius: "6px",
    background: "#09090b", border: "1px solid #3f3f46",
    color: "#fff", fontSize: "13px", boxSizing: "border-box",
  };

  // ── Tile renderer ──────────────────────────────────────────────────────────
  const renderTile = (s) => {
    const accentColor = TYPE_ACCENT[s.service_type] || "#3f3f46";
    return (
    <div
      key={s.service_id}
      className="group relative bg-zinc-900 rounded-xl overflow-hidden hover:scale-[1.02] transition flex flex-col"
      style={{ minHeight: "200px", border: "1px solid #27272a", borderTop: `3px solid ${accentColor}` }}
    >
      <div className="h-24 w-full overflow-hidden flex-shrink-0">
        <img src={s.image_url} className="h-full w-full object-cover" alt={s.title} />
      </div>
      <div className="p-3 flex-grow">
        <div className="text-base font-bold mb-2">{s.title}</div>
        <div className="text-xs text-zinc-400">Labour: £{calculatePrice(s.hours)} ({s.hours}h)</div>
        <div className="text-xs text-zinc-400 mt-0.5">Materials: £{(serviceMaterialsTotals[s.service_id] || 0).toFixed(2)}</div>
        <div className="text-xs text-sky-400 font-bold mt-0.5">
          Total: £{(parseFloat(calculatePrice(s.hours)) + (serviceMaterialsTotals[s.service_id] || 0)).toFixed(2)}
        </div>
      </div>

      {s.description && (
        <div style={{ position: "absolute", top: "8px", left: "8px" }}>
          <button
            onClick={e => { e.stopPropagation(); setDescriptionPopup(prev => prev === s.service_id ? null : s.service_id); }}
            style={{ padding: "8px", background: "rgba(0,0,0,0.55)", borderRadius: "9999px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Description"
          >
            <svg xmlns="http://www.w3.org/2000/svg" style={{ height: "16px", width: "16px", color: "#e4e4e7" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
            </svg>
          </button>
        </div>
      )}

      <div style={{ position: "absolute", top: "8px", right: "8px", display: "flex", gap: "6px" }}>
        <button
          onClick={e => { e.stopPropagation(); setFormServiceId(s.service_id); }}
          style={{ padding: "8px", background: "linear-gradient(135deg, #40c2ff, #2d98ff)", borderRadius: "9999px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          title="Edit"
        >
          <svg xmlns="http://www.w3.org/2000/svg" style={{ height: "16px", width: "16px", color: "#020617" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>

      {descriptionPopup === s.service_id && (
        <div
          style={{ position: "absolute", top: "96px", left: 0, right: 0, bottom: 0, background: "rgba(9,9,11,0.96)", borderTop: "1px solid #3f3f46", padding: "10px 12px", display: "flex", flexDirection: "column", zIndex: 5 }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
            <p style={{ fontSize: "12px", color: "#e4e4e7", lineHeight: "1.5", margin: 0, flex: 1, overflowY: "auto" }}>{s.description}</p>
            <button onClick={e => { e.stopPropagation(); setDescriptionPopup(null); }}
              style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: "0 0 0 6px", fontSize: "14px", lineHeight: 1, flexShrink: 0 }}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
  };

  // ── Address formatter ──────────────────────────────────────────────────────
  const formatAddress = (ctx) => [ctx.addressLine1, ctx.addressLine2, ctx.townCity, ctx.county, ctx.postcode].filter(Boolean);

  // ─────────────────────────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-400">Loading services...</div>
      </div>
    );
  }

  if (!profile?.business_id) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-400">Please set up your business profile first.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500 rounded-xl p-4 text-red-200">{error}</div>
      )}

      {/* SEARCH, FILTERS AND ADD BUTTON */}
      <div className="flex gap-4">
        <div style={{ position: "relative", flex: 1 }}>
          <div className="flex items-center gap-2">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 p-3 rounded-xl bg-zinc-900 border border-zinc-700"
            />
            <button
              ref={filterBtnRef}
              onClick={() => setFiltersOpen(p => !p)}
              style={{ position: "relative", flexShrink: 0 }}
              className={`px-4 py-3 rounded-xl text-sm font-semibold transition ${filtersOpen ? "bg-sky-500 text-black" : "bg-zinc-800 text-white hover:bg-zinc-700"}`}
            >
              Filters
              {hasNonDefaultFilters && (
                <span style={{ position: "absolute", top: "-4px", right: "-4px", width: "8px", height: "8px", borderRadius: "50%", background: "#f87171" }} />
              )}
            </button>
          </div>

          {filtersOpen && (
            <div
              ref={filterBubbleRef}
              style={{
                position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 40,
                width: "300px", background: "#18181b", border: "1px solid #3f3f46",
                borderRadius: "8px", boxShadow: "0 8px 32px rgba(0,0,0,0.65)", padding: "16px",
              }}
            >
              <div style={{ position: "absolute", top: "-8px", right: "38px", width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: "8px solid #3f3f46" }} />
              <div style={{ position: "absolute", top: "-7px", right: "39px", width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderBottom: "7px solid #18181b" }} />

              {/* Type */}
              <div style={{ marginBottom: "14px" }}>
                <p style={{ fontSize: "11px", color: "#71717a", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px", letterSpacing: "0.06em" }}>Type</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {[
                    { label: "All",              activeBg: "#0ea5e9", activeColor: "#000" },
                    { label: "Reusable",         activeBg: "#34d399", activeColor: "#000" },
                    { label: "Custom",           activeBg: "#38bdf8", activeColor: "#000" },
                    { label: "Customer Request", activeBg: "#fbbf24", activeColor: "#000" },
                  ].map(({ label, activeBg, activeColor }) => (
                    <button key={label} onClick={() => setServiceTypeFilter(label)}
                      style={{
                        padding: "4px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                        cursor: "pointer", border: "none",
                        background: serviceTypeFilter === label ? activeBg    : "#27272a",
                        color:      serviceTypeFilter === label ? activeColor : "#d4d4d8",
                        transition: "background 0.15s",
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Context filters — only shown for Custom / Customer Request */}
              {showContextFilters && (
                <div style={{ marginBottom: "14px", paddingBottom: "14px", borderBottom: "1px solid #27272a" }}>
                  <p style={{ fontSize: "11px", color: "#71717a", textTransform: "uppercase", fontWeight: 700, marginBottom: "10px", letterSpacing: "0.06em" }}>
                    Quote Context
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>Customer</label>
                      <input value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
                        placeholder="First or last name..." style={filterInput} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>Job</label>
                      <input value={filterJob} onChange={e => setFilterJob(e.target.value)}
                        placeholder="Job title..." style={filterInput} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>Address</label>
                      <input value={filterAddress} onChange={e => setFilterAddress(e.target.value)}
                        placeholder="Street, city, postcode..." style={filterInput} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>Quote</label>
                      <input value={filterQuote} onChange={e => setFilterQuote(e.target.value)}
                        placeholder="Title or number..." style={filterInput} />
                    </div>
                  </div>
                </div>
              )}

              {/* Created Date */}
              <div style={{ marginBottom: "14px" }}>
                <p style={{ fontSize: "11px", color: "#71717a", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px", letterSpacing: "0.06em" }}>Created Date</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>From</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      style={{ ...filterInput, colorScheme: "dark" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>To</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      style={{ ...filterInput, colorScheme: "dark" }} />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #27272a" }}>
                <button
                  onClick={() => { setServiceTypeFilter("Reusable"); setDateFrom(""); setDateTo(""); setFilterCustomer(""); setFilterJob(""); setFilterAddress(""); setFilterQuote(""); }}
                  style={{ fontSize: "12px", color: "#71717a", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  onMouseEnter={e => (e.target.style.color = "#fff")}
                  onMouseLeave={e => (e.target.style.color = "#71717a")}
                >
                  Reset to defaults
                </button>
                <button
                  onClick={() => setFiltersOpen(false)}
                  style={{ padding: "4px 14px", borderRadius: "6px", background: "#0ea5e9", color: "#000", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer" }}
                  onMouseEnter={e => (e.target.style.background = "#38bdf8")}
                  onMouseLeave={e => (e.target.style.background = "#0ea5e9")}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={() => setFormServiceId(null)} className="px-5 py-3 bg-sky-400 text-black rounded-xl font-bold whitespace-nowrap">
          + Add New
        </button>
      </div>

      {hourlyRate === null && filteredServices.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500 rounded-xl p-4 text-yellow-200 text-sm">
          Hourly rate not configured. Please set up basic pricing to display service prices.
        </div>
      )}

      {/* SECTIONS */}
      {sections.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          {search || hasNonDefaultFilters
            ? "No services found matching your filters."
            : "No services added yet. Click '+ Add New' to get started."}
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map(section => {
            const isCollapsed = !expandedSections.has(section.key);
            const addrLines = section.ctx ? formatAddress(section.ctx) : [];
            const sectionType = section.isReusable ? "Reusable"
              : section.services.some(sv => sv.service_type === "Customer Request") ? "Customer Request"
              : "Custom";
            const sectionColor = TYPE_ACCENT[sectionType];

            return (
              <div key={section.key} style={{ border: "1px solid #3f3f46", borderLeft: `3px solid ${sectionColor}`, borderRadius: "8px", overflow: "hidden" }}>

                {/* Section header */}
                <div
                  onClick={() => toggleSection(section.key)}
                  style={{ cursor: "pointer", background: "#18181b", padding: "14px 20px", transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#1c1c1f")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#18181b")}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                    {/* Section info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {section.isReusable ? (
                        <span style={{ color: "#34d399", fontWeight: 700, fontSize: "15px" }}>
                          Basic Reusable Services
                        </span>
                      ) : section.ctx ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ alignSelf: "flex-start", padding: "2px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: sectionColor + "22", color: sectionColor }}>
                          {sectionType}
                        </span>
                        <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "3px 14px", alignItems: "start" }}>
                          <span style={{ color: "#71717a", fontSize: "12px", paddingTop: "1px" }}>Customer</span>
                          <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600 }}>
                            {section.ctx.customerFirstName} {section.ctx.customerLastName}
                          </span>
                          <span style={{ color: "#71717a", fontSize: "12px", paddingTop: "1px" }}>Job</span>
                          <span style={{ color: "#e4e4e7", fontSize: "13px" }}>{section.ctx.jobTitle || "—"}</span>
                          <span style={{ color: "#71717a", fontSize: "12px", paddingTop: "2px" }}>Address</span>
                          <span style={{ color: "#e4e4e7", fontSize: "13px", lineHeight: "1.65" }}>
                            {addrLines.length
                              ? addrLines.map((line, i) => <span key={i}>{line}{i < addrLines.length - 1 ? <br /> : null}</span>)
                              : <span style={{ color: "#52525b" }}>—</span>}
                          </span>
                          <span style={{ color: "#71717a", fontSize: "12px", paddingTop: "1px" }}>Quote</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ color: "#38bdf8", fontSize: "13px" }}>
                              {section.ctx.quoteTitle} ({padQuoteNum(section.ctx.quoteNumber)})
                            </span>
                            {section.ctx.quoteStatus && (() => {
                              const sc = QUOTE_STATUS_COLOURS[section.ctx.quoteStatus] || QUOTE_STATUS_COLOURS.Draft;
                              return (
                                <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: sc.bg, color: sc.text }}>
                                  {section.ctx.quoteStatus}
                                </span>
                              );
                            })()}
                          </span>
                        </div>
                        </div>
                      ) : (
                        <span style={{ color: "#71717a", fontSize: "14px" }}>Unlinked Services</span>
                      )}
                    </div>

                    {/* Right: count + view quote + chevron */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                      <span style={{ fontSize: "12px", color: "#71717a", background: "#27272a", padding: "2px 10px", borderRadius: "6px", whiteSpace: "nowrap" }}>
                        {section.services.length} {section.services.length === 1 ? "service" : "services"}
                      </span>
                      {!section.isReusable && section.ctx?.customerId && (
                        <button
                          onClick={e => { e.stopPropagation(); window.open(`/crm/clients/${section.ctx.customerId}`, "_blank"); }}
                          style={{ padding: "4px 12px", background: "#0ea5e9", color: "#000", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          View Client
                        </button>
                      )}
                      {!section.isReusable && section.ctx?.jobId && (
                        <button
                          onClick={e => { e.stopPropagation(); window.open(`/crm/jobs/${section.ctx.jobId}`, "_blank"); }}
                          style={{ padding: "4px 12px", background: "#0ea5e9", color: "#000", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          View Job
                        </button>
                      )}
                      {!section.isReusable && section.ctx?.quoteId && (
                        <button
                          onClick={e => { e.stopPropagation(); window.open(`/crm/quotes/${section.ctx.quoteId}`, "_blank"); }}
                          style={{ padding: "4px 12px", background: "#0ea5e9", color: "#000", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          View Quote
                        </button>
                      )}
                      <svg
                        style={{ width: "20px", height: "20px", color: "#71717a", flexShrink: 0, transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Section content */}
                {!isCollapsed && (
                  <div style={{ padding: "16px 20px", borderTop: "1px solid #27272a", background: "#0f0f11" }}>
                    <div className="services-grid">
                      {section.services.map(renderTile)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isFormOpen && (
        <ServiceForm
          serviceId={formServiceId}
          profile={profile}
          onClose={() => setFormServiceId(undefined)}
          onSaved={handleFormSaved}
        />
      )}
    </div>
  );
}
