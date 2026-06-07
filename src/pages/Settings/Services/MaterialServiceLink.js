import { useState, useEffect, useCallback, useRef } from "react"; // useCallback kept for fetchAllMaterials / fetchLinkedMaterials
import { supabase } from "../../../supabaseClient";

export default function MaterialServiceLink({
  isOpen,
  onClose,
  serviceId,
  profile,
  onSave,
  deferredMode = false,
  initialState = null,
  readOnly = false,
}) {
  const [linkedMaterials, setLinkedMaterials] = useState([]);
  const [allMaterials, setAllMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeDropdownIndex, setActiveDropdownIndex] = useState(null);
  const [dropdownSearchQuery, setDropdownSearchQuery] = useState("");
  const [originalMaterials, setOriginalMaterials] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingDeleteLinkIds, setPendingDeleteLinkIds] = useState([]);
  
  // Use refs to always have access to the latest state
  const linkedMaterialsRef = useRef(linkedMaterials);
  const originalMaterialsRef = useRef(originalMaterials);
  const savingRef = useRef(saving);
  const serviceIdRef = useRef(serviceId);
  const profileRef = useRef(profile);
  
  // Keep refs in sync with state
  useEffect(() => {
    linkedMaterialsRef.current = linkedMaterials;
  }, [linkedMaterials]);
  
  useEffect(() => {
    originalMaterialsRef.current = originalMaterials;
  }, [originalMaterials]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    serviceIdRef.current = serviceId;
  }, [serviceId]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Fetch all materials for the user's business
  const fetchAllMaterials = useCallback(async () => {
    if (!profile?.business_id) return;

    try {
      const { data, error } = await supabase
        .from("material")
        .select("*")
        .eq("business_id", profile.business_id)
        .order("name");

      if (error) throw error;
      setAllMaterials(data || []);
    } catch (err) {
      console.error("Error fetching materials:", err);
    }
  }, [profile?.business_id]);

  // Fetch linked materials for the service
  const fetchLinkedMaterials = useCallback(async () => {
    if (!serviceId) {
      setLinkedMaterials([]);
      setOriginalMaterials([]);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("material_service_link")
        .select(`
          *,
          material:material_id (
            material_id,
            name,
            base_price_no_vat,
            markup,
            image_url,
            business_id,
            code,
            supplier,
            supplier_url
          )
        `)
        .eq("service_id", serviceId)
        .eq("business_id", profile.business_id)
        .order("sort_order", { ascending: true, nullsFirst: false });

      if (error) throw error;

      // Transform data for easier handling - ensure all values are strings for consistent comparison
      const transformed = data.map((link) => ({
        linkId: link.link_id,
        materialId: link.material_id,
        quantity: String(link.quantity ?? "0"),
        name: link.material?.name || "",
        basePrice: String(link.material?.base_price_no_vat ?? "0"),
        markup: String(link.material?.markup ?? "0"),
        imageUrl: link.material?.image_url || "",
        businessId: link.material?.business_id || profile?.business_id,
        code: link.material?.code || "",
        supplier: link.material?.supplier || "",
        supplierUrl: link.material?.supplier_url || "",
      }));

      setLinkedMaterials(transformed);
      setOriginalMaterials(transformed.map(m => ({...m}))); // Store copy of original data
    } catch (err) {
      const msg = err.name === 'AbortError'
        ? 'Loading timed out — please close and reopen this panel to retry.'
        : 'Failed to load linked materials';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [serviceId, profile?.business_id]);

  useEffect(() => {
    if (isOpen) {
      setPendingDeleteLinkIds([]);
      fetchAllMaterials();
      if (deferredMode && initialState !== null) {
        // Restore previously saved deferred state (preserves deletions and original baselines)
        setLinkedMaterials(initialState.materials ?? []);
        setOriginalMaterials(initialState.originalMaterials ?? []);
        setPendingDeleteLinkIds(initialState.pendingDeleteLinkIds ?? []);
      } else if (serviceId) {
        fetchLinkedMaterials();
      } else {
        setLinkedMaterials([]);
        setOriginalMaterials([]);
      }
    }
  }, [isOpen, serviceId, fetchAllMaterials, fetchLinkedMaterials]);

  // Safety net: if loading is stuck, unblock after 8 seconds.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(false);
      setError('Loading timed out — please close and reopen this panel.');
    }, 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Safety net: if saving is stuck (e.g. previous request aborted mid-flight),
  // force-reset after 12 seconds so the Update / Save buttons become clickable again.
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => {
      setSaving(false);
    }, 12000);
    return () => clearTimeout(timer);
  }, [saving]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeDropdownIndex !== null && !event.target.closest('.dropdown-container')) {
        setActiveDropdownIndex(null);
        setDropdownSearchQuery("");
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeDropdownIndex]);

  // Check if a material row has been modified (for showing Update button)
  const isMaterialModified = (index) => {
    if (!originalMaterials[index]) return false;
    const original = originalMaterials[index];
    const current = linkedMaterials[index];
    
    // Only check name, basePrice, markup (not quantity or imageUrl)
    return (
      current.name !== original.name ||
      current.basePrice !== original.basePrice ||
      current.markup !== original.markup
    );
  };

  // Handle changes to a row
  const handleRowChange = (index, field, value) => {
    const updated = [...linkedMaterials];
    updated[index] = { ...updated[index], [field]: value };
    setLinkedMaterials(updated);
  };

  // Handle name field change with search
  const handleNameChange = (index, value) => {
    // Update the row with the new name, but keep price, markup, AND materialId
    // The materialId is kept so the Update button can still work
    const updated = [...linkedMaterials];
    updated[index] = { 
      ...updated[index], 
      name: value
      // Keep materialId, basePrice, markup, imageUrl unchanged
    };
    setLinkedMaterials(updated);
    
    setDropdownSearchQuery(value);
    setActiveDropdownIndex(index);
  };

  // Select material from dropdown
  const selectMaterial = (index, material) => {
    const selectedData = {
      ...linkedMaterials[index],
      materialId: material.material_id,
      name: material.name,
      basePrice: String(material.base_price_no_vat ?? "0"),
      markup: String(material.markup ?? "0"),
      imageUrl: material.image_url,
      businessId: material.business_id,
      code: material.code || "",
      supplier: material.supplier || "",
      supplierUrl: material.supplier_url || "",
    };

    const updated = [...linkedMaterials];
    updated[index] = selectedData;
    setLinkedMaterials(updated);

    // For new rows originalMaterials has no entry at this index.
    // Record the baseline now so isMaterialModified can detect subsequent edits
    // and the Update button appears when the user changes a field.
    if (!originalMaterials[index]) {
      const updatedOriginals = [...originalMaterials];
      while (updatedOriginals.length <= index) updatedOriginals.push(null);
      updatedOriginals[index] = { ...selectedData };
      setOriginalMaterials(updatedOriginals);
    }

    setActiveDropdownIndex(null);
    setDropdownSearchQuery("");
  };

  // Get filtered materials for dropdown
  const getFilteredMaterials = (searchQuery, currentIndex) => {
    const currentMaterialId = linkedMaterials[currentIndex]?.materialId;
    const linkedMaterialIds = linkedMaterials
      .filter((m, i) => i !== currentIndex && m.materialId)
      .map(m => m.materialId);
    
    return allMaterials.filter(m =>
      m.business_id === profile?.business_id &&
      m.name.toLowerCase().includes((searchQuery || "").toLowerCase()) &&
      m.material_id !== currentMaterialId &&
      !linkedMaterialIds.includes(m.material_id)
    ).slice(0, 8);
  };

  // Update material in database
  const updateMaterial = async (index) => {
    const material = linkedMaterials[index];

    if (!material?.materialId) {
      setError("No material ID found for this item");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("material")
        .update({
          name: material.name,
          base_price_no_vat: parseFloat(material.basePrice) || 0,
          markup: parseFloat(material.markup) || 0,
        })
        .eq("material_id", material.materialId)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("Update returned no rows — the material table may be missing an UPDATE RLS policy");
      }

      const updatedMaterial = {
        ...material,
        name: data[0].name,
        basePrice: String(data[0].base_price_no_vat),
        markup: String(data[0].markup),
      };

      setLinkedMaterials(prev => prev.map((m, i) => i === index ? updatedMaterial : m));
      setOriginalMaterials(prev => prev.map((m, i) => i === index ? updatedMaterial : m));

    } catch (err) {
      setError(
        err.name === 'AbortError'
          ? 'Request timed out — please try again'
          : err.message || "Failed to update material"
      );
    } finally {
      setSaving(false);
    }
  };

  // Add new material to database
  const addNewMaterialToDb = async (materialData, linkToService = true, sortOrder = 0) => {
    try {
      setSaving(true);

      const newMaterial = {
        name: materialData.name,
        base_price_no_vat: materialData.basePrice,
        markup: materialData.markup,
        image_url:
          materialData.imageUrl ||
          "https://images.unsplash.com/photo-1581090464777-f3220bbe1b8b?q=80&w=1200&auto=format&fit=crop",
        business_id: profile.business_id,
      };

      const { data: insertData, error: insertError } = await supabase
        .from("material")
        .insert([newMaterial])
        .select()
        .maybeSingle();

      if (insertError) throw insertError;

      if (linkToService && serviceId) {
        // Create link with quantity
        const { error: linkError } = await supabase
          .from("material_service_link")
          .insert([
            {
              material_id: insertData.material_id,
              service_id: serviceId,
              business_id: profile.business_id,
              quantity: materialData.quantity || 1,
              sort_order: sortOrder,
            },
          ]);

        if (linkError) throw linkError;
      }

      return insertData;
    } catch (err) {
      console.error("Error adding new material:", err);
      setError("Failed to add new material");
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Remove material from service — deferred: DB delete happens only on Save
  const removeMaterial = (index) => {
    const material = linkedMaterials[index];
    if (material.linkId) {
      setPendingDeleteLinkIds(prev => [...prev, material.linkId]);
    }
    setLinkedMaterials(prev => prev.filter((_, i) => i !== index));
    setOriginalMaterials(prev => prev.filter((_, i) => i !== index));
  };

  // Add empty row for new material
  const addEmptyRow = () => {
    const newEntry = {
      linkId: null,
      materialId: null,
      quantity: "1",
      name: "",
      basePrice: "0",
      markup: "0",
      imageUrl: "",
      businessId: profile?.business_id,
    };

    setLinkedMaterials([...linkedMaterials, newEntry]);
  };

  // Drag-and-drop reordering
  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragOverIndex) setDragOverIndex(index);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reorder = (arr) => {
      const copy = [...arr];
      const [item] = copy.splice(dragIndex, 1);
      copy.splice(index, 0, item);
      return copy;
    };
    setLinkedMaterials(reorder(linkedMaterials));
    setOriginalMaterials(reorder(originalMaterials));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Returns true if any existing (DB) material has had name/price/markup changed
  const hasModifiedExistingMaterials = () =>
    linkedMaterials.some((m, i) => m.materialId && isMaterialModified(i));

  // Save all changes — mode: 'update' edits existing records, 'create-new' duplicates them
  const saveChanges = async (mode = 'update') => {
    // Deferred mode: return state to caller without writing to DB
    if (deferredMode) {
      if (onSave) onSave({
        materials: [...linkedMaterials],
        originalMaterials: [...originalMaterials],
        pendingDeleteLinkIds: [...pendingDeleteLinkIds],
      });
      onClose();
      return;
    }

    if (!serviceId) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Commit deferred removals
      for (const linkId of pendingDeleteLinkIds) {
        const { error } = await supabase
          .from("material_service_link")
          .delete()
          .eq("link_id", linkId);
        if (error) throw error;
      }

      for (let i = 0; i < linkedMaterials.length; i++) {
        const material = linkedMaterials[i];

        if (!material.materialId && !material.name.trim()) continue;

        const isModified = material.materialId && isMaterialModified(i);

        if (mode === 'create-new' && isModified) {
          // Create a new material record with the edited values
          const { data: newMat, error: newMatErr } = await supabase
            .from("material")
            .insert([{
              name: material.name,
              base_price_no_vat: parseFloat(material.basePrice) || 0,
              markup: parseFloat(material.markup) || 0,
              image_url: material.imageUrl || "https://images.unsplash.com/photo-1581090464777-f3220bbe1b8b?q=80&w=1200&auto=format&fit=crop",
              business_id: profile.business_id,
              code: material.code || null,
              supplier: material.supplier || null,
              supplier_url: material.supplierUrl || null,
            }])
            .select()
            .maybeSingle();
          if (newMatErr) throw newMatErr;

          if (material.linkId) {
            // Redirect existing link to the new material
            const { error: linkErr } = await supabase
              .from("material_service_link")
              .update({ material_id: newMat.material_id, quantity: parseInt(material.quantity) || 1, sort_order: i })
              .eq("link_id", material.linkId);
            if (linkErr) throw linkErr;
          } else {
            // Create a new link for the new material
            const { error: linkErr } = await supabase
              .from("material_service_link")
              .insert([{ material_id: newMat.material_id, service_id: serviceId, business_id: profile.business_id, quantity: parseInt(material.quantity) || 1, sort_order: i }]);
            if (linkErr) throw linkErr;
          }
        } else if (material.linkId) {
          // Existing link — update quantity and sort order
          const qty = parseInt(material.quantity) || 1;
          const { error: linkError } = await supabase
            .from("material_service_link")
            .update({ quantity: qty, sort_order: i })
            .eq("link_id", material.linkId);
          if (linkError) throw linkError;

          // Update material record if changed (update mode only)
          if (mode === 'update' && isModified) {
            const { error: matError } = await supabase
              .from("material")
              .update({
                name: material.name,
                base_price_no_vat: parseFloat(material.basePrice) || 0,
                markup: parseFloat(material.markup) || 0,
              })
              .eq("material_id", material.materialId);
            if (matError) throw matError;
          }
        } else if (material.materialId) {
          // New link for an existing (unmodified) material
          const qty = parseInt(material.quantity) || 1;

          // If update mode and the material was changed, update its record first
          if (mode === 'update' && isModified) {
            const { error: matError } = await supabase
              .from("material")
              .update({
                name: material.name,
                base_price_no_vat: parseFloat(material.basePrice) || 0,
                markup: parseFloat(material.markup) || 0,
              })
              .eq("material_id", material.materialId);
            if (matError) throw matError;
          }

          const { error } = await supabase
            .from("material_service_link")
            .insert([{ material_id: material.materialId, service_id: serviceId, business_id: profile.business_id, quantity: qty, sort_order: i }]);
          if (error) throw error;
        } else if (material.name.trim()) {
          // Brand-new material typed by the user — create and link
          await addNewMaterialToDb(material, true, i);
        }
      }

      if (onSave) {
        const materialsTotal = calculateMaterialsTotal();
        onSave(materialsTotal);
      }
      onClose();
    } catch (err) {
      console.error("Error saving changes:", err);
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  // Calculate materials total
  const calculateMaterialsTotal = () => {
    const baseTotal = linkedMaterials.reduce((sum, m) => {
      if (m.materialId || m.name.trim()) {
        const price = parseFloat(m.basePrice) || 0;
        const qty = parseInt(m.quantity) || 1;
        return sum + price * qty;
      }
      return sum;
    }, 0);
    
    const markupTotal = linkedMaterials.reduce((sum, m) => {
      if (m.materialId || m.name.trim()) {
        const price = parseFloat(m.basePrice) || 0;
        const markup = parseFloat(m.markup) || 0;
        const qty = parseInt(m.quantity) || 1;
        return sum + price * (markup / 100) * qty;
      }
      return sum;
    }, 0);

    return {
      base: baseTotal.toFixed(2),
      markup: markupTotal.toFixed(2),
      total: (baseTotal + markupTotal).toFixed(2),
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-4xl" style={{ height: '85vh', display: 'flex', flexDirection: 'column' }}>

        {/* Sticky header */}
        <div className="px-5 pt-5 pb-3" style={{ flexShrink: 0 }}>
          <h2 className="text-lg font-bold">Materials for this Service</h2>
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-xl p-3 text-red-200 text-sm mt-3">
              {error}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="px-5" style={{ flex: '1 1 0', overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <div className="text-center py-8 text-zinc-400">Loading...</div>
        ) : (
          <>
            {/* Materials Table */}
            <div className="mb-4">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  {!readOnly && <col style={{ width: '28px' }} />}
                  <col style={{ width: '56px' }} />
                  <col />
                  <col style={{ width: '125px' }} />
                  <col style={{ width: '96px' }} />
                  <col style={{ width: '88px' }} />
                  <col style={{ width: '72px' }} />
                  {!readOnly && <col style={{ width: '80px' }} />}
                </colgroup>
                <thead className="bg-zinc-800 sticky top-0">
                  <tr>
                    {!readOnly && <th className="p-3"></th>}
                    <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">
                      Image
                    </th>
                    <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">
                      Name
                    </th>
                    <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">
                      Basic Price(£)
                    </th>
                    <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">
                      Markup(%)
                    </th>
                    <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">
                      Quantity
                    </th>
                    <th className="p-3 text-left text-xs font-bold text-zinc-400 uppercase">
                      Price(£)
                    </th>
                    {!readOnly && (
                      <th className="p-3 text-center text-xs font-bold text-zinc-400 uppercase">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {linkedMaterials.map((material, index) => {
                    const filteredMaterials = activeDropdownIndex === index 
                      ? getFilteredMaterials(dropdownSearchQuery || material.name, index)
                      : [];
                    const showDropdown = activeDropdownIndex === index && (dropdownSearchQuery || material.name);
                    const hasChanges = isMaterialModified(index);
                    const isNewMaterial = !originalMaterials[index];

                    return (
                      <tr
                        key={index}
                        {...(!readOnly && {
                          draggable: true,
                          onDragStart: (e) => handleDragStart(e, index),
                          onDragOver: (e) => handleDragOver(e, index),
                          onDrop: (e) => handleDrop(e, index),
                          onDragEnd: handleDragEnd,
                        })}
                        className={`border-b border-zinc-800 transition-colors ${!readOnly && dragOverIndex === index && dragIndex !== index ? 'bg-sky-500/10 border-sky-500/40' : 'hover:bg-zinc-800/50'}`}
                      >
                        {!readOnly && (
                          <td className="p-2 text-center cursor-grab active:cursor-grabbing select-none text-zinc-500 hover:text-zinc-300">
                            ⠿
                          </td>
                        )}
                        <td className="p-3">
                          <img
                            src={material.imageUrl || "https://images.unsplash.com/photo-1581090464777-f3220bbe1b8b?q=80&w=1200&auto=format&fit=crop"}
                            alt={material.name}
                            className="w-10 h-10 object-cover rounded"
                          />
                        </td>
                        <td className="p-3 dropdown-container" style={{ position: 'relative' }}>
                          <input
                            type="text"
                            value={material.name}
                            readOnly={readOnly}
                            onChange={readOnly ? undefined : (e) => handleNameChange(index, e.target.value)}
                            onFocus={readOnly ? undefined : () => {
                              setActiveDropdownIndex(index);
                              setDropdownSearchQuery(material.name);
                            }}
                            className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                            style={readOnly ? { cursor: "default" } : undefined}
                            placeholder="Search or type..."
                          />
                          {!readOnly && showDropdown && filteredMaterials.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl max-h-48 overflow-y-auto">
                              {filteredMaterials.map((m) => (
                                <div
                                  key={m.material_id}
                                  onClick={() => selectMaterial(index, m)}
                                  className="p-2 hover:bg-zinc-700 cursor-pointer text-sm"
                                >
                                  {m.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={material.basePrice}
                            readOnly={readOnly}
                            onChange={readOnly ? undefined : (e) => {
                              const val = e.target.value.replace(/[^0-9.]/g, "");
                              handleRowChange(index, "basePrice", val);
                            }}
                            className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                            style={readOnly ? { cursor: "default" } : undefined}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={material.markup}
                            readOnly={readOnly}
                            onChange={readOnly ? undefined : (e) => {
                              const val = e.target.value.replace(/[^0-9.]/g, "");
                              handleRowChange(index, "markup", val);
                            }}
                            className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                            style={readOnly ? { cursor: "default" } : undefined}
                            placeholder="0"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={material.quantity}
                            readOnly={readOnly}
                            onChange={readOnly ? undefined : (e) => {
                              const val = e.target.value.replace(/[^0-9]/g, "");
                              handleRowChange(index, "quantity", val);
                            }}
                            className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                            style={readOnly ? { cursor: "default" } : undefined}
                            placeholder="0"
                          />
                        </td>
                        <td className="p-3 font-bold text-sky-400">
                          £
                          {(
                            (parseFloat(material.basePrice) || 0) *
                            (1 + (parseFloat(material.markup) || 0) / 100) *
                            (parseInt(material.quantity) || 1)
                          ).toFixed(2)}
                        </td>
                        {!readOnly && (
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-2">
                              {hasChanges && !isNewMaterial && (
                                <button
                                  onClick={() => updateMaterial(index)}
                                  disabled={saving}
                                  className="px-2 py-1 text-xs bg-sky-500 text-black rounded font-bold hover:bg-sky-400 disabled:opacity-50"
                                >
                                  Update
                                </button>
                              )}
                              <button
                                onClick={() => removeMaterial(index)}
                                disabled={saving}
                                className="w-6 h-6 flex items-center justify-center bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-50"
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add Button */}
            {!readOnly && (
              <div className="mb-4">
                <button
                  onClick={addEmptyRow}
                  className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl hover:bg-zinc-700 text-sm text-left"
                >
                  + Add Material
                </button>
              </div>
            )}

            {/* Summary */}
            {linkedMaterials.length > 0 && (
              <div className="p-3 bg-zinc-800 rounded-xl mb-4 space-y-1 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>
                    Materials(No VAT) ({linkedMaterials.filter(m => m.materialId || m.name.trim()).length}):
                  </span>
                  <span>
                    £{calculateMaterialsTotal().base}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Markup(No VAT):</span>
                  <span>
                    £{calculateMaterialsTotal().markup}
                  </span>
                </div>
                <div className="flex justify-between text-sky-400 font-bold pt-1 border-t border-zinc-700">
                  <span>Total Materials(No VAT):</span>
                  <span>
                    £{calculateMaterialsTotal().total}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        </div>{/* end scrollable body */}

        {/* Sticky footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-zinc-800" style={{ flexShrink: 0 }}>
          {readOnly ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800"
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!deferredMode && hasModifiedExistingMaterials()) {
                    setShowSaveDialog(true);
                  } else {
                    saveChanges('update');
                  }
                }}
                disabled={saving}
                className="px-4 py-2 text-sm bg-sky-400 text-black rounded-xl font-bold hover:bg-sky-300 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save mode dialog — shown when existing materials have been edited */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-base font-bold mb-3">Material Changes Detected</h3>
            <p className="text-sm text-zinc-300 mb-4">
              You've edited one or more materials that may be used by other services. How would you like to proceed?
            </p>
            <ul className="text-sm text-zinc-400 mb-5 space-y-2">
              <li>
                <span className="text-white font-semibold">Update Materials</span> — apply your changes to the existing materials. Every service using these materials will be affected.
              </li>
              <li>
                <span className="text-white font-semibold">Create New Materials</span> — duplicate the changed materials with the new details for this service only. Other services keep the originals unchanged.
              </li>
              <li>
                <span className="text-white font-semibold">Cancel</span> — go back and use the individual <em>Update</em> button on each row to update materials one at a time.
              </li>
            </ul>
            <div className="flex flex-wrap gap-3 justify-end">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowSaveDialog(false); saveChanges('create-new'); }}
                className="px-4 py-2 text-sm bg-sky-400 text-black rounded-xl font-bold hover:bg-sky-300"
              >
                Create New Materials
              </button>
              <button
                onClick={() => { setShowSaveDialog(false); saveChanges('update'); }}
                className="px-4 py-2 text-sm bg-sky-400 text-black rounded-xl font-bold hover:bg-sky-300"
              >
                Update Materials
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}