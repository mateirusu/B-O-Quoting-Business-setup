import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

export default function Services() {
  const { profile, loading: authLoading } = useAuth();

  const [search, setSearch] = useState("");
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hourlyRate, setHourlyRate] = useState(null);

  // Materials state
  const [allMaterials, setAllMaterials] = useState([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState([]);
  const [isMaterialsModalOpen, setIsMaterialsModalOpen] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);

  const emptyService = {
    title: "",
    description: "",
    hours: "1",
    image_url:
      "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop",
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [tempService, setTempService] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);

  // Fetch hourly rate from basic_pricing table
  const fetchHourlyRate = useCallback(async () => {
    if (!profile?.business_id) return;

    try {
      const { data, error } = await supabase
        .from("basic_pricing")
        .select("hourly_rate")
        .eq("business_id", profile.business_id)
        .maybeSingle();

      if (error) throw error;

      console.log("Fetched hourly rate:", data);
      setHourlyRate(data?.hourly_rate ?? null);
    } catch (err) {
      console.error("Error fetching hourly rate:", err);
      setHourlyRate(null);
    }
  }, [profile?.business_id]);

  // Fetch services for the user's business
  const fetchServices = useCallback(async () => {
    if (!profile?.business_id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("service")
        .select("*")
        .eq("business_id", profile.business_id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setServices(data || []);
    } catch (err) {
      console.error("Error fetching services:", err);
      setError("Failed to load services");
    } finally {
      setLoading(false);
    }
  }, [profile?.business_id]);

  // Fetch all materials for the user's business
  const fetchAllMaterials = useCallback(async () => {
    if (!profile?.business_id) return;

    try {
      setMaterialsLoading(true);
      const { data, error } = await supabase
        .from("material")
        .select("*")
        .eq("business_id", profile.business_id)
        .order("name");

      if (error) throw error;
      setAllMaterials(data || []);
    } catch (err) {
      console.error("Error fetching materials:", err);
    } finally {
      setMaterialsLoading(false);
    }
  }, [profile?.business_id]);

  // Fetch material-service links for a specific service
  const fetchServiceMaterials = useCallback(async (serviceId) => {
    if (!serviceId) {
      setSelectedMaterialIds([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("material_service_link")
        .select("material_id")
        .eq("service_id", serviceId);

      if (error) throw error;
      setSelectedMaterialIds(data?.map(d => d.material_id) || []);
    } catch (err) {
      console.error("Error fetching service materials:", err);
      setSelectedMaterialIds([]);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && profile?.business_id) {
      fetchHourlyRate();
      fetchServices();
    }
  }, [authLoading, profile?.business_id, fetchHourlyRate, fetchServices]);

  const sanitizeNumberInput = (value) => {
    if (!value) return "";
    let cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    return cleaned;
  };

  const calculatePrice = (hours) => {
    const h = parseFloat(hours);
    if (isNaN(h) || hourlyRate === null) return 0;
    return (h * hourlyRate).toFixed(2);
  };

  const openEditModal = (service) => {
    setIsEditMode(true);
    setEditingServiceId(service.service_id);
    setTempService({
      title: service.title,
      description: service.description || "",
      hours: service.hours.toString(),
      image_url: service.image_url || emptyService.image_url,
    });
    setImageFile(null);
    fetchServiceMaterials(service.service_id);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingServiceId(null);
    setTempService({ ...emptyService });
    setImageFile(null);
    setSelectedMaterialIds([]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingServiceId(null);
    setTempService(null);
    setImageFile(null);
    setSelectedMaterialIds([]);
  };

  // Materials modal handlers
  const openMaterialsModal = () => {
  fetchAllMaterials();
  setIsModalOpen(false);
  setIsMaterialsModalOpen(true);
  };

  const closeMaterialsModal = () => {
  setIsMaterialsModalOpen(false);
  setIsModalOpen(true);
  };

  const toggleMaterialSelection = (materialId) => {
    setSelectedMaterialIds(prev =>
      prev.includes(materialId)
        ? prev.filter(id => id !== materialId)
        : [...prev, materialId]
    );
  };

  const saveMaterialsSelection = async () => {
    // If we're editing an existing service, save links directly
    if (isEditMode && editingServiceId) {
      try {
        setSaving(true);

        // Delete existing links
        await supabase
          .from("material_service_link")
          .delete()
          .eq("service_id", editingServiceId);

        // Insert new links
        if (selectedMaterialIds.length > 0) {
          const links = selectedMaterialIds.map(materialId => ({
            material_id: materialId,
            service_id: editingServiceId,
            profile_id: profile.profile_id,
          }));

          const { error } = await supabase
            .from("material_service_link")
            .insert(links);

          if (error) throw error;
        }
        setIsModalOpen(true);
        setIsMaterialsModalOpen(false);
        await fetchServices();
      } catch (err) {
        console.error("Error saving materials:", err);
        setError("Failed to save materials");
      } finally {
        setSaving(false);
      }
    } else {
      // For new services, just close the modal - links will be saved when service is created
      setIsModalOpen(true);
      setIsMaterialsModalOpen(false);
    }
  };

  // Calculate materials total
  const calculateMaterialsTotal = () => {
    const selectedMaterials = allMaterials.filter(m => selectedMaterialIds.includes(m.material_id));
    const baseTotal = selectedMaterials.reduce((sum, m) => sum + (parseFloat(m.base_price_no_vat) || 0), 0);
    const markupTotal = selectedMaterials.reduce((sum, m) => {
      const base = parseFloat(m.base_price_no_vat) || 0;
      const markup = parseFloat(m.markup) || 0;
      return sum + (base * markup / 100);
    }, 0);
    return {
      base: baseTotal.toFixed(2),
      markup: markupTotal.toFixed(2),
      total: (baseTotal + markupTotal).toFixed(2),
    };
  };

  // Calculate service total price
  const calculateServiceTotal = (hours) => {
    const labour = parseFloat(calculatePrice(hours)) || 0;
    const materials = calculateMaterialsTotal();
    const materialsBase = parseFloat(materials.base) || 0;
    const materialsMarkup = parseFloat(materials.markup) || 0;
    const total = (labour + materialsBase + materialsMarkup).toFixed(2);
    return {
      labour: labour.toFixed(2),
      materialsBase: materialsBase.toFixed(2),
      materialsMarkup: materialsMarkup.toFixed(2),
      total: total,
    };
  };

  // Get selected materials display text
  const getSelectedMaterialsText = () => {
    const count = selectedMaterialIds.length;
    if (count === 0) return "No materials";
    const materials = allMaterials.filter(m => selectedMaterialIds.includes(m.material_id));
    if (count <= 2) return materials.map(m => m.name).join(", ");
    return `${materials.slice(0, 2).map(m => m.name).join(", ")} +${count - 2} more`;
  };

  const uploadImage = async (file, userId) => {
    if (!file) return null;

    const fileExt = file.name.split(".").pop();
    const fileName = `${userId}_${Date.now()}.${fileExt}`;
    const filePath = `service-images/${fileName}`;

    const { data, error } = await supabase.storage
      .from("service-images")
      .upload(filePath, file, { upsert: true });

    if (error) {
      console.error("Image upload error:", error);
      throw error;
    }

    const { data: urlData } = supabase.storage
      .from("service-images")
      .getPublicUrl(filePath);

    return urlData?.publicUrl;
  };

  const saveChanges = async () => {
    if (!tempService || !profile?.business_id) return;
    if (saving) return; // Prevent multiple simultaneous saves

    try {
      setSaving(true);
      setError(null);

      let imageUrl = tempService.image_url;

      // Upload image if a new file was selected
      if (imageFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          imageUrl = await uploadImage(imageFile, user.id);
        }
      }

      const serviceData = {
        title: tempService.title,
        description: tempService.description,
        hours: parseFloat(tempService.hours) || 0,
        image_url: imageUrl,
        business_id: profile.business_id,
      };

      let err;
      let newServiceId = editingServiceId;
      if (isEditMode && editingServiceId) {
        // UPDATE existing service - only update, never insert
        const { error } = await supabase
          .from("service")
          .update(serviceData)
          .eq("service_id", editingServiceId)
          .eq("business_id", profile.business_id);

        err = error;
      } else {
        // INSERT new service - only insert, never update
        const { data: insertData, error } = await supabase
          .from("service")
          .insert([serviceData])
          .select()
          .maybeSingle();

        err = error;
        if (insertData) {
          newServiceId = insertData.service_id;
        }
      }

      if (err) throw err;

      // Save material-service links if we have a service ID and materials selected
      if (newServiceId && selectedMaterialIds.length > 0 && !isEditMode) {
        const links = selectedMaterialIds.map(materialId => ({
          material_id: materialId,
          service_id: newServiceId,
          profile_id: profile.profile_id,
        }));

        const { error: linkError } = await supabase
          .from("material_service_link")
          .insert(links);

        if (linkError) console.error("Error saving material links:", linkError);
      }

      await fetchServices();
      closeModal();
    } catch (err) {
      console.error("Save error:", err);
      setError(err.message || "Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = (serviceId) => {
    setServiceToDelete(serviceId);
    setIsModalOpen(false);
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setIsModalOpen(true);
    setServiceToDelete(null);
  };

  const closeDeleteAfterSuccess = () => {
    setDeleteConfirmOpen(false);
    setIsModalOpen(false);
    setServiceToDelete(null);
    setEditingServiceId(null);
    setTempService(null);
  };

  const confirmDelete = async () => {
    if (!serviceToDelete) return;

    try {
      setError(null);

      const { error } = await supabase
        .from("service")
        .delete()
        .eq("service_id", serviceToDelete)
        .eq("business_id", profile.business_id); // Ensure user can only delete their own services

      if (error) throw error;

      await fetchServices();
      closeDeleteAfterSuccess();
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete service");
    }
  };

  const handleChange = (field, value) => {
    setTempService({ ...tempService, [field]: value });
  };

  const handleImageUpload = (file) => {
    if (!file) return;
    setImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setTempService((p) => ({ ...p, image_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const filteredServices = services.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

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
          placeholder="Search services..."
          className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700"
        />
        <button
          onClick={openAddModal}
          className="px-5 py-3 bg-sky-400 text-black rounded-xl font-bold whitespace-nowrap"
        >
          + Add New
        </button>
      </div>

      {/* HOURLY RATE NOT SET WARNING */}
      {hourlyRate === null && filteredServices.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500 rounded-xl p-4 text-yellow-200 text-sm">
          Hourly rate not configured. Please set up basic pricing to display service prices.
        </div>
      )}

      {/* SERVICES GRID */}
      {filteredServices.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          {search
            ? "No services found matching your search."
            : "No services added yet. Click '+ Add New' to get started."}
        </div>
      ) : (
        <div className="services-grid">
          {filteredServices.map((s) => (
            <div
              key={s.service_id}
              className="group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:scale-[1.02] transition flex flex-col"
              style={{ minHeight: '200px' }}
            >
              <div className="h-24 w-full overflow-hidden flex-shrink-0">
                <img
                  src={s.image_url}
                  className="h-full w-full object-cover"
                  alt={s.title}
                />
              </div>
              <div className="p-3 flex-grow">
                <div className="text-base font-bold mb-1">{s.title}</div>
                <div className="text-xs text-zinc-400 line-clamp-2">
                  {s.description}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  {s.hours} hours · £{calculatePrice(s.hours)}
                </div>
              </div>

              {/* Edit button */}
              <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '8px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(s);
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
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6">
          <div className="bg-zinc-900 rounded-2xl p-5 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-3">Delete Service</h2>
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
          </div>
        </div>
      )}

      {/* MATERIALS SELECTION MODAL */}
      {isMaterialsModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-4 w-full max-w-3xl max-h-[75vh] overflow-hidden flex flex-col mx-4">
            <h2 className="text-lg font-bold mb-4">Select Materials</h2>

            {materialsLoading ? (
              <div className="text-center py-8 text-zinc-400">Loading materials...</div>
            ) : allMaterials.length === 0 ? (
              <div className="text-center py-8 text-zinc-400">
                No materials available. Add materials in Settings → Materials first.
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto min-h-0 mb-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {allMaterials.map((material) => (
                      <div
                        key={material.material_id}
                        onClick={() => toggleMaterialSelection(material.material_id)}
                        className={`relative rounded-xl border cursor-pointer transition overflow-hidden ${
                          selectedMaterialIds.includes(material.material_id)
                            ? "bg-sky-500/20 border-sky-500"
                            : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                        }`}
                      >
                        {/* Selection indicator */}
                        <div className={`absolute top-2 right-2 z-10 w-5 h-5 rounded-full border flex items-center justify-center ${
                          selectedMaterialIds.includes(material.material_id)
                            ? "bg-sky-500 border-sky-500"
                            : "bg-zinc-900/50 border-zinc-500"
                        }`}>
                          {selectedMaterialIds.includes(material.material_id) && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        <div className="h-10 w-full overflow-hidden">
                          <img
                            src={material.image_url}
                            alt={material.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="p-1 text-[10px]">
                          <div className="font-bold text-xs truncate">{material.name}</div>
                          <div className="text-[10px] text-zinc-400 truncate">
                            £{material.base_price_no_vat} · {material.markup}%
                          </div>
                          <div className="text-[10px] text-sky-400 font-bold mt-1">
                            £{(parseFloat(material.base_price_no_vat) * (1 + parseFloat(material.markup) / 100)).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Materials Summary */}
                {selectedMaterialIds.length > 0 && (
                  <div className="p-3 bg-zinc-800 rounded-xl mb-4 space-y-1 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Materials ({selectedMaterialIds.length}):</span>
                      <span>£{calculateMaterialsTotal().base}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Markup:</span>
                      <span>£{calculateMaterialsTotal().markup}</span>
                    </div>
                    <div className="flex justify-between text-sky-400 font-bold pt-1 border-t border-zinc-700">
                      <span>Total Materials:</span>
                      <span>£{calculateMaterialsTotal().total}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={closeMaterialsModal}
                disabled={saving}
                className="px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveMaterialsSelection}
                disabled={saving || materialsLoading}
                className="px-4 py-2 text-sm bg-sky-400 text-black rounded-xl font-bold hover:bg-sky-300 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT/ADD MODAL */}
      {isModalOpen && tempService && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">
              {isEditMode ? "Edit Service" : "Add Service"}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Service Title</label>
                <input
                  className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                  value={tempService.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="Enter service title"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Description</label>
                <textarea
                  className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm resize-none"
                  value={tempService.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Enter service description (optional)"
                  rows="2"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Labour (Hours)</label>
                <input
                  className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                  inputMode="decimal"
                  value={tempService.hours}
                  onChange={(e) =>
                    setTempService({
                      ...tempService,
                      hours: sanitizeNumberInput(e.target.value),
                    })
                  }
                  placeholder="Enter estimated hours"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Service Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files[0])}
                  className="w-full text-xs text-zinc-300"
                />
              </div>

              {/* Materials Selection Button */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Materials</label>
                <button
                  type="button"
                  onClick={openMaterialsModal}
                  className="w-full p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm text-left flex justify-between items-center hover:bg-zinc-700 transition"
                >
                  <span className="truncate">{getSelectedMaterialsText()}</span>
                  {selectedMaterialIds.length > 0 && (
                    <span className="text-sky-400 font-bold text-xs ml-2">
                      £{calculateMaterialsTotal().total}
                    </span>
                  )}
                </button>
              </div>

              {/* Price Breakdown */}
              {tempService.hours && (
                <div className="p-3 bg-zinc-800 rounded-xl space-y-1 text-xs">
                  <div className="flex justify-between text-zinc-400">
                    <span>Labour ({tempService.hours}h × £{hourlyRate}):</span>
                    <span>£{calculateServiceTotal(tempService.hours).labour}</span>
                  </div>
                  {selectedMaterialIds.length > 0 && (
                    <>
                      <div className="flex justify-between text-zinc-400">
                        <span>Materials (base):</span>
                        <span>£{calculateServiceTotal(tempService.hours).materialsBase}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Materials markup:</span>
                        <span>£{calculateServiceTotal(tempService.hours).materialsMarkup}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sky-400 font-bold pt-1 border-t border-zinc-700">
                    <span>Total:</span>
                    <span>£{calculateServiceTotal(tempService.hours).total}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mt-5">
              {isEditMode && (
                <button
                  onClick={() => openDeleteConfirm(editingServiceId)}
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