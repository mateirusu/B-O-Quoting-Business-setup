import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../supabaseClient";
import MaterialServiceLink from "../../Settings/Services/MaterialServiceLink";

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

  const [dragIndex, setDragIndex]               = useState(null);
  const [dragOverIndex, setDragOverIndex]       = useState(null);

  const [materialsEditIndex, setMaterialsEditIndex] = useState(null);
  const [hourlyRate, setHourlyRate] = useState(0);

  const linkedRef = useRef(linkedServices);
  useEffect(() => { linkedRef.current = linkedServices; }, [linkedServices]);

  // ── Fetch all services for this business ───────────────────────────────────
  const fetchAllServices = useCallback(async () => {
    if (!profile?.business_id) return;
    const [{ data: svcs }, { data: pricing }] = await Promise.all([
      supabase.from("service").select("service_id, title, description, hours").eq("business_id", profile.business_id).eq("main_service", true).eq("service_type", "Reusable").order("title"),
      supabase.from("basic_pricing").select("hourly_rate").eq("business_id", profile.business_id).maybeSingle(),
    ]);
    setAllServices(svcs ?? []);
    setHourlyRate(parseFloat(pricing?.hourly_rate) || 0);
  }, [profile?.business_id]);

  // ── Fetch linked services (DB mode) ────────────────────────────────────────
  const fetchLinkedServices = useCallback(async () => {
    if (!quoteId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("quote_service_link")
      .select("quote_service_link_id, service_id, task, quantity, service:service_id(title, description, service_type, hours)")
      .eq("quote_id", quoteId)
      .order("created_at");
    if (error) { setError("Failed to load services."); setLoading(false); return; }
    const rows = (data ?? []).map(r => ({
      linkId:          r.quote_service_link_id,
      serviceId:       r.service_id,
      name:            r.service?.title || "",
      task:            r.task || "",
      quantity:        String(r.quantity ?? 1),
      serviceType:     r.service?.service_type || "Reusable",
      hours:           parseFloat(r.service?.hours) || 0,
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
    fetchAllServices();
    if (quoteId) {
      fetchLinkedServices();
    } else {
      const rows = initialServices.map(s => ({
        linkId:          null,
        serviceId:       s.sourceServiceId || s.serviceId || null,
        name:            s.name,
        task:            s.task || "",
        quantity:        String(s.quantity ?? 1),
        serviceType:     s.serviceType || "Custom",
        hours:           parseFloat(s.hours) || 0,
        materialsPending: s.materialsPending || null,
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
    if (parseFloat(row?.hours) !== parseFloat(originalServices[index].hours)) return true;
    if (hasMaterialChanges(row?.materialsPending)) return true;
    return false;
  };

  const isHoursModified = index => {
    if (!originalServices[index]) return false;
    return parseFloat(linkedServices[index]?.hours) !== parseFloat(originalServices[index].hours);
  };

  const hasModifiedExistingServices = () =>
    linkedServices.some((s, i) => s.serviceId && s.serviceType === "Reusable" && isServiceModified(i));

  const isTypeChanged = index => {
    if (!originalServices[index]) return false;
    return linkedServices[index]?.serviceType !== originalServices[index].serviceType;
  };

  const svcTypeRowStyle = t => {
    if (t === "Customer Request") return { background: "rgba(245,158,11,0.18)" };
    if (t === "Custom")           return { background: "rgba(56,189,248,0.15)" };
    if (t === "Reusable")         return { background: "rgba(52,211,153,0.10)" };
    return {};
  };

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
      i === index ? {
        ...r,
        serviceId:       svc.service_id,
        name:            svc.title,
        task:            svc.description || "",
        hours:           parseFloat(svc.hours) || 0,
        quantity:        "1",
        materialsPending: null,
      } : r
    ));
    if (!originalServices[index]) {
      const updated = [...originalServices];
      while (updated.length <= index) updated.push(null);
      const row = linkedServices[index];
      updated[index] = { ...row, serviceId: svc.service_id, name: svc.title, hours: svc.hours ?? 0 };
      setOriginalServices(updated);
    }
    setActiveDropdown(null); setDropdownSearch("");
  };

  const availableServices = (search, currentIndex) => {
    const usedNames = new Set(
      linkedServices
        .filter((_, i) => i !== currentIndex && _.name.trim())
        .map(s => s.name.trim().toLowerCase())
    );
    return allServices
      .filter(s => !usedNames.has(s.title.toLowerCase()) && s.title.toLowerCase().includes((search || "").toLowerCase()))
      .slice(0, 8);
  };

  const addEmptyRow = () =>
    setLinkedServices(prev => [...prev, { linkId: null, serviceId: null, name: "", task: "", quantity: "1", materialsPending: null }]);

  const removeRow = index => {
    const row = linkedServices[index];
    if (row.linkId) setPendingDeletes(prev => [...prev, { linkId: row.linkId, serviceId: row.serviceId, serviceType: row.serviceType }]);
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
      if (isNameModified(index) || isHoursModified(index)) {
        const updates = {};
        if (isNameModified(index)) updates.title = row.name;
        if (isHoursModified(index)) updates.hours = parseFloat(row.hours) || 0;
        const { error } = await supabase.from("service").update(updates).eq("service_id", row.serviceId);
        if (error) throw new Error(error.message || "Failed to update service.");
        setOriginalServices(prev => prev.map((s, i) => i === index ? { ...s, name: updates.title ?? s.name, hours: updates.hours ?? s.hours } : s));
        if (updates.title) setAllServices(prev => prev.map(s => s.service_id === row.serviceId ? { ...s, title: updates.title } : s));
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

  // ── Create a new Custom service in DB (from a typed name) ────────────────
  const createCustomService = async row => {
    const { data, error } = await supabase
      .from("service")
      .insert({
        title:        row.name.trim(),
        description:  row.task  || null,
        hours:        parseFloat(row.hours) || 1,
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

  // ── Copy a Reusable template into a new Custom service (with material links) ──
  const copyServiceAsCustom = async (sourceId, overrides = {}) => {
    const { data: src } = await supabase.from("service").select("*").eq("service_id", sourceId).single();
    if (!src) throw new Error("Source service not found");

    const { data: copy, error: ce } = await supabase.from("service").insert({
      title:           overrides.title       ?? src.title,
      description:     overrides.description ?? src.description,
      hours:           overrides.hours       ?? src.hours,
      image_url:       src.image_url,
      business_id:     profile.business_id,
      service_type:    "Custom",
      main_service:    true,
      main_service_id: null,
    }).select("service_id").single();
    if (ce) throw ce;

    // Mirror material links from the template
    const { data: mats } = await supabase
      .from("material_service_link")
      .select("material_id, quantity, sort_order")
      .eq("service_id", sourceId);
    if (mats?.length) {
      await supabase.from("material_service_link").insert(
        mats.map(m => ({
          service_id:  copy.service_id,
          material_id: m.material_id,
          business_id: profile.business_id,
          quantity:    m.quantity,
          sort_order:  m.sort_order ?? 0,
        }))
      );
    }

    return copy.service_id;
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

  // ── Bulk save ─────────────────────────────────────────────────────────────
  // Reusable services are templates — always copy them as Custom when linking to a quote.
  // Custom / Customer Request services are per-quote copies — update in-place.
  const saveChanges = async () => {
    setSaving(true); setError(null);
    try {
      if (quoteId) {
        // Commit deferred removals; delete orphaned Custom/Customer Request services
        for (const del of pendingDeletes) {
          await supabase.from("quote_service_link").delete().eq("quote_service_link_id", del.linkId);
          if (del.serviceId && (del.serviceType === "Custom" || del.serviceType === "Customer Request")) {
            const { count } = await supabase.from("quote_service_link")
              .select("quote_service_link_id", { count: "exact", head: true })
              .eq("service_id", del.serviceId);
            if (!count) {
              await supabase.from("material_service_link").delete().eq("service_id", del.serviceId);
              await supabase.from("service").delete().eq("service_id", del.serviceId);
            }
          }
        }

        for (let i = 0; i < linkedServices.length; i++) {
          const row = linkedServices[i];
          if (!row.serviceId && !row.name.trim()) continue;
          const qty             = Math.max(1, parseInt(row.quantity) || 1);
          const origType        = originalServices[i]?.serviceType;
          // User promoted this row to Reusable — save template first, then copy as Custom for the quote
          const becomingReusable = isTypeChanged(i) && row.serviceType === "Reusable";

          // A row needs a copy if: new link to a Reusable template, OR being promoted to Reusable,
          // OR an existing Reusable link where something actually changed.
          // Do NOT copy on every save with no changes — that would reset hours to the template value.
          const needsCopy = row.linkId
            ? (becomingReusable || (origType === "Reusable" && isServiceModified(i)))
            : !!(row.serviceId);
          let finalServiceId = row.serviceId;

          if (!row.serviceId && row.name.trim()) {
            // Typed name — brand-new Custom service
            const newSvc = await createCustomService(row);
            finalServiceId = newSvc.service_id;
            await supabase.from("quote_service_link").insert({ quote_id: quoteId, service_id: finalServiceId, task: row.task || null, quantity: qty });

          } else if (needsCopy) {
            const overrides = {};
            if (isNameModified(i))  overrides.title = row.name;
            // Always carry the UI hours into the copy — prevents template's hours (which may
            // be 0 or stale) from overwriting what the user sees and expects to persist.
            overrides.hours = parseFloat(row.hours) || 0;
            // If being promoted to Reusable, persist that to the original record before copying
            if (becomingReusable) {
              await supabase.from("service").update({ service_type: "Reusable" }).eq("service_id", row.serviceId);
            }
            finalServiceId = await copyServiceAsCustom(row.serviceId, overrides);
            if (row.linkId) {
              await supabase.from("quote_service_link").update({ service_id: finalServiceId, task: row.task || null, quantity: qty }).eq("quote_service_link_id", row.linkId);
            } else {
              await supabase.from("quote_service_link").insert({ quote_id: quoteId, service_id: finalServiceId, task: row.task || null, quantity: qty });
            }

          } else {
            // Custom or Customer Request — update in-place
            if (isServiceModified(i) && row.serviceId) {
              const updates = {};
              if (isNameModified(i))  updates.title = row.name;
              if (isHoursModified(i)) updates.hours = parseFloat(row.hours) || 0;
              if (Object.keys(updates).length) await supabase.from("service").update(updates).eq("service_id", row.serviceId);
            }
            if (row.linkId) {
              await supabase.from("quote_service_link").update({ task: row.task || null, quantity: qty }).eq("quote_service_link_id", row.linkId);
            } else {
              await supabase.from("quote_service_link").insert({ quote_id: quoteId, service_id: finalServiceId, task: row.task || null, quantity: qty });
            }
          }

          if (hasMaterialChanges(row.materialsPending)) {
            await saveMaterialsForRow(finalServiceId, row.materialsPending, "update");
          }
          // Apply type change for Custom↔CustomerRequest reclassification only.
          // Reusable originals are already handled (copied as Custom); becomingReusable is handled above.
          if (isTypeChanged(i) && finalServiceId && origType !== "Reusable" && !becomingReusable) {
            await supabase.from("service").update({ service_type: row.serviceType }).eq("service_id", finalServiceId);
          }
        }

        const hasCustomerRequests = linkedServices.some(r => r.serviceType === "Customer Request");
        if (onSave) onSave(hasCustomerRequests);

      } else {
        // Local mode — no DB writes. Collect an in-memory recipe for AddJobModal to
        // materialise when the user presses "Add Job".
        const resolved = [];
        for (let i = 0; i < linkedServices.length; i++) {
          const row = linkedServices[i];
          if (!row.serviceId && !row.name.trim()) continue;
          resolved.push({
            sourceServiceId:  row.serviceId || null,   // Reusable template (or null if typed)
            isNewTyped:       !row.serviceId,
            name:             row.name,
            task:             row.task,
            quantity:         row.quantity,
            hours:            parseFloat(row.hours) || 0,
            serviceType:      row.serviceType || "Custom",
            materialsPending: row.materialsPending || null,
          });
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
  const handleSave = () => saveChanges();

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
                    <col style={{ width: "22%" }} />
                    <col />
                    <col style={{ width: "72px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "72px" }} />
                    <col style={{ width: "130px" }} />
                  </colgroup>
                  <thead className="bg-zinc-800 sticky top-0">
                    <tr>
                      <th className="p-3"></th>
                      <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">Service</th>
                      <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">Task</th>
                      <th className="p-3 text-center text-xs font-bold text-zinc-400 uppercase">Labour</th>
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

                      const rowType = row.serviceType || "Reusable";
                      const isCustomerRequest = rowType === "Customer Request";
                      const rowStyle = dragOverIndex === index && dragIndex !== index
                        ? { background: "rgba(56,189,248,0.1)" }
                        : svcTypeRowStyle(rowType);

                      return (
                        <tr
                          key={index}
                          onDragOver={e => handleDragOver(e, index)}
                          onDrop={e => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          style={{ ...rowStyle, position: "relative", zIndex: activeDropdown === index ? 100 : "auto" }}
                          className="border-b border-zinc-800 transition-colors"
                        >
                          <td
                            className="p-2 text-center cursor-grab active:cursor-grabbing select-none text-zinc-500 hover:text-zinc-300"
                            draggable
                            onDragStart={e => handleDragStart(e, index)}
                          >⠿</td>

                          {/* Service name + dropdown */}
                          <td className="p-3 sql-dropdown" style={{ position: "relative", zIndex: activeDropdown === index ? 200 : "auto" }}>
                            <input
                              type="text"
                              value={row.name}
                              onChange={e => handleNameChange(index, e.target.value)}
                              onFocus={() => { setActiveDropdown(index); setDropdownSearch(row.name); }}
                              className="w-full p-1 bg-zinc-950 border border-zinc-700 text-sm"
                              style={{ borderRadius: "6px" }}
                              placeholder="Search or type…"
                            />
                            {showDrop && filtered.length > 0 && (
                              <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 max-h-48 overflow-y-auto" style={{ borderRadius: "6px" }}>
                                {filtered.map(s => (
                                  <div key={s.service_id} onClick={() => selectService(index, s)}
                                    className="p-2 hover:bg-zinc-700 cursor-pointer text-sm">{s.title}</div>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Task */}
                          <td className="p-3">
                            <textarea
                              value={row.task}
                              onChange={e => {
                                handleRowChange(index, "task", e.target.value);
                                e.target.style.height = "auto";
                                e.target.style.height = e.target.scrollHeight + "px";
                              }}
                              onFocus={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                              className="w-full p-1 bg-zinc-950 border border-zinc-700 text-sm"
                              placeholder="Describe the task…"
                              rows={1}
                              style={{ resize: "none", overflow: "hidden", minHeight: "28px", lineHeight: "1.4", whiteSpace: "pre-wrap", wordBreak: "break-word", borderRadius: "6px" }}
                            />
                          </td>

                          {/* Labour hours — editable, follows same save rules as name */}
                          <td className="p-3">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.hours}
                              onChange={e => {
                                const v = e.target.value.replace(/[^0-9.]/g, "");
                                const parts = v.split(".");
                                handleRowChange(index, "hours", parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : v);
                              }}
                              className="w-full p-1 bg-zinc-950 border border-zinc-700 text-sm text-center"
                              style={{ borderRadius: "6px" }}
                              placeholder="0"
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
                              className="w-full p-1 bg-zinc-950 border border-zinc-700 text-sm"
                              style={{ borderRadius: "6px" }}
                              placeholder="1"
                            />
                          </td>

                          {/* Actions */}
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              {isCustomerRequest && (
                                <>
                                  <button
                                    onClick={() => handleRowChange(index, "serviceType", "Custom")}
                                    disabled={saving}
                                    style={{ padding: "2px 8px", fontSize: "11px", fontWeight: 700, borderRadius: "6px", border: "none", cursor: saving ? "not-allowed" : "pointer", background: "#38bdf8", color: "#000", opacity: saving ? 0.5 : 1 }}
                                    title="Mark as Custom">
                                    Custom
                                  </button>
                                  <button
                                    onClick={() => handleRowChange(index, "serviceType", "Reusable")}
                                    disabled={saving}
                                    style={{ padding: "2px 8px", fontSize: "11px", fontWeight: 700, borderRadius: "6px", border: "none", cursor: saving ? "not-allowed" : "pointer", background: "#34d399", color: "#000", opacity: saving ? 0.5 : 1 }}
                                    title="Mark as Reusable">
                                    Reusable
                                  </button>
                                </>
                              )}
                              {anyChanged && !isNew && rowType === "Reusable" && (
                                <button onClick={() => updateService(index)} disabled={saving}
                                  className="px-2 py-1 text-xs bg-sky-500 text-black rounded font-bold hover:bg-sky-400 disabled:opacity-50">
                                  Update Template
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
