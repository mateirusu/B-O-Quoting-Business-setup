import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

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
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState(null);
  const [tempMaterial, setTempMaterial] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState(null);

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
    });
    setImageFile(null);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingMaterialId(null);
    setTempMaterial({ ...emptyMaterial });
    setImageFile(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingMaterialId(null);
    setTempMaterial(null);
    setImageFile(null);
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

  const openDeleteConfirm = (materialId) => {
    setMaterialToDelete(materialId);
    setIsModalOpen(false);
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setIsModalOpen(true);
    setMaterialToDelete(null);
  };

  const closeDeleteAfterSuccess = () => {
    setDeleteConfirmOpen(false);
    setIsModalOpen(false);
    setMaterialToDelete(null);
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
          onClick={openAddModal}
          className="px-5 py-3 bg-sky-400 text-black rounded-xl font-bold whitespace-nowrap"
        >
          + Add New
        </button>
      </div>

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
                {m.code && (
                  <div className="text-xs text-zinc-500 mt-1">
                    Code: {m.code}
                  </div>
                )}
                {m.supplier && (
                  <div className="text-xs text-zinc-500">
                    Supplier: {m.supplier}
                  </div>
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
      {isModalOpen && tempMaterial && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">
              {isEditMode ? "Edit Material" : "Add Material"}
            </h2>

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
                  <label className="block text-xs text-zinc-400 mb-1">Code (optional)</label>
                  <input
                    className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                    value={tempMaterial.code}
                    onChange={(e) => handleChange("code", e.target.value)}
                    placeholder="e.g., MAT-001"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Supplier (optional)</label>
                  <input
                    className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-sm"
                    value={tempMaterial.supplier}
                    onChange={(e) => handleChange("supplier", e.target.value)}
                    placeholder="Supplier name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Material Image</label>
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