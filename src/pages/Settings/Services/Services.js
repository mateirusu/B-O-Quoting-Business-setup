import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../../context/AuthContext";
import { supabase } from "../../../supabaseClient";
import MaterialServiceLink from "./MaterialServiceLink";
import { fetchPexelsImage } from "../../../utils/pexelsImage";

export default function Services() {
  const { profile, loading: authLoading } = useAuth();

  const [search, setSearch] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("Reusable");
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hourlyRate, setHourlyRate] = useState(null);

  // Materials state
  const [selectedMaterialIds, setSelectedMaterialIds] = useState([]);
  const [isMaterialsModalOpen, setIsMaterialsModalOpen] = useState(false);
  const [serviceMaterialsTotal, setServiceMaterialsTotal] = useState({ base: "0.00", markup: "0.00", total: "0.00" });
  const [serviceMaterialsTotals, setServiceMaterialsTotals] = useState({});

  const emptyService = {
    title: "",
    description: "",
    hours: "1",
    service_type: "Reusable",
    image_url:
      "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop",
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [serviceAutoCreated, setServiceAutoCreated] = useState(false);
  const [tempService, setTempService] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fetchingImage, setFetchingImage] = useState(false);
  const pexelsPageRef = useRef(1);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [descriptionPopup, setDescriptionPopup] = useState(null);

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

  // Fetch materials totals for all services (for tile display)
  const fetchAllServicesMaterialsTotals = useCallback(async () => {
    if (!profile?.business_id) return;
    try {
      const { data, error } = await supabase
        .from("material_service_link")
        .select(`
          service_id,
          quantity,
          material:material_id (
            base_price_no_vat,
            markup
          )
        `)
        .eq("business_id", profile.business_id);

      if (error) throw error;

      const totals = {};
      (data || []).forEach(link => {
        const price = parseFloat(link.material?.base_price_no_vat) || 0;
        const markup = parseFloat(link.material?.markup) || 0;
        const qty = parseInt(link.quantity) || 1;
        totals[link.service_id] = (totals[link.service_id] || 0) + price * (1 + markup / 100) * qty;
      });
      setServiceMaterialsTotals(totals);
    } catch (err) {
      console.error("Error fetching all services materials totals:", err);
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
        .eq("main_service", true)
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

  useEffect(() => {
  if (!authLoading && profile?.business_id) {
    fetchHourlyRate();
    fetchServices();
    fetchAllServicesMaterialsTotals();
  } else if (!authLoading) {
    setLoading(false);
  }
}, [authLoading, profile?.business_id, fetchHourlyRate, fetchServices, fetchAllServicesMaterialsTotals]);

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
      service_type: service.service_type || "Reusable",
      image_url: service.image_url || emptyService.image_url,
    });
    setImageFile(null);
    setSelectedMaterialIds([]);
    setServiceMaterialsTotal({ base: "0.00", markup: "0.00", total: "0.00" });
    pexelsPageRef.current = 1;
    setIsModalOpen(true);
    fetchServiceMaterialsTotal(service.service_id);
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingServiceId(null);
    setTempService({ ...emptyService });
    setImageFile(null);
    setSelectedMaterialIds([]);
    setServiceMaterialsTotal({ base: "0.00", markup: "0.00", total: "0.00" });
    pexelsPageRef.current = 1;
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingServiceId(null);
    setServiceAutoCreated(false);
    setTempService(null);
    setImageFile(null);
    setSelectedMaterialIds([]);
  };

  // Called only by the Cancel button — cleans up an auto-created service before closing.
  const handleCancelModal = async () => {
    if (serviceAutoCreated && editingServiceId) {
      await supabase
        .from("material_service_link")
        .delete()
        .eq("service_id", editingServiceId)
        .eq("business_id", profile.business_id);
      await supabase
        .from("service")
        .delete()
        .eq("service_id", editingServiceId)
        .eq("business_id", profile.business_id);
      await fetchServices();
    }
    closeModal();
  };

  // Materials modal handlers
  const openMaterialsModal = async () => {
    // If this is a new (unsaved) service, save it first to get a service_id
    // so that MaterialServiceLink can create material_service_link records.
    if (!editingServiceId) {
      if (!tempService?.title?.trim()) {
        setError("Please enter a service title before assigning materials.");
        return;
      }
      try {
        setSaving(true);
        setError(null);

        let imageUrl = tempService.image_url;
        if (imageFile) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) imageUrl = await uploadImage(imageFile, user.id);
        }

        const { data: insertData, error } = await supabase
          .from("service")
          .insert([{
            title: tempService.title,
            description: tempService.description,
            hours: parseFloat(tempService.hours) || 0,
            image_url: imageUrl,
            business_id: profile.business_id,
            main_service: true,
            service_type: "Reusable",
          }])
          .select()
          .maybeSingle();

        if (error) throw error;

        setEditingServiceId(insertData.service_id);
        setIsEditMode(true);
        setServiceAutoCreated(true);
        await fetchServices();
      } catch (err) {
        setError(err.message || "Failed to save service");
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }

    setIsModalOpen(false);
    setIsMaterialsModalOpen(true);
  };

  const closeMaterialsModal = () => {
    setIsMaterialsModalOpen(false);
    setIsModalOpen(true); // Re-open the service modal
  };

  const handleMaterialsSaved = (materialsTotal) => {
    if (materialsTotal) {
      setServiceMaterialsTotal(materialsTotal);
    }
    setIsMaterialsModalOpen(false);
    setIsModalOpen(true);
    fetchServiceMaterialsCount();
    fetchAllServicesMaterialsTotals();
  };

  // Fetch count and totals of materials linked to a service (for display)
  const fetchServiceMaterialsTotal = async (svcId) => {
    if (!svcId) return;
    try {
      const { data, error } = await supabase
        .from("material_service_link")
        .select(`
          quantity,
          material_id,
          material:material_id (
            base_price_no_vat,
            markup
          )
        `)
        .eq("service_id", svcId);

      if (error) throw error;

      const links = data || [];
      setSelectedMaterialIds(links.map(d => d.material_id));

      const baseTotal = links.reduce((sum, link) => {
        const price = parseFloat(link.material?.base_price_no_vat) || 0;
        const qty = parseInt(link.quantity) || 1;
        return sum + price * qty;
      }, 0);

      const markupTotal = links.reduce((sum, link) => {
        const price = parseFloat(link.material?.base_price_no_vat) || 0;
        const markup = parseFloat(link.material?.markup) || 0;
        const qty = parseInt(link.quantity) || 1;
        return sum + price * (markup / 100) * qty;
      }, 0);

      setServiceMaterialsTotal({
        base: baseTotal.toFixed(2),
        markup: markupTotal.toFixed(2),
        total: (baseTotal + markupTotal).toFixed(2),
      });
    } catch (err) {
      console.error("Error fetching service materials total:", err);
    }
  };

  const fetchServiceMaterialsCount = async () => {
    fetchServiceMaterialsTotal(editingServiceId);
  };

  // Calculate service total price
  const calculateServiceTotal = (hours) => {
    const labour = parseFloat(calculatePrice(hours)) || 0;
    const materialsBase = parseFloat(serviceMaterialsTotal.base) || 0;
    const materialsMarkup = parseFloat(serviceMaterialsTotal.markup) || 0;
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
    return `${count} material${count > 1 ? 's' : ''} linked`;
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
    if (saving) return;

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
        main_service: true,
        service_type: tempService.service_type || "Reusable",
      };

      let err;
      let newServiceId = editingServiceId;
      if (isEditMode && editingServiceId) {
        const { error } = await supabase
          .from("service")
          .update(serviceData)
          .eq("service_id", editingServiceId)
          .eq("business_id", profile.business_id);

        err = error;
      } else {
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

      // Remove all material links for this service first
      const { error: linkError } = await supabase
        .from("material_service_link")
        .delete()
        .eq("service_id", serviceToDelete)
        .eq("business_id", profile.business_id);

      if (linkError) throw linkError;

      const { error } = await supabase
        .from("service")
        .delete()
        .eq("service_id", serviceToDelete)
        .eq("business_id", profile.business_id);

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

  const handleGenerateServiceImage = async () => {
    const query = tempService?.title?.trim();
    if (!query) return;
    setFetchingImage(true);
    try {
      const url = await fetchPexelsImage(query, pexelsPageRef.current);
      if (url) {
        setTempService(prev => ({ ...prev, image_url: url }));
        pexelsPageRef.current += 1;
      }
    } catch {
      // Non-critical — silently ignore
    } finally {
      setFetchingImage(false);
    }
  };

  const filteredServices = services.filter((s) => {
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase());
    const matchType   = serviceTypeFilter === "All" || s.service_type === serviceTypeFilter;
    return matchSearch && matchType;
  });

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

      {/* SEARCH, FILTERS AND ADD BUTTON */}
      <div className="space-y-3">
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Type:</span>
          {["All", "Reusable", "Custom"].map(type => (
            <button
              key={type}
              onClick={() => setServiceTypeFilter(type)}
              className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition ${
                serviceTypeFilter === type
                  ? "bg-sky-500 text-black"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
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
          {search || serviceTypeFilter !== "All"
            ? "No services found matching your filters."
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
                <div className="text-base font-bold mb-2">{s.title}</div>
                <div className="text-xs text-zinc-400">
                  Labour: £{calculatePrice(s.hours)} ({s.hours}h)
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  Materials: £{(serviceMaterialsTotals[s.service_id] || 0).toFixed(2)}
                </div>
                <div className="text-xs text-sky-400 font-bold mt-0.5">
                  Total: £{(parseFloat(calculatePrice(s.hours)) + (serviceMaterialsTotals[s.service_id] || 0)).toFixed(2)}
                </div>
              </div>

              {/* Info button */}
              {s.description && (
                <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDescriptionPopup(s);
                    }}
                    style={{
                      padding: '8px',
                      background: 'rgba(0,0,0,0.55)',
                      borderRadius: '9999px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Description"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" style={{ height: '16px', width: '16px', color: '#e4e4e7' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
                    </svg>
                  </button>
                </div>
              )}

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

      {/* DESCRIPTION POPUP */}
      {descriptionPopup && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-6"
          onClick={() => setDescriptionPopup(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-3">{descriptionPopup.title}</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">{descriptionPopup.description}</p>
            <button
              onClick={() => setDescriptionPopup(null)}
              className="mt-4 px-4 py-2 text-sm border border-zinc-600 rounded-xl hover:bg-zinc-800 w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MATERIALS SERVICE LINK MODAL */}
      {isMaterialsModalOpen && (
        <MaterialServiceLink
          isOpen={isMaterialsModalOpen}
          onClose={closeMaterialsModal}
          serviceId={editingServiceId}
          profile={profile}
          onSave={(materialsTotal) => handleMaterialsSaved(materialsTotal)}
        />
      )}

      {/* EDIT/ADD MODAL */}
      {isModalOpen && tempService && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-md" style={{ height: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h2 className="text-lg font-bold px-5 pt-5 pb-3" style={{ flexShrink: 0 }}>
              {isEditMode && !serviceAutoCreated ? "Edit Service" : "Add Service"}
            </h2>

            <div className="px-5 pb-3 space-y-3" style={{ flex: '1 1 0', overflowY: 'auto', minHeight: 0 }}>
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
                <label className="block text-xs text-zinc-400 mb-1">Service Type</label>
                <div className="flex gap-2">
                  {["Reusable", "Custom"].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleChange("service_type", type)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
                        tempService.service_type === type
                          ? "bg-sky-500 text-black"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
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

              {/* Materials Selection Button */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Materials</label>
                <button
                  type="button"
                  onClick={openMaterialsModal}
                  disabled={!editingServiceId && !tempService?.title?.trim()}
                  className={`w-full p-2 rounded-xl text-sm font-bold transition ${
                    !editingServiceId && !tempService?.title?.trim()
                      ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                      : 'bg-sky-400 text-black hover:bg-sky-300'
                  }`}
                >
                  Materials
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

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Service Image</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e.target.files[0])}
                    className="flex-1 text-xs text-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateServiceImage}
                    disabled={fetchingImage || !tempService?.title?.trim()}
                    className="px-3 py-1.5 bg-zinc-700 text-white text-xs rounded-xl hover:bg-zinc-600 disabled:opacity-40 whitespace-nowrap"
                    title="Search Pexels for an image using the service title"
                  >
                    {fetchingImage ? "Searching…" : "Generate Image"}
                  </button>
                </div>
                {tempService?.image_url && (
                  <img
                    src={tempService.image_url}
                    alt="preview"
                    className="mt-2 w-full h-20 object-cover rounded-lg"
                  />
                )}
              </div>
            </div>

            <div className="flex justify-between items-center px-5 py-4 border-t border-zinc-800" style={{ flexShrink: 0 }}>
              {isEditMode && !serviceAutoCreated && (
                <button
                  onClick={() => openDeleteConfirm(editingServiceId)}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-red-500 text-white rounded-xl font-bold hover:bg-red-400 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
              <div className={`flex gap-3 ${isEditMode && !serviceAutoCreated ? '' : 'ml-auto'}`}>
                <button
                  onClick={handleCancelModal}
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