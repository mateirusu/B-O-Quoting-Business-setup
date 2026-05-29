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
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingServiceId(null);
    setTempService({ ...emptyService });
    setImageFile(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingServiceId(null);
    setTempService(null);
    setImageFile(null);
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
        const { error } = await supabase
          .from("service")
          .insert([serviceData]);

        err = error;
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
              className="group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:scale-[1.02] transition"
            >
              <img
                src={s.image_url}
                className="h-24 w-full object-cover"
                alt={s.title}
              />
              <div className="p-3">
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
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
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

      {/* EDIT/ADD MODAL */}
      {isModalOpen && tempService && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">
              {isEditMode ? "Edit Service" : "Add Service"}
            </h2>

            <div className="space-y-3">
              <div>
                <input
                  className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                  value={tempService.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="Service title"
                />
              </div>

              <div>
                <textarea
                  className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm resize-none"
                  value={tempService.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Description (optional)"
                  rows="2"
                />
              </div>

              <div>
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
                  placeholder="Hours"
                />
              </div>

              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files[0])}
                  className="w-full text-xs text-zinc-300"
                />
              </div>
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