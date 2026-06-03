import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import MaterialServiceLink from "./MaterialServiceLink";

/**
 * ServiceQuoteLink — modal for assigning services to a quote.
 *
 * Modes:
 *  - Local  (quoteId=null): manages in-memory; creates new Custom services in DB on save;
 *                           returns [{serviceId, name, task, quantity}] via onSave.
 *  - DB     (quoteId set):  reads/writes quote_service_link directly.
 */
export default function ServiceQuoteLink({
  isOpen,
  onClose,
  profile,
  quoteId = null,
  initialServices = [],
  onSave,
}) {
  const [linkedServices, setLinkedServices]     = useState([]);
  const [originalServices, setOriginalServices] = useState([]);
  const [allServices, setAllServices]           = useState([]);
  const [loading, setLoading]                   = useState(false);
  const [saving, setSaving]                     = useState(false);
  const [error, setError]                       = useState(null);

  const [activeDropdown, setActiveDropdown]     = useState(null);
  const [dropdownSearch, setDropdownSearch]     = useState("");
  const [pendingDeletes, setPendingDeletes]     = useState([]);
  const [showSaveDialog, setShowSaveDialog]     = useState(false);

  const [dragIndex, setDragIndex]               = useState(null);
  const [dragOverIndex, setDragOverIndex]       = useState(null);

  const [materialsEditIndex, setMaterialsEditIndex] = useState(null);

  const linkedRef = useRef(linkedServices);
  useEffect(() => { linkedRef.current = linkedServices; }, [linkedServices]);

  // ── Fetch all services for this business ───────────────────────────────────
  const fetchAllServices = useCallback(async () => {
    if (!profile?.business_id) return;
    const { data } = await supabase
      .from("service")
      .select("service_id, title, description, hours")
      .eq("business_id", profile.business_id)
      .eq("main_service", true)
      .eq("service_type", "Reusable")
      .order("title");
    setAllServices(data ?? []);
  }, [profile?.business_id]);

  // ── Fetch linked services (DB mode) ────────────────────────────────────────
  const fetchLinkedServices = useCallback(async () => {
    if (!quoteId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("quote_service_link")
      .select("quote_service_link_id, service_id, task, quantity, service:service_id(title, description)")
      .eq("quote_id", quoteId)
      .order("created_at");
    if (error) { setError("Failed to load services."); setLoading(false); return; }
    const rows = (data ?? []).map(r => ({
      linkId:          r.quote_service_link_id,
      serviceId:       r.service_id,
      name:            r.service?.title || "",
      task:            r.task || "",
      quantity:        String(r.quantity ?? 1),
      materialsPending: null,
    }));
    setLinkedServices(rows);
    setOriginalServices(rows.map(r => ({ ...r })));
    setLoading(false);
  }, [quoteId]);

  useEffect(() => {
    if (!isOpen) return;
    setPendingDeletes([]);
    setError(null);
    setShowSaveDialog(false);
    fetchAllServices();
    if (quoteId) {
      fetchLinkedServices();
    } else {
      const rows = initialServices.map(s => ({
        linkId: null, serviceId: s.serviceId, name: s.name, task: s.task || "", quantity: String(s.quantity ?? 1), materialsPending: null,
      }));
      setLinkedServices(rows);
      setOriginalServices(rows.map(r => ({ ...r })));
    }
  }, [isOpen, quoteId]);

  // Safety timeouts
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(t);
  }, [loading]);
  useEffect(() => {
    if (!saving) return;
    const t = setTimeout(() => setSaving(false), 12000);
    return () => clearTimeout(t);
  }, [saving]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (activeDropdown !== null && !e.target.closest(".sql-dropdown")) {
        setActiveDropdown(null); setDropdownSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeDropdown]);

  // ── Change detection ───────────────────────────────────────────────────────
  const hasMaterialChanges = (pending) => {
    if (!pending) return false;
    const { materials, originalMaterials, pendingDeleteLinkIds } = pending;
    if (pendingDeleteLinkIds.length > 0) return true;
    for (let i = 0; i < materials.length; i++) {
      const m = materials[i];
      if (!m.materialId && !m.name?.trim()) continue;
      if (!m.linkId) return true; // new link
      const o = originalMaterials[i];
      if (!o) return true;
      if (m.name !== o.name || m.basePrice !== o.basePrice || m.markup !== o.markup || m.quantity !== o.quantity) return true;
    }
    return false;
  };

  const isServiceModified = index => {
    if (!originalServices[index]) return false;
    const row = linkedServices[index];
    if (row?.name !== originalServices[index].name) return true;
    if (hasMaterialChanges(row?.materialsPending)) return true;
    return false;
  };

  const hasModifiedExistingServices = () =>
    linkedServices.some((s, i) => s.serviceId && isServiceModified(i));

  // ── Row helpers ────────────────────────────────────────────────────────────
  const handleRowChange = (index, field, value) =>
    setLinkedServices(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));

  const handleNameChange = (index, value) => {
    handleRowChange(index, "name", value);
    setDropdownSearch(value);
    setActiveDropdown(index);
  };

  const selectService = (index, svc) => {
    setLinkedServices(prev => prev.map((r, i) =>
      i === index ? { ...r, serviceId: svc.service_id, name: svc.title, task: r.task || svc.description || "" } : r
    ));
    if (!originalServices[index]) {
      const updated = [...originalServices];
      while (updated.length <= index) updated.push(null);
      const row = linkedServices[index];
      updated[index] = { ...row, serviceId: svc.service_id, name: svc.title };
      setOriginalServices(updated);
    }
    setActiveDropdown(null); setDropdownSearch("");
  };

  const availableServices = (search, currentIndex) => {
    const usedIds = linkedServices.filter((_, i) => i !== currentIndex && _.serviceId).map(s => s.serviceId);
    return allServices
      .filter(s => !usedIds.includes(s.service_id) && s.title.toLowerCase().includes((search || "").toLowerCase()))
      .slice(0, 8);
  };

  const addEmptyRow = () =>
    setLinkedServices(prev => [...prev, { linkId: null, serviceId: null, name: "", task: "", quantity: "1", materialsPending: null }]);

  const removeRow = index => {
    const row = linkedServices[index];
    if (row.linkId) setPendingDeletes(prev => [...prev, row.linkId]);
    setLinkedServices(prev => prev.filter((_, i) => i !== index));
    setOriginalServices(prev => prev.filter((_, i) => i !== index));
  };

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const handleDragStart = (e, i) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver  = (e, i) => { e.preventDefault(); if (i !== dragOverIndex) setDragOverIndex(i); };
  const handleDrop      = (e, i) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) { setDragIndex(null); setDragOverIndex(null); return; }
    const reorder = arr => { const c = [...arr]; const [x] = c.splice(dragIndex, 1); c.splice(i, 0, x); return c; };
    setLinkedServices(reorder(linkedServices));
    setOriginalServices(reorder(originalServices));
    setDragIndex(null); setDragOverIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  // ── Materials modal callback ───────────────────────────────────────────────
  const handleMaterialsSaved = (index, pending) => {
    setLinkedServices(prev => prev.map((r, i) => i === index ? { ...r, materialsPending: pending } : r));
    setMaterialsEditIndex(null);
  };

  // isNameModified: only the service title changed (separate from material changes)
  const isNameModified = index => {
    if (!originalServices[index]) return false;
    return linkedServices[index]?.name !== originalServices[index].name;
  };

  // ── Inline Update button — immediately writes name + material changes to DB ──
  const updateService = async index => {
    const row = linkedServices[index];
    if (!row.serviceId) return;
    setSaving(true); setError(null);
    try {
      if (isNameModified(index)) {
        const { data, error } = await supabase
          .from("service").update({ title: row.name }).eq("service_id", row.serviceId).select("service_id, title").single();
        if (error) throw new Error(error.message || "Failed to update service.");
        setOriginalServices(prev => prev.map((s, i) => i === index ? { ...s, name: data.title } : s));
        setAllServices(prev => prev.map(s => s.service_id === row.serviceId ? { ...s, title: data.title } : s));
      }
      if (hasMaterialChanges(row.materialsPending)) {
        await saveMaterialsForRow(row.serviceId, row.materialsPending, "update");
        setLinkedServices(prev => prev.map((r, i) => i === index ? { ...r, materialsPending: null } : r));
      }
    } catch (err) {
      setError(err.message || "Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  // ── Create a new Custom service in DB ─────────────────────────────────────
  const createCustomService = async row => {
    const { data, error } = await supabase
      .from("service")
      .insert({
        title:        row.name.trim(),
        description:  row.task  || null,
        hours:        1,
        business_id:  profile.business_id,
        service_type: "Custom",
        main_service: true,
        main_service_id: null,
      })
      .select("service_id, title")
      .single();
    if (error) throw error;
    return data;
  };

  // ── Save materials to a service (called during bulk save) ─────────────────
  const saveMaterialsForRow = async (serviceId, pending, mode) => {
    if (!pending || !serviceId) return;
    const { materials, originalMaterials, pendingDeleteLinkIds } = pending;
    const defaultImg = "https://images.unsplash.com/photo-1581090464777-f3220bbe1b8b?q=80&w=1200&auto=format&fit=crop";

    if (mode === "update") {
      for (const linkId of pendingDeleteLinkIds) {
        const { error } = await supabase.from("material_service_link").delete().eq("link_id", linkId);
        if (error) throw error;
      }
      for (let i = 0; i < materials.length; i++) {
        const m = materials[i];
        if (!m.materialId && !m.name?.trim()) continue;
        const o = originalMaterials[i];
        const isModified = !!o && !!m.materialId && (m.name !== o.name || m.basePrice !== o.basePrice || m.markup !== o.markup);
        if (m.linkId) {
          const { error: le } = await supabase.from("material_service_link").update({ quantity: parseInt(m.quantity) || 1, sort_order: i }).eq("link_id", m.linkId);
          if (le) throw le;
          if (isModified) {
            const { error: me } = await supabase.from("material").update({ name: m.name, base_price_no_vat: parseFloat(m.basePrice) || 0, markup: parseFloat(m.markup) || 0 }).eq("material_id", m.materialId);
            if (me) throw me;
          }
        } else if (m.materialId) {
          if (isModified) {
            const { error: me } = await supabase.from("material").update({ name: m.name, base_price_no_vat: parseFloat(m.basePrice) || 0, markup: parseFloat(m.markup) || 0 }).eq("material_id", m.materialId);
            if (me) throw me;
          }
          const { error: le } = await supabase.from("material_service_link").insert([{ material_id: m.materialId, service_id: serviceId, business_id: profile.business_id, quantity: parseInt(m.quantity) || 1, sort_order: i }]);
          if (le) throw le;
        } else if (m.name?.trim()) {
          const { data: nm, error: ne } = await supabase.from("material").insert([{ name: m.name, base_price_no_vat: parseFloat(m.basePrice) || 0, markup: parseFloat(m.markup) || 0, image_url: m.imageUrl || defaultImg, business_id: profile.business_id }]).select().maybeSingle();
          if (ne) throw ne;
          const { error: le } = await supabase.from("material_service_link").insert([{ material_id: nm.material_id, service_id: serviceId, business_id: profile.business_id, quantity: parseInt(m.quantity) || 1, sort_order: i }]);
          if (le) throw le;
        }
      }
    } else {
      // create-new: link all materials fresh to the new service (don't touch original service's links)
      for (let i = 0; i < materials.length; i++) {
        const m = materials[i];
        if (!m.materialId && !m.name?.trim()) continue;
        const o = originalMaterials[i];
        const isModified = !!o && !!m.materialId && (m.name !== o.name || m.basePrice !== o.basePrice || m.markup !== o.markup);
        let materialId = m.materialId;
        if (isModified || (!materialId && m.name?.trim())) {
          const { data: nm, error: ne } = await supabase.from("material").insert([{ name: m.name, base_price_no_vat: parseFloat(m.basePrice) || 0, markup: parseFloat(m.markup) || 0, image_url: m.imageUrl || defaultImg, business_id: profile.business_id }]).select().maybeSingle();
          if (ne) throw ne;
          materialId = nm.material_id;
        }
        if (materialId) {
          const { error: le } = await supabase.from("material_service_link").insert([{ material_id: materialId, service_id: serviceId, business_id: profile.business_id, quantity: parseInt(m.quantity) || 1, sort_order: i }]);
          if (le) throw le;
        }
      }
    }
  };

  // ── Bulk save (called directly or from dialog) ────────────────────────────
  const saveChanges = async (mode = "update") => {
    setSaving(true); setError(null);
    try {
      if (quoteId) {
        // Commit deferred service removals
        for (const id of pendingDeletes)
          await supabase.from("quote_service_link").delete().eq("quote_service_link_id", id);

        for (let i = 0; i < linkedServices.length; i++) {
          const row = linkedServices[i];
          if (!row.serviceId && !row.name.trim()) continue;
          const qty = Math.max(1, parseInt(row.quantity) || 1);
          const isModified = !!row.serviceId && isServiceModified(i);
          let finalServiceId = row.serviceId;

          if (!row.serviceId && row.name.trim()) {
            const newSvc = await createCustomService(row);
            finalServiceId = newSvc.service_id;
            await supabase.from("quote_service_link").insert({ quote_id: quoteId, service_id: finalServiceId, task: row.task || null, quantity: qty });
          } else if (row.linkId) {
            await supabase.from("quote_service_link").update({ task: row.task || null, quantity: qty }).eq("quote_service_link_id", row.linkId);
            if (mode === "update" && isModified && row.name !== originalServices[i]?.name) {
              await supabase.from("service").update({ title: row.name }).eq("service_id", row.serviceId);
            } else if (mode === "create-new" && isModified) {
              const newSvc = await createCustomService(row);
              finalServiceId = newSvc.service_id;
              await supabase.from("quote_service_link").update({ service_id: finalServiceId }).eq("quote_service_link_id", row.linkId);
            }
          } else if (row.serviceId) {
            if (mode === "update" && isModified && row.name !== originalServices[i]?.name) {
              await supabase.from("service").update({ title: row.name }).eq("service_id", row.serviceId);
            } else if (mode === "create-new" && isModified) {
              const newSvc = await createCustomService(row);
              finalServiceId = newSvc.service_id;
            }
            await supabase.from("quote_service_link").insert({ quote_id: quoteId, service_id: finalServiceId, task: row.task || null, quantity: qty });
          }

          if (hasMaterialChanges(row.materialsPending)) {
            const matMode = (mode === "create-new" && isModified) ? "create-new" : "update";
            await saveMaterialsForRow(finalServiceId, row.materialsPending, matMode);
          }
        }
        if (onSave) onSave();
      } else {
        // Local mode — create new services in DB, return full resolved list
        const resolved = [];
        for (let i = 0; i < linkedServices.length; i++) {
          const row = linkedServices[i];
          if (!row.serviceId && !row.name.trim()) continue;
          const isModified = !!row.serviceId && isServiceModified(i);
          let finalServiceId = row.serviceId;

          if (!row.serviceId && row.name.trim()) {
            const newSvc = await createCustomService(row);
            finalServiceId = newSvc.service_id;
            resolved.push({ serviceId: finalServiceId, name: newSvc.title, task: row.task, quantity: row.quantity });
          } else if (row.serviceId) {
            if (mode === "update" && isModified && row.name !== originalServices[i]?.name) {
              await supabase.from("service").update({ title: row.name }).eq("service_id", row.serviceId);
            } else if (mode === "create-new" && isModified) {
              const newSvc = await createCustomService(row);
              finalServiceId = newSvc.service_id;
            }
            resolved.push({ serviceId: finalServiceId, name: row.name, task: row.task, quantity: row.quantity });
          }

          if (hasMaterialChanges(row.materialsPending)) {
            const matMode = (mode === "create-new" && isModified) ? "create-new" : "update";
            await saveMaterialsForRow(finalServiceId, row.materialsPending, matMode);
          }
        }
        if (onSave) onSave(resolved);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // ── Save entry point ───────────────────────────────────────────────────────
  const handleSave = () => {
    if (hasModifiedExistingServices()) {
      setShowSaveDialog(true);
    } else {
      saveChanges("update");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-3xl" style={{ height: "85vh", display: "flex", flexDirection: "column" }}>

        {/* Sticky header */}
        <div className="px-5 pt-5 pb-3" style={{ flexShrink: 0 }}>
          <h2 className="text-lg font-bold">Services for this Quote</h2>
          {error && <div className="bg-red-500/10 border border-red-500 rounded-xl p-3 text-red-200 text-sm mt-3">{error}</div>}
        </div>

        {/* Scrollable body */}
        <div className="px-5" style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0 }}>
          {loading ? (
            <div className="text-center py-8 text-zinc-400">Loading…</div>
          ) : (
            <>
              <div className="mb-4">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col style={{ width: "28px" }} />
                    <col style={{ width: "26%" }} />
                    <col />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "72px" }} />
                    <col style={{ width: "110px" }} />
                  </colgroup>
                  <thead className="bg-zinc-800 sticky top-0">
                    <tr>
                      <th className="p-3"></th>
                      <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">Service</th>
                      <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">Task</th>
                      <th className="p-3 text-center text-xs font-bold text-zinc-400 uppercase">Materials</th>
                      <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">Qty</th>
                      <th className="p-3 text-center text-xs font-bold text-zinc-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedServices.map((row, index) => {
                      const filtered    = activeDropdown === index ? availableServices(dropdownSearch || row.name, index) : [];
                      const showDrop    = activeDropdown === index && (dropdownSearch || row.name);
                      const isNew       = !originalServices[index];
                      const hasService  = !!(row.serviceId || row.name.trim());
                      const matChanged  = hasMaterialChanges(row.materialsPending);
                      const anyChanged  = isServiceModified(index);

                      return (
                        <tr
                          key={index}
                          draggable
                          onDragStart={e => handleDragStart(e, index)}
                          onDragOver={e => handleDragOver(e, index)}
                          onDrop={e => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`border-b border-zinc-800 transition-colors ${dragOverIndex === index && dragIndex !== index ? "bg-sky-500/10 border-sky-500/40" : "hover:bg-zinc-800/50"}`}
                        >
                          <td className="p-2 text-center cursor-grab active:cursor-grabbing select-none text-zinc-500 hover:text-zinc-300">⠿</td>

                          {/* Service name + dropdown */}
                          <td className="p-3 sql-dropdown" style={{ position: "relative" }}>
                            <input
                              type="text"
                              value={row.name}
                              onChange={e => handleNameChange(index, e.target.value)}
                              onFocus={() => { setActiveDropdown(index); setDropdownSearch(row.name); }}
                              className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                              placeholder="Search or type…"
                            />
                            {showDrop && filtered.length > 0 && (
                              <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl max-h-48 overflow-y-auto">
                                {filtered.map(s => (
                                  <div key={s.service_id} onClick={() => selectService(index, s)}
                                    className="p-2 hover:bg-zinc-700 cursor-pointer text-sm">{s.title}</div>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Task */}
                          <td className="p-3">
                            <input type="text" value={row.task}
                              onChange={e => handleRowChange(index, "task", e.target.value)}
                              className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                              placeholder="Describe the task…"
                            />
                          </td>

                          {/* Materials button */}
                          <td className="p-3 text-center">
                            {hasService && (
                              <button
                                onClick={() => setMaterialsEditIndex(index)}
                                disabled={saving}
                                className={`px-2 py-1 text-xs rounded font-semibold disabled:opacity-50 transition ${matChanged ? "bg-sky-500 text-black hover:bg-sky-400" : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"}`}
                                title="Edit materials for this service"
                              >
                                {matChanged ? "Materials *" : "Materials"}
                              </button>
                            )}
                          </td>

                          {/* Quantity */}
                          <td className="p-3">
                            <input type="text" value={row.quantity}
                              onChange={e => handleRowChange(index, "quantity", e.target.value.replace(/[^0-9]/g, ""))}
                              className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                              placeholder="1"
                            />
                          </td>

                          {/* Actions */}
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-2">
                              {anyChanged && !isNew && (
                                <button onClick={() => updateService(index)} disabled={saving}
                                  className="px-2 py-1 text-xs bg-sky-500 text-black rounded font-bold hover:bg-sky-400 disabled:opacity-50">
                                  Update
                                </button>
                              )}
                              <button onClick={() => removeRow(index)} disabled={saving}
                                className="w-6 h-6 flex items-center justify-center bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-50"
                                title="Remove">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mb-4">
                <button onClick={addEmptyRow}
                  className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl hover:bg-zinc-700 text-sm">
                  + Add Service
                </button>
              </div>

              {linkedServices.filter(r => r.serviceId || r.name.trim()).length > 0 && (
                <div className="p-3 bg-zinc-800 rounded-xl mb-4 text-xs text-zinc-400">
                  {linkedServices.filter(r => r.serviceId || r.name.trim()).length} service
                  {linkedServices.filter(r => r.serviceId || r.name.trim()).length !== 1 ? "s" : ""} selected
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-zinc-800" style={{ flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-sky-500 text-black rounded-xl font-bold hover:bg-sky-400 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Save mode dialog — shown when existing services have been edited */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-base font-bold mb-3">Changes Detected</h3>
            <p className="text-sm text-zinc-300 mb-4">
              You've edited one or more services (name or materials) that may be used elsewhere. How would you like to proceed?
            </p>
            <ul className="text-sm text-zinc-400 mb-5 space-y-2">
              <li><span className="text-white font-semibold">Update Services</span> — apply all changes (name + materials) to the existing service records. Every quote using them will be affected.</li>
              <li><span className="text-white font-semibold">Create New Services</span> — duplicate the changed services with the new details for this quote only. Other quotes keep the originals unchanged.</li>
              <li><span className="text-white font-semibold">Cancel</span> — go back without saving.</li>
            </ul>
            <div className="flex flex-wrap gap-3 justify-end">
              <button onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800">Cancel</button>
              <button onClick={() => { setShowSaveDialog(false); saveChanges("create-new"); }}
                className="px-4 py-2 text-sm bg-sky-500 text-black rounded-xl font-bold hover:bg-sky-400">Create New Services</button>
              <button onClick={() => { setShowSaveDialog(false); saveChanges("update"); }}
                className="px-4 py-2 text-sm bg-sky-500 text-black rounded-xl font-bold hover:bg-sky-400">Update Services</button>
            </div>
          </div>
        </div>
      )}

      {/* Materials editor — deferred mode, writes to DB only when ServiceQuoteLink saves */}
      {materialsEditIndex !== null && (
        <MaterialServiceLink
          isOpen={true}
          onClose={() => setMaterialsEditIndex(null)}
          serviceId={linkedServices[materialsEditIndex]?.serviceId || null}
          profile={profile}
          deferredMode={true}
          initialState={linkedServices[materialsEditIndex]?.materialsPending ?? null}
          onSave={pending => handleMaterialsSaved(materialsEditIndex, pending)}
        />
      )}
    </div>
  );
}
