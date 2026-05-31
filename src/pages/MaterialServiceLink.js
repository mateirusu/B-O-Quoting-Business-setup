import { useState, useEffect, useCallback, useRef } from "react"; // useCallback kept for fetchAllMaterials / fetchLinkedMaterials
import { supabase } from "../supabaseClient";

export default function MaterialServiceLink({
  isOpen,
  onClose,
  serviceId,
  profile,
  onSave,
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
            business_id
          )
        `)
        .eq("service_id", serviceId);

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
      fetchAllMaterials();
      if (serviceId) {
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
    const updated = [...linkedMaterials];
    updated[index] = {
      ...updated[index],
      materialId: material.material_id,
      name: material.name,
      basePrice: material.base_price_no_vat,
      markup: material.markup,
      imageUrl: material.image_url,
      businessId: material.business_id,
    };
    setLinkedMaterials(updated);
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
  const addNewMaterialToDb = async (materialData, linkToService = true) => {
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

  // Remove material from service
  const removeMaterial = async (index) => {
    const material = linkedMaterials[index];

    try {
      setSaving(true);

      if (material.linkId) {
        const { error } = await supabase
          .from("material_service_link")
          .delete()
          .eq("link_id", material.linkId);

        if (error) throw error;
      }

      // Remove from local state
      const updated = linkedMaterials.filter((_, i) => i !== index);
      const updatedOriginal = originalMaterials.filter((_, i) => i !== index);
      setLinkedMaterials(updated);
      setOriginalMaterials(updatedOriginal);
    } catch (err) {
      console.error("Error removing material:", err);
      setError("Failed to remove material");
    } finally {
      setSaving(false);
    }
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

  // Save all changes
  const saveChanges = async () => {
    if (!serviceId) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      setError(null);

      for (let i = 0; i < linkedMaterials.length; i++) {
        const material = linkedMaterials[i];
        const original = originalMaterials[i];

        if (!material.materialId && !material.name.trim()) continue;

        if (material.linkId) {
          // Existing link — always update quantity
          const qty = parseInt(material.quantity) || 1;
          const { error: linkError } = await supabase
            .from("material_service_link")
            .update({ quantity: qty })
            .eq("link_id", material.linkId);
          if (linkError) throw linkError;

          // Update material properties if changed
          if (material.materialId && original) {
            const materialChanged =
              material.name !== original.name ||
              material.basePrice !== original.basePrice ||
              material.markup !== original.markup;

            if (materialChanged) {
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
          }
        } else if (material.materialId) {
          // New link for existing material
          const qty = parseInt(material.quantity) || 1;
          const { error } = await supabase
            .from("material_service_link")
            .insert([
              {
                material_id: material.materialId,
                service_id: serviceId,
                business_id: profile.business_id,
                quantity: qty,
              },
            ]);
          if (error) throw error;
        } else if (material.name.trim()) {
          // New material — create and link
          await addNewMaterialToDb(material, true);
        }
      }

      await fetchLinkedMaterials();
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
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl p-5 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <h2 className="text-lg font-bold mb-4">Materials for this Service</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500 rounded-xl p-3 text-red-200 text-sm mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-zinc-400">Loading...</div>
        ) : (
          <>
            {/* Materials Table */}
            <div className="flex-1 overflow-auto min-h-0 mb-4">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: '28px' }} />
                  <col style={{ width: '56px' }} />
                  <col />
                  <col style={{ width: '125px' }} />
                  <col style={{ width: '96px' }} />
                  <col style={{ width: '88px' }} />
                  <col style={{ width: '72px' }} />
                  <col style={{ width: '80px' }} />
                </colgroup>
                <thead className="bg-zinc-800 sticky top-0">
                  <tr>
                    <th className="p-3"></th>
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
                      Total
                    </th>
                    <th className="p-3 text-center text-xs font-bold text-zinc-400 uppercase">
                      Actions
                    </th>
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
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`border-b border-zinc-800 transition-colors ${dragOverIndex === index && dragIndex !== index ? 'bg-sky-500/10 border-sky-500/40' : 'hover:bg-zinc-800/50'}`}
                      >
                        <td className="p-2 text-center cursor-grab active:cursor-grabbing select-none text-zinc-500 hover:text-zinc-300">
                          ⠿
                        </td>
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
                            onChange={(e) => handleNameChange(index, e.target.value)}
                            onFocus={() => {
                              setActiveDropdownIndex(index);
                              setDropdownSearchQuery(material.name);
                            }}
                            className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                            placeholder="Search or type..."
                          />
                          {showDropdown && filteredMaterials.length > 0 && (
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
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.]/g, "");
                              handleRowChange(index, "basePrice", val);
                            }}
                            className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={material.markup}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.]/g, "");
                              handleRowChange(index, "markup", val);
                            }}
                            className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
                            placeholder="0"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={material.quantity}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, "");
                              handleRowChange(index, "quantity", val);
                            }}
                            className="w-full p-1 rounded bg-zinc-950 border border-zinc-700 text-sm"
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
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-2">
                            {/* Show Update button only if material has changes and is not new */}
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add Button */}
            <div className="mb-4">
              <button
                onClick={addEmptyRow}
                className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl hover:bg-zinc-700 text-sm text-left"
              >
                + Add Material
              </button>
            </div>

            {/* Summary */}
            {linkedMaterials.length > 0 && (
              <div className="p-3 bg-zinc-800 rounded-xl mb-4 space-y-1 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>
                    Materials ({linkedMaterials.filter(m => m.materialId || m.name.trim()).length}):
                  </span>
                  <span>
                    £{calculateMaterialsTotal().base}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Markup:</span>
                  <span>
                    £{calculateMaterialsTotal().markup}
                  </span>
                </div>
                <div className="flex justify-between text-sky-400 font-bold pt-1 border-t border-zinc-700">
                  <span>Total Materials:</span>
                  <span>
                    £{calculateMaterialsTotal().total}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            onClick={onClose}
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
  );
}