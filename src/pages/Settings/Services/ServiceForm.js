import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../supabaseClient";
import MaterialServiceLink from "./MaterialServiceLink";
import { fetchPexelsImage } from "../../../utils/pexelsImage";

const EMPTY_SERVICE = {
  title: "",
  description: "",
  hours: "1",
  service_type: "Reusable",
  image_url: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop",
};

export default function ServiceForm({ serviceId, profile, onClose, onSaved, hideDelete = false }) {
  const isEditMode = !!serviceId;

  const [currentServiceId,      setCurrentServiceId]      = useState(serviceId ?? null);
  const [serviceAutoCreated,    setServiceAutoCreated]    = useState(false);
  const [originalType,          setOriginalType]          = useState(null);
  const [linkedToNonDraftQuote, setLinkedToNonDraftQuote] = useState(false);
  const originalServiceIdRef = useRef(serviceId ?? null);

  const [tempService,           setTempService]           = useState(null);
  const [imageFile,             setImageFile]             = useState(null);
  const [alsoMakeReusable,      setAlsoMakeReusable]      = useState(false);
  const [selectedMaterialIds,   setSelectedMaterialIds]   = useState([]);
  const [isMaterialsOpen,       setIsMaterialsOpen]       = useState(false);
  const [serviceMaterialsTotal, setServiceMaterialsTotal] = useState({ base: "0.00", markup: "0.00", total: "0.00" });
  const [hourlyRate,            setHourlyRate]            = useState(null);
  const [saving,                setSaving]                = useState(false);
  const [error,                 setError]                 = useState(null);
  const [fieldErrors,           setFieldErrors]           = useState({});
  const [duplicateError,        setDuplicateError]        = useState(null);
  const [deleteConfirm,         setDeleteConfirm]         = useState(false);
  const [canDelete,             setCanDelete]             = useState(true);
  const [fetchingImage,         setFetchingImage]         = useState(false);
  const pexelsPageRef = useRef(1);

  useEffect(() => {
    if (!profile?.business_id) return;

    supabase.from("basic_pricing").select("hourly_rate").eq("business_id", profile.business_id).maybeSingle()
      .then(({ data }) => setHourlyRate(parseFloat(data?.hourly_rate) ?? null));

    if (serviceId) {
      originalServiceIdRef.current = serviceId;
      supabase.from("service").select("*").eq("service_id", serviceId).single()
        .then(async ({ data }) => {
          if (!data) return;
          setTempService({
            title:        data.title,
            description:  data.description || "",
            hours:        String(data.hours),
            service_type: data.service_type || "Reusable",
            image_url:    data.image_url || EMPTY_SERVICE.image_url,
          });
          setOriginalType(data.service_type || "Reusable");
          // Duplicate check on load only for Reusable services (editing their own title)
          if (data.service_type === "Reusable") {
            checkDuplicate(data.title, serviceId);
          }

          if (data.service_type !== "Reusable") {
            const { data: links } = await supabase
              .from("quote_service_link")
              .select("quote:quote_id(status)")
              .eq("service_id", serviceId);
            const hasNonDraftLink = (links || []).some(l => l.quote?.status && l.quote.status !== "Draft");
            setLinkedToNonDraftQuote(hasNonDraftLink);
            setCanDelete(!hasNonDraftLink);
          } else {
            setLinkedToNonDraftQuote(false);
            setCanDelete(true);
          }
        });
      fetchMatTotals(serviceId);
    } else {
      setTempService({ ...EMPTY_SERVICE });
      setOriginalType("Reusable");
    }

    pexelsPageRef.current = 1;
  }, [serviceId, profile?.business_id]);

  const fetchMatTotals = async (svcId) => {
    if (!svcId) return;
    const { data } = await supabase
      .from("material_service_link")
      .select("quantity, material_id, material:material_id(base_price_no_vat, markup)")
      .eq("service_id", svcId);
    const links = data || [];
    setSelectedMaterialIds(links.map(d => d.material_id));
    const base   = links.reduce((s, l) => s + (parseFloat(l.material?.base_price_no_vat) || 0) * (parseInt(l.quantity) || 1), 0);
    const markup = links.reduce((s, l) => s + (parseFloat(l.material?.base_price_no_vat) || 0) * (parseFloat(l.material?.markup) || 0) / 100 * (parseInt(l.quantity) || 1), 0);
    setServiceMaterialsTotal({ base: base.toFixed(2), markup: markup.toFixed(2), total: (base + markup).toFixed(2) });
  };

  const sanitize = (v) => {
    if (!v) return "";
    let c = v.replace(/[^0-9.]/g, "");
    const p = c.split(".");
    if (p.length > 2) c = p[0] + "." + p.slice(1).join("");
    return c;
  };

  const calcPrice  = (h) => { const v = parseFloat(h); return (isNaN(v) || hourlyRate === null) ? 0 : (v * hourlyRate).toFixed(2); };
  const calcTotals = (h) => {
    const labour = parseFloat(calcPrice(h)) || 0;
    const mb     = parseFloat(serviceMaterialsTotal.base)   || 0;
    const mm     = parseFloat(serviceMaterialsTotal.markup) || 0;
    return { labour: labour.toFixed(2), materialsBase: mb.toFixed(2), materialsMarkup: mm.toFixed(2), total: (labour + mb + mm).toFixed(2) };
  };

  const uploadImage = async (file, userId) => {
    const ext  = file.name.split(".").pop();
    const path = `service-images/${userId}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("service-images").upload(path, file, { upsert: true });
    if (error) throw error;
    return supabase.storage.from("service-images").getPublicUrl(path).data?.publicUrl;
  };

  const handleChange = (f, v) => setTempService(p => ({ ...p, [f]: v }));

  // excludeId: pass the current service_id when editing a Reusable (to not flag itself as duplicate)
  const checkDuplicate = async (title, excludeId = null) => {
    if (!title?.trim()) { setDuplicateError(null); return; }
    let q = supabase.from("service").select("service_id")
      .eq("business_id", profile.business_id).eq("service_type", "Reusable")
      .eq("main_service", true).ilike("title", title.trim());
    if (excludeId) q = q.neq("service_id", excludeId);
    const { data } = await q;
    setDuplicateError(data?.length
      ? `A Reusable service named "${title.trim()}" already exists in the catalogue. Rename before saving.`
      : null);
  };

  const handleAlsoMakeReusable = (checked) => {
    setAlsoMakeReusable(checked);
    if (checked) checkDuplicate(tempService?.title);
    else setDuplicateError(null);
  };

  const handleImageUpload = (file) => {
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setTempService(p => ({ ...p, image_url: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleGenImage = async () => {
    const q = tempService?.title?.trim();
    if (!q) return;
    setFetchingImage(true);
    try {
      const url = await fetchPexelsImage(q, pexelsPageRef.current);
      if (url) { setTempService(p => ({ ...p, image_url: url })); pexelsPageRef.current++; }
    } catch {} finally { setFetchingImage(false); }
  };

  const openMaterials = async () => {
    if (!currentServiceId) {
      if (!tempService?.title?.trim()) { setError("Please enter a service title before assigning materials."); return; }
      setSaving(true); setError(null);
      try {
        let imageUrl = tempService.image_url;
        if (imageFile) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) imageUrl = await uploadImage(imageFile, user.id);
        }
        const { data: ins, error: e } = await supabase.from("service").insert([{
          title:        tempService.title,
          description:  tempService.description,
          hours:        parseFloat(tempService.hours) || 0,
          image_url:    imageUrl,
          business_id:  profile.business_id,
          main_service: true,
          service_type: tempService.service_type || "Reusable",
        }]).select().maybeSingle();
        if (e) throw e;
        setCurrentServiceId(ins.service_id);
        setServiceAutoCreated(true);
      } catch (err) { setError(err.message || "Failed to save service"); setSaving(false); return; }
      finally { setSaving(false); }
    }
    setIsMaterialsOpen(true);
  };

  const saveChanges = async () => {
    if (!tempService || saving) return;
    const fe = {};
    if (!tempService.title.trim()) fe.title = "Title is required.";
    if (!tempService.hours || parseFloat(tempService.hours) <= 0) fe.hours = "Labour hours are required and must be greater than 0.";
    if (Object.keys(fe).length) { setFieldErrors(fe); return; }
    setFieldErrors({});
    setSaving(true); setError(null);

    try {
      let imageUrl = tempService.image_url;
      if (imageFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) imageUrl = await uploadImage(imageFile, user.id);
      }

      const originalId = originalServiceIdRef.current;

      // Helper: create a Reusable copy and carry material links over from originalId
      const createReusableCopy = async () => {
        const { data: newSvc, error: ce } = await supabase.from("service").insert([{
          title:           tempService.title,
          description:     tempService.description,
          hours:           parseFloat(tempService.hours) || 0,
          image_url:       imageUrl,
          business_id:     profile.business_id,
          service_type:    "Reusable",
          main_service:    true,
          main_service_id: null,
        }]).select("service_id").single();
        if (ce) throw ce;
        const { data: mats } = await supabase
          .from("material_service_link")
          .select("material_id, quantity, sort_order")
          .eq("service_id", originalId);
        if (mats?.length) {
          await supabase.from("material_service_link").insert(
            mats.map(m => ({
              service_id:  newSvc.service_id,
              material_id: m.material_id,
              business_id: profile.business_id,
              quantity:    m.quantity,
              sort_order:  m.sort_order ?? 0,
            }))
          );
        }
      };

      if (originalType === "Reusable") {
        // Standard Reusable edit / new service
        const payload = {
          title: tempService.title, description: tempService.description,
          hours: parseFloat(tempService.hours) || 0, image_url: imageUrl,
          business_id: profile.business_id, main_service: true, service_type: "Reusable",
        };
        let err;
        if (currentServiceId) {
          ({ error: err } = await supabase.from("service").update(payload)
            .eq("service_id", currentServiceId).eq("business_id", profile.business_id));
        } else {
          ({ error: err } = await supabase.from("service").insert([payload]));
        }
        if (err) throw err;

      } else if (originalType === "Customer Request") {
        // Always promote to Custom; optionally also create Reusable copy
        const payload = {
          title: tempService.title, description: tempService.description,
          hours: parseFloat(tempService.hours) || 0, image_url: imageUrl,
          business_id: profile.business_id, main_service: true, service_type: "Custom",
        };
        const { error: e } = await supabase.from("service").update(payload)
          .eq("service_id", currentServiceId).eq("business_id", profile.business_id);
        if (e) throw e;
        if (alsoMakeReusable) await createReusableCopy();

      } else {
        // Custom service
        if (fieldsEditable) {
          // Draft-linked or unlinked: update the existing record
          const payload = {
            title: tempService.title, description: tempService.description,
            hours: parseFloat(tempService.hours) || 0, image_url: imageUrl,
            business_id: profile.business_id, main_service: true, service_type: "Custom",
          };
          if (currentServiceId) {
            const { error: e } = await supabase.from("service").update(payload)
              .eq("service_id", currentServiceId).eq("business_id", profile.business_id);
            if (e) throw e;
          } else {
            const { error: e } = await supabase.from("service").insert([payload]);
            if (e) throw e;
          }
        }
        // If checkbox ticked: create Reusable copy (whether or not fields were editable)
        if (alsoMakeReusable) await createReusableCopy();
      }

      onSaved?.();
      onClose();
    } catch (err) { setError(err.message || "Failed to save service"); }
    finally { setSaving(false); }
  };

  const handleCancel = async () => {
    if (serviceAutoCreated && currentServiceId) {
      await supabase.from("material_service_link").delete().eq("service_id", currentServiceId).eq("business_id", profile.business_id);
      await supabase.from("service").delete().eq("service_id", currentServiceId).eq("business_id", profile.business_id);
      onSaved?.();
    }
    onClose();
  };

  const confirmDelete = async () => {
    if (!currentServiceId) return;
    setSaving(true); setError(null);
    try {
      await supabase.from("material_service_link").delete().eq("service_id", currentServiceId).eq("business_id", profile.business_id);
      const { error: e } = await supabase.from("service").delete().eq("service_id", currentServiceId).eq("business_id", profile.business_id);
      if (e) throw e;
      onSaved?.();
      onClose();
    } catch (err) { setError("Failed to delete service"); setSaving(false); }
  };

  if (!tempService) return null;

  // Editable unless it's a Custom service linked to a live (non-Draft) quote
  const fieldsEditable = !linkedToNonDraftQuote || originalType === "Customer Request";

  const showDeleteBtn   = !hideDelete && isEditMode && !serviceAutoCreated && canDelete;
  const materialsActive = fieldsEditable && !(!currentServiceId && !tempService?.title?.trim());
  // Save visible if fields are editable OR the reusable copy checkbox is ticked — but not if there's a duplicate title conflict
  const showSave        = (fieldsEditable || alsoMakeReusable) && !duplicateError;

  const formTitle = isEditMode && !serviceAutoCreated ? "Edit Service" : "Add Service";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-zinc-900 rounded-2xl w-full max-w-md" style={{ height: "90vh", display: "flex", flexDirection: "column" }}>

          <h2 className="text-lg font-bold px-5 pt-5 pb-3" style={{ flexShrink: 0, paddingLeft: "24px", paddingRight: "24px" }}>{formTitle}</h2>

          <div className="px-5 pb-3 space-y-3" style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0, paddingLeft: "24px", paddingRight: "24px" }}>
            {error && (
              <div className="bg-red-500/10 border border-red-500 rounded-xl p-3 text-red-200 text-sm">{error}</div>
            )}

            {/* Read-only notice */}
            {linkedToNonDraftQuote && !fieldsEditable && (
              <div className="bg-zinc-800 border border-zinc-600 rounded-xl p-3 text-zinc-400 text-xs">
                This service is linked to a live quote and cannot be edited. Tick{" "}
                <span style={{ color: "#34d399", fontWeight: 700 }}>Also add as a reusable service</span> at the bottom to save a copy to your catalogue — the quote is not affected.
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Service Title</label>
              <input
                className="w-full p-2 rounded-xl bg-zinc-950 text-white text-sm"
                style={{ border: fieldErrors.title ? "1px solid #ef4444" : "1px solid #3f3f46", opacity: fieldsEditable ? 1 : 0.55 }}
                value={tempService.title}
                readOnly={!fieldsEditable}
                onChange={e => {
                  if (!fieldsEditable) return;
                  handleChange("title", e.target.value);
                  setFieldErrors(p => ({ ...p, title: null }));
                  if (originalType === "Reusable") checkDuplicate(e.target.value, currentServiceId);
                  else if (alsoMakeReusable) checkDuplicate(e.target.value);
                }}
                placeholder="Enter service title"
              />
              {fieldErrors.title && <p className="text-red-400 text-xs mt-1">{fieldErrors.title}</p>}
            </div>

            {/* Duplicate error — shown for Reusable services near the title */}
            {duplicateError && originalType === "Reusable" && (
              <p className="text-red-400 text-xs">{duplicateError}</p>
            )}

            {/* Description */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Description</label>
              <textarea className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm resize-none"
                style={{ opacity: fieldsEditable ? 1 : 0.55, resize: "vertical", width: "100%", boxSizing: "border-box" }}
                value={tempService.description}
                readOnly={!fieldsEditable}
                onChange={e => { if (!fieldsEditable) return; handleChange("description", e.target.value); }}
                rows={2} placeholder="Enter service description (optional)" />
            </div>

            {/* Labour Hours */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Labour (Hours)</label>
              <input
                className="w-full p-2 rounded-xl bg-zinc-950 text-white text-sm"
                style={{ border: fieldErrors.hours ? "1px solid #ef4444" : "1px solid #3f3f46", opacity: fieldsEditable ? 1 : 0.55 }}
                inputMode="decimal"
                value={tempService.hours}
                readOnly={!fieldsEditable}
                onChange={e => { if (!fieldsEditable) return; handleChange("hours", sanitize(e.target.value)); setFieldErrors(p => ({ ...p, hours: null })); }}
                placeholder="Enter estimated hours"
              />
              {fieldErrors.hours && <p className="text-red-400 text-xs mt-1">{fieldErrors.hours}</p>}
            </div>

            {/* Materials */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Materials</label>
              <button type="button" onClick={openMaterials} disabled={!materialsActive}
                style={{
                  width: "100%", padding: "8px", borderRadius: "6px",
                  fontSize: "14px", fontWeight: 700, border: "none",
                  cursor: materialsActive ? "pointer" : "not-allowed",
                  background: materialsActive ? "#38bdf8" : "#3f3f46",
                  color:      materialsActive ? "#000"    : "#71717a",
                  transition: "background 0.15s",
                }}>
                Materials
              </button>
            </div>

            {/* Price Breakdown */}
            {tempService.hours && (
              <div className="p-3 bg-zinc-800 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Labour ({tempService.hours}h × £{hourlyRate}):</span>
                  <span>£{calcTotals(tempService.hours).labour}</span>
                </div>
                {selectedMaterialIds.length > 0 && (
                  <>
                    <div className="flex justify-between text-zinc-400">
                      <span>Materials (Base, No VAT):</span>
                      <span>£{calcTotals(tempService.hours).materialsBase}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Materials markup:</span>
                      <span>£{calcTotals(tempService.hours).materialsMarkup}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sky-400 font-bold pt-1 border-t border-zinc-700">
                  <span>Total (No VAT):</span>
                  <span>£{calcTotals(tempService.hours).total}</span>
                </div>
              </div>
            )}

            {/* Service Image */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Service Image</label>
              <div className="flex gap-2 items-center">
                <input type="file" accept="image/*"
                  disabled={!fieldsEditable}
                  onChange={e => { if (!fieldsEditable) return; handleImageUpload(e.target.files[0]); }}
                  className="flex-1 text-xs text-zinc-300"
                  style={{ opacity: fieldsEditable ? 1 : 0.4, pointerEvents: fieldsEditable ? "auto" : "none" }} />
                <button type="button" onClick={handleGenImage}
                  disabled={!fieldsEditable || fetchingImage || !tempService?.title?.trim()}
                  className="px-3 py-1.5 bg-zinc-700 text-white text-xs rounded-xl hover:bg-zinc-600 disabled:opacity-40 whitespace-nowrap">
                  {fetchingImage ? "Searching…" : "Generate Image"}
                </button>
              </div>
              {tempService?.image_url && (
                <img src={tempService.image_url} alt="preview" className="mt-2 w-full h-20 object-cover rounded-lg" />
              )}
            </div>

            {/* Also add as reusable — only for Custom and Customer Request */}
            {originalType !== "Reusable" && (
              <div style={{
                padding: "12px", borderRadius: "6px", transition: "all 0.15s",
                background: alsoMakeReusable ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${alsoMakeReusable ? "#34d399" : "#3f3f46"}`,
              }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={alsoMakeReusable}
                    onChange={e => handleAlsoMakeReusable(e.target.checked)}
                    style={{ width: "16px", height: "16px", flexShrink: 0, marginTop: "2px", accentColor: "#34d399", cursor: "pointer" }}
                  />
                  <span style={{ lineHeight: "1.4" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: alsoMakeReusable ? "#34d399" : "#a1a1aa", transition: "color 0.15s" }}>
                      Also add as a reusable service
                    </span>
                    <span style={{ display: "block", fontSize: "11px", color: "#71717a", marginTop: "2px" }}>
                      Saves a copy of this service to your reusable catalogue
                    </span>
                  </span>
                </label>

                {/* Duplicate error shown below the checkbox */}
                {duplicateError && alsoMakeReusable && (
                  <p style={{ marginTop: "8px", fontSize: "12px", color: "#f87171" }}>{duplicateError}</p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-5 py-4 border-t border-zinc-800" style={{ flexShrink: 0, paddingLeft: "24px", paddingRight: "24px" }}>
            {showDeleteBtn ? (
              <button onClick={() => setDeleteConfirm(true)} disabled={saving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 disabled:opacity-50">
                Delete
              </button>
            ) : <div />}
            <div className="flex gap-3">
              <button onClick={handleCancel} disabled={saving}
                className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800 disabled:opacity-50">
                Cancel
              </button>
              {showSave && (
                <button onClick={saveChanges} disabled={saving}
                  className="px-4 py-2 text-sm bg-sky-400 text-black rounded-xl font-bold hover:bg-sky-300 disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6">
          <div className="bg-zinc-900 rounded-2xl p-5 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-3">Delete Service</h2>
            <p className="text-zinc-300 text-sm mb-5">Are you sure? This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(false)} disabled={saving}
                className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={saving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 disabled:opacity-50">
                {saving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Materials modal */}
      {isMaterialsOpen && (
        <MaterialServiceLink
          isOpen={true}
          onClose={() => setIsMaterialsOpen(false)}
          serviceId={currentServiceId}
          profile={profile}
          onSave={(totals) => {
            if (totals) setServiceMaterialsTotal(totals);
            setIsMaterialsOpen(false);
            fetchMatTotals(currentServiceId);
          }}
        />
      )}
    </>
  );
}
