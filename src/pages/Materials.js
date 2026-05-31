import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabaseClient";
import { fetchPexelsImage } from "../utils/pexelsImage";

export default function Materials() {
  const { profile, loading: authLoading } = useAuth();

  const [search, setSearch] = useState("");
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const emptyMaterial = {
    name: "",
    description: "",
    image_url:
      "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop",
    base_price_no_vat: "",
    markup: "",
    code: "",
    supplier: "",
    supplier_url: "",
  };

  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [fetchingImage, setFetchingImage] = useState(false);
  const pexelsPageRef = useRef(1);
  const [fetchError, setFetchError] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState(null); // null | { total, remaining, done }
  const refreshPollRef = useRef(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState(null);
  const [tempMaterial, setTempMaterial] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState(null);
  const [materialUsedBy, setMaterialUsedBy] = useState([]);

  // Fetch materials for the user's business
  const fetchMaterials = useCallback(async () => {
    if (!profile?.business_id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("material")
        .select("*")
        .eq("business_id", profile.business_id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setMaterials(data || []);
    } catch (err) {
      console.error("Error fetching materials:", err);
      setError("Failed to load materials");
    } finally {
      setLoading(false);
    }
  }, [profile?.business_id]);

  useEffect(() => {
    if (!authLoading && profile?.business_id) {
      fetchMaterials();
    }
  }, [authLoading, profile?.business_id, fetchMaterials]);

  useEffect(() => {
    return () => { if (refreshPollRef.current) clearInterval(refreshPollRef.current); };
  }, []);

  const startPolling = useCallback(() => {
    if (refreshPollRef.current) clearInterval(refreshPollRef.current);
    refreshPollRef.current = setInterval(async () => {
      const { count } = await supabase
        .from('material')
        .select('material_id', { count: 'exact', head: true })
        .eq('business_id', profile.business_id)
        .eq('price_refresh_queued', true);
      const remaining = count ?? 0;
      if (remaining === 0) {
        clearInterval(refreshPollRef.current);
        refreshPollRef.current = null;
        localStorage.removeItem('price_refresh_running');
        setRefreshStatus(prev => ({ ...prev, remaining: 0, done: true }));
        fetchMaterials();
      } else {
        setRefreshStatus(prev => ({ ...prev, remaining }));
      }
    }, 10000);
  }, [profile?.business_id, fetchMaterials]);

  // On page load: check if a refresh is in progress or just finished
  useEffect(() => {
    if (authLoading || !profile?.business_id) return;
    (async () => {
      const { count } = await supabase
        .from('material')
        .select('material_id', { count: 'exact', head: true })
        .eq('business_id', profile.business_id)
        .eq('price_refresh_queued', true);
      const remaining = count ?? 0;
      const wasRunning = localStorage.getItem('price_refresh_running') === '1';
      if (remaining > 0) {
        localStorage.setItem('price_refresh_running', '1');
        setRefreshStatus({ remaining, done: false });
        startPolling();
      } else if (wasRunning) {
        localStorage.removeItem('price_refresh_running');
        setRefreshStatus({ remaining: 0, done: true });
      }
    })();
  }, [authLoading, profile?.business_id, startPolling]);

  const sanitizeNumberInput = (value) => {
    if (!value) return "";
    let cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    return cleaned;
  };

  const calculatePriceWithMarkup = (basePrice, markup) => {
    const base = parseFloat(basePrice);
    const mark = parseFloat(markup);
    if (isNaN(base) || isNaN(mark)) return 0;
    return (base * (1 + mark / 100)).toFixed(2);
  };

  const openEditModal = (material) => {
    setIsEditMode(true);
    setEditingMaterialId(material.material_id);
    setTempMaterial({
      name: material.name,
      description: material.description || "",
      image_url: material.image_url || emptyMaterial.image_url,
      base_price_no_vat: material.base_price_no_vat?.toString() || "",
      markup: material.markup?.toString() || "",
      code: material.code || "",
      supplier: material.supplier || "",
      supplier_url: material.supplier_url || "",
    });
    setImageFile(null);
    pexelsPageRef.current = 1;
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingMaterialId(null);
    setTempMaterial({ ...emptyMaterial });
    setImageFile(null);
    pexelsPageRef.current = 1;
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingMaterialId(null);
    setTempMaterial(null);
    setImageFile(null);
    setFetchError(null);
  };

  const uploadImage = async (file, userId) => {
    if (!file) return null;

    const fileExt = file.name.split(".").pop();
    const fileName = `${userId}_${Date.now()}.${fileExt}`;
    const filePath = `material-images/${fileName}`;

    const { data, error } = await supabase.storage
      .from("material-images")
      .upload(filePath, file, { upsert: true });

    if (error) {
      console.error("Image upload error:", error);
      throw error;
    }

    const { data: urlData } = supabase.storage
      .from("material-images")
      .getPublicUrl(filePath);

    return urlData?.publicUrl;
  };

  const saveChanges = async () => {
    if (!tempMaterial || !profile?.business_id) return;
    if (saving) return;

    try {
      setSaving(true);
      setError(null);

      let imageUrl = tempMaterial.image_url;

      // Upload image if a new file was selected
      if (imageFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          imageUrl = await uploadImage(imageFile, user.id);
        }
      }

      const materialData = {
        name: tempMaterial.name,
        description: tempMaterial.description,
        image_url: imageUrl,
        base_price_no_vat: parseFloat(tempMaterial.base_price_no_vat) || 0,
        markup: parseFloat(tempMaterial.markup) || 0,
        code: tempMaterial.code,
        supplier: tempMaterial.supplier,
        supplier_url: tempMaterial.supplier_url || null,
        business_id: profile.business_id,
      };

      let err;
      if (isEditMode && editingMaterialId) {
        // UPDATE existing material
        const { error } = await supabase
          .from("material")
          .update(materialData)
          .eq("material_id", editingMaterialId)
          .eq("business_id", profile.business_id);

        err = error;
      } else {
        // INSERT new material
        const { error } = await supabase
          .from("material")
          .insert([materialData]);

        err = error;
      }

      if (err) throw err;

      await fetchMaterials();
      closeModal();
    } catch (err) {
      console.error("Save error:", err);
      setError(err.message || "Failed to save material");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = async (materialId) => {
    const { data } = await supabase
      .from("material_service_link")
      .select("service:service_id(title)")
      .eq("material_id", materialId)
      .eq("business_id", profile.business_id);

    const serviceNames = (data || []).map(row => row.service?.title).filter(Boolean);
    setMaterialUsedBy(serviceNames);
    setMaterialToDelete(materialId);
    setIsModalOpen(false);
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setIsModalOpen(true);
    setMaterialToDelete(null);
    setMaterialUsedBy([]);
  };

  const closeDeleteAfterSuccess = () => {
    setDeleteConfirmOpen(false);
    setIsModalOpen(false);
    setMaterialToDelete(null);
    setMaterialUsedBy([]);
    setEditingMaterialId(null);
    setTempMaterial(null);
  };

  const confirmDelete = async () => {
    if (!materialToDelete) return;

    try {
      setError(null);

      const { error } = await supabase
        .from("material")
        .delete()
        .eq("material_id", materialToDelete)
        .eq("business_id", profile.business_id);

      if (error) throw error;

      await fetchMaterials();
      closeDeleteAfterSuccess();
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete material");
    }
  };

  const handleChange = (field, value) => {
    setTempMaterial({ ...tempMaterial, [field]: value });
  };

  const handleImageUpload = (file) => {
    if (!file) return;
    setImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setTempMaterial((p) => ({ ...p, image_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  // Parse product name and price from raw HTML using Schema.org JSON-LD
  // and Open Graph meta tags. Works for static/server-rendered pages only.
  const extractProductData = (html) => {
    // Detect Cloudflare bot-protection interstitial
    if (
      html.includes('cf-browser-verification') ||
      html.includes('Enable JavaScript and cookies to continue') ||
      (html.includes('just a moment') && html.includes('cloudflare'))
    ) {
      throw new Error('CLOUDFLARE');
    }

    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let name = null;
      let price = null;

      // Schema.org JSON-LD (most reliable)
      doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
        try {
          const items = [].concat(JSON.parse(s.textContent));
          items.forEach(item => {
            if (item['@type'] === 'Product') {
              name = name || item.name || null;
              const offers = item.offers ? [].concat(item.offers)[0] : null;
              if (offers) price = price ?? offers.price ?? offers.lowPrice ?? null;
            }
          });
        } catch {}
      });

      // Open Graph / meta tag fallback
      if (!name) {
        name = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
          || doc.title || null;
      }
      if (price === null) {
        const priceMeta = doc.querySelector('meta[property="og:price:amount"]')
          || doc.querySelector('meta[property="product:price:amount"]');
        if (priceMeta) price = parseFloat(priceMeta.getAttribute('content')) || null;
      }

      return {
        name: name?.trim() || null,
        price: price !== null ? parseFloat(String(price).replace(/[^0-9.]/g, '')) || null : null,
      };
    } catch (err) {
      if (err.message === 'CLOUDFLARE') throw err;
      return { name: null, price: null };
    }
  };

  const fetchFromSupplierUrl = async (url) => {
    // Use a direct fetch with a 60-second timeout rather than
    // supabase.functions.invoke(), which inherits the global 15-second timeout
    // and would abort before Zyte finishes rendering the page.
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/fetch-supplier-price`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(60000),
      }
    );
    if (!res.ok) throw new Error(`Edge function returned ${res.status}`);
    const data = await res.json();
    if (data?.error) throw new Error(data.error);
    return {
      name: data?.name ?? null,
      price: data?.price ?? null,
      code: data?.code ?? null,
      supplier: data?.supplier ?? null,
    };
  };

  // Fetch a Pexels image using the material name as the search query
  const handleGenerateImage = async () => {
    const query = tempMaterial?.name?.trim();
    if (!query) return;
    setFetchingImage(true);
    try {
      const url = await fetchPexelsImage(query, pexelsPageRef.current);
      if (url) {
        setTempMaterial(prev => ({ ...prev, image_url: url }));
        pexelsPageRef.current += 1;
      }
    } catch {
      // Non-critical — silently ignore
    } finally {
      setFetchingImage(false);
    }
  };

  // Fetch details from URL and pre-fill the edit form
  const handleFetchFromUrl = async () => {
    if (!tempMaterial?.supplier_url?.trim()) return;
    setFetchingUrl(true);
    setFetchError(null);
    try {
      const { name, price, code, supplier } = await fetchFromSupplierUrl(tempMaterial.supplier_url.trim());
      if (name || price !== null || code || supplier) {
        setTempMaterial(prev => ({
          ...prev,
          ...(name ? { name } : {}),
          ...(price !== null ? { base_price_no_vat: String(price) } : {}),
          ...(code ? { code } : {}),
          ...(supplier ? { supplier } : {}),
          // markup and image_url intentionally kept as-is
        }));
      } else {
        setFetchError("No product data found. This supplier's site likely loads prices with JavaScript, which can't be fetched automatically.");
      }
    } catch (err) {
      if (err.message === 'CLOUDFLARE') {
        setFetchError("This supplier's site is protected by Cloudflare and blocks automated access. You'll need to enter the price manually.");
      } else if (err.name === 'TimeoutError') {
        setFetchError('Request timed out — check the URL and try again.');
      } else {
        setFetchError(`Could not fetch URL: ${err.message}`);
      }
    } finally {
      setFetchingUrl(false);
    }
  };

  // Trigger a server-side background refresh — each material gets its own edge function
  // invocation so there is no timeout limit regardless of catalog size.
  const refreshAllPrices = async () => {
    const withUrls = materials.filter(m => m.supplier_url);
    if (!withUrls.length) { setError("No materials have a supplier URL set."); return; }

    setRefreshingAll(true);
    setRefreshStatus(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/start-price-refresh`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to start refresh');

      localStorage.setItem('price_refresh_running', '1');
      setRefreshStatus({ total: data.total, remaining: data.total, done: false });
      startPolling();

    } catch (err) {
      setError(`Could not start refresh: ${err.message}`);
    } finally {
      setRefreshingAll(false);
    }
  };

  const filteredMaterials = materials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-400">Loading materials...</div>
      </div>
    );
  }

  if (!profile?.business_id) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-400">
          Please set up your business profile first.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ERROR MESSAGE */}
      {error && (
        <div className="bg-red-500/10 border border-red-500 rounded-xl p-4 text-red-200">
          {error}
        </div>
      )}

      {/* SEARCH AND ADD BUTTON */}
      <div className="flex gap-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search materials..."
          className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700"
        />
        <button
          onClick={refreshAllPrices}
          disabled={refreshingAll || (!!refreshStatus && !refreshStatus.done)}
          className="px-4 py-3 rounded-xl font-bold whitespace-nowrap text-sm"
          style={
            refreshingAll || (refreshStatus && !refreshStatus.done)
              ? { background: '#3f3f46', color: '#fff', opacity: 0.6, cursor: 'not-allowed' }
              : { background: 'linear-gradient(135deg, #40c2ff, #2d98ff)', color: '#020617' }
          }
          title="Fetch latest prices from supplier URLs"
        >
          {refreshingAll ? "Starting…" : (refreshStatus && !refreshStatus.done) ? "Refreshing…" : "Refresh Prices"}
        </button>
        <button
          onClick={openAddModal}
          className="px-5 py-3 bg-sky-400 text-black rounded-xl font-bold whitespace-nowrap"
        >
          + Add New
        </button>
      </div>

      {/* REFRESH PROGRESS */}
      {refreshStatus && (
        <div className="bg-zinc-800 rounded-xl p-3 text-sm text-zinc-300">
          {refreshStatus.done ? (
            <>Prices have been updated successfully.</>
          ) : (
            <>
              Refreshing prices in the background —{" "}
              <span className="text-sky-400 font-bold">{refreshStatus.remaining}</span>
              {refreshStatus.total ? <>{" "}of <span className="font-bold">{refreshStatus.total}</span></> : null}
              {" "}remaining. You can keep using the app or close this page.
            </>
          )}
        </div>
      )}

      {/* MATERIALS GRID */}
      {filteredMaterials.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          {search
            ? "No materials found matching your search."
            : "No materials added yet. Click '+ Add New' to get started."}
        </div>
      ) : (
        <div className="services-grid">
          {filteredMaterials.map((m) => (
            <div
              key={m.material_id}
              className="group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:scale-[1.02] transition flex flex-col"
              style={{ minHeight: '200px' }}
            >
              <div className="h-24 w-full overflow-hidden flex-shrink-0">
                <img
                  src={m.image_url}
                  className="h-full w-full object-cover"
                  alt={m.name}
                />
              </div>
              <div className="p-3 flex-grow">
                <div className="text-base font-bold mb-1">{m.name}</div>
                <div className="text-xs text-zinc-400 line-clamp-2">
                  {m.description}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  Base: £{m.base_price_no_vat} · Markup: {m.markup}% · £{calculatePriceWithMarkup(m.base_price_no_vat, m.markup)}
                </div>
                {m.supplier_url && (
                  <a
                    href={m.supplier_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-sky-500 hover:text-sky-400 mt-0.5 inline-block"
                  >
                    Supplier page ↗
                  </a>
                )}
              </div>

              {/* Edit button */}
              <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '8px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(m);
                  }}
                  style={{
                    padding: '8px',
                    background: 'linear-gradient(135deg, #40c2ff, #2d98ff)',
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Edit"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ height: '16px', width: '16px', color: '#020617' }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-5 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-3">Delete Material</h2>
            {materialUsedBy.length > 0 ? (
              <>
                <p className="text-red-300 text-sm mb-3">
                  This material cannot be deleted because it is used in the following service{materialUsedBy.length > 1 ? 's' : ''}:
                </p>
                <ul className="mb-5 space-y-1">
                  {materialUsedBy.map((name, i) => (
                    <li key={i} className="text-sm text-zinc-200 bg-zinc-800 rounded-lg px-3 py-1.5">
                      {name}
                    </li>
                  ))}
                </ul>
                <p className="text-zinc-400 text-xs mb-5">Remove it from those services first, then delete it.</p>
                <div className="flex justify-end">
                  <button
                    onClick={closeDeleteConfirm}
                    className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800"
                  >
                    OK
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-zinc-300 text-sm mb-5">
                  Are you sure? This cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={closeDeleteConfirm}
                    disabled={saving}
                    className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-red-500 text-white rounded-xl font-bold hover:bg-red-400 disabled:opacity-50"
                  >
                    {saving ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* EDIT/ADD MODAL */}
      {isModalOpen && tempMaterial && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-md" style={{ height: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Sticky header */}
            <div className="p-5 pb-3" style={{ flexShrink: 0 }}>
              <h2 className="text-lg font-bold">
                {isEditMode ? "Edit Material" : "Add Material"}
              </h2>
            </div>

            {/* Scrollable body */}
            <div className="px-5" style={{ flex: '1 1 0', overflowY: 'auto', minHeight: 0 }}>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Material Name</label>
                <input
                  className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                  value={tempMaterial.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Enter material name"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Description</label>
                <textarea
                  className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm resize-none"
                  value={tempMaterial.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Enter material description (optional)"
                  rows="2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Base Price (no VAT)</label>
                  <input
                    className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                    inputMode="decimal"
                    value={tempMaterial.base_price_no_vat}
                    onChange={(e) =>
                      setTempMaterial({
                        ...tempMaterial,
                        base_price_no_vat: sanitizeNumberInput(e.target.value),
                      })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Markup (%)</label>
                  <input
                    className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                    inputMode="decimal"
                    value={tempMaterial.markup}
                    onChange={(e) =>
                      setTempMaterial({
                        ...tempMaterial,
                        markup: sanitizeNumberInput(e.target.value),
                      })
                    }
                    placeholder="0"
                  />
                </div>
              </div>

              {tempMaterial.base_price_no_vat && tempMaterial.markup && (
                <div className="text-xs text-zinc-400">
                  Final price with markup: <span className="text-sky-400 font-bold">£{calculatePriceWithMarkup(tempMaterial.base_price_no_vat, tempMaterial.markup)}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Code</label>
                  <input
                    className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                    value={tempMaterial.code}
                    onChange={(e) => handleChange("code", e.target.value)}
                    placeholder="e.g., MAT-001"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Supplier</label>
                  <input
                    className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                    value={tempMaterial.supplier}
                    onChange={(e) => handleChange("supplier", e.target.value)}
                    placeholder="Supplier name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Supplier URL</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                    value={tempMaterial.supplier_url}
                    onChange={(e) => { handleChange("supplier_url", e.target.value); setFetchError(null); }}
                    placeholder="https://supplier.com/product/..."
                  />
                  <button
                    type="button"
                    onClick={handleFetchFromUrl}
                    disabled={fetchingUrl || !tempMaterial.supplier_url?.trim()}
                    className="px-3 py-2 bg-sky-500/20 border border-sky-500 text-sky-400 text-sm rounded-xl hover:bg-sky-500/30 disabled:opacity-40 whitespace-nowrap"
                  >
                    {fetchingUrl ? "Fetching…" : "Fetch Details"}
                  </button>
                </div>
                <div className="flex items-center justify-between mt-1">
                  {tempMaterial.supplier_url?.trim() && (
                    <a
                      href={tempMaterial.supplier_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-zinc-500 hover:text-sky-400"
                    >
                      Open supplier page ↗
                    </a>
                  )}
                </div>
                {fetchError && (
                  <div className="mt-2 p-2 bg-red-500/10 border border-red-500/50 rounded-lg text-xs text-red-300">
                    {fetchError}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Material Image</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e.target.files[0])}
                    className="flex-1 text-xs text-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={() => handleGenerateImage()}
                    disabled={fetchingImage || !tempMaterial.name?.trim()}
                    className="px-3 py-1.5 bg-zinc-700 text-white text-xs rounded-xl hover:bg-zinc-600 disabled:opacity-40 whitespace-nowrap"
                    title="Search Pexels for an image using the material name"
                  >
                    {fetchingImage ? "Searching…" : "Generate Image"}
                  </button>
                </div>
                {tempMaterial.image_url && (
                  <img
                    src={tempMaterial.image_url}
                    alt="preview"
                    className="mt-2 w-full h-20 object-cover rounded-lg"
                  />
                )}
              </div>
            </div>
            </div>

            {/* Sticky footer with action buttons */}
            <div className="p-5 pt-4 border-t border-zinc-800 flex justify-between items-center" style={{ flexShrink: 0 }}>
              {isEditMode && (
                <button
                  onClick={() => openDeleteConfirm(editingMaterialId)}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-red-500 text-white rounded-xl font-bold hover:bg-red-400 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
              <div className={`flex gap-3 ${isEditMode ? '' : 'ml-auto'}`}>
                <button
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveChanges}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-sky-400 text-black rounded-xl font-bold hover:bg-sky-300 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}