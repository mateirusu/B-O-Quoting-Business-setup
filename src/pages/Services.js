import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

export default function Services() {
  const BASIC_HOURLY_RATE = 50;
  const { profile, loading: authLoading } = useAuth();

  const [search, setSearch] = useState("");
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const emptyService = {
    title: "",
    description: "",
    hours: "1",
    image_url:
      "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop",
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [tempService, setTempService] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);

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
      fetchServices();
    }
  }, [authLoading, profile?.business_id, fetchServices]);

  const sanitizeNumberInput = (value) => {
    if (!value) return "";
    let cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    return cleaned;
  };

  const calculatePrice = (hours) => {
    const h = parseFloat(hours);
    if (isNaN(h)) return 0;
    return (h * BASIC_HOURLY_RATE).toFixed(2);
  };

  const openEditModal = (service) => {
    setEditingServiceId(service.id);
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
    setEditingServiceId(null);
    setTempService({ ...emptyService });
    setImageFile(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
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
      if (editingServiceId) {
        // Update existing service
        const { error } = await supabase
          .from("service")
          .update(serviceData)
          .eq("id", editingServiceId)
          .eq("business_id", profile.business_id); // Ensure user can only update their own services

        err = error;
      } else {
        // Insert new service
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
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setServiceToDelete(null);
  };

  const confirmDelete = async () => {
    if (!serviceToDelete) return;

    try {
      setError(null);

      const { error } = await supabase
        .from("service")
        .delete()
        .eq("id", serviceToDelete)
        .eq("business_id", profile.business_id); // Ensure user can only delete their own services

      if (error) throw error;

      await fetchServices();
      closeDeleteConfirm();
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

      {/* SERVICES GRID */}
      {filteredServices.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          {search
            ? "No services found matching your search."
            : "No services added yet. Click '+ Add New' to get started."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredServices.map((s) => (
            <div
              key={s.id}
              className="group relative bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:scale-[1.02] transition"
            >
              <img
                src={s.image_url}
                className="h-32 w-full object-cover"
                alt={s.title}
              />
              <div className="p-4">
                <div className="text-lg font-bold mb-1">{s.title}</div>
                <div className="text-sm text-zinc-400 line-clamp-2">
                  {s.description}
                </div>
                <div className="text-sm text-zinc-400 mt-1">
                  {s.hours} hours
                </div>
                <div className="text-sm text-sky-300">
                  £{calculatePrice(s.hours)}
                </div>
              </div>

              {/* Action buttons (visible on hover) */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(s);
                  }}
                  className="p-2 bg-sky-500 rounded-full hover:bg-sky-400"
                  title="Edit"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-black"
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteConfirm(s.id);
                  }}
                  className="p-2 bg-red-500 rounded-full hover:bg-red-400"
                  title="Delete"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
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
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
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
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">
              {editingServiceId ? "Edit Service" : "Add Service"}
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

            <div className="flex justify-end gap-3 mt-5">
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
      )}
    </div>
  );
}