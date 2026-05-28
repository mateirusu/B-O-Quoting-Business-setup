import { useState } from "react";

export default function Services() {
  const BASIC_HOURLY_RATE = 50;

  const [search, setSearch] = useState("");

  const emptyService = {
    title: "",
    description: "",
    hours: "1",
    image:
      "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop"
  };

  const [services, setServices] = useState([
    {
      title: "Home Electrical Repairs",
      description: "Troubleshooting outlets, switches, wiring issues",
      hours: "2",
      image:
        "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop"
    },
    {
      title: "Lighting Installation",
      description: "Indoor and outdoor lighting installation",
      hours: "1.5",
      image:
        "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=1200&auto=format&fit=crop"
    }
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [tempService, setTempService] = useState(null);

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

  const openEditModal = (index) => {
    setEditIndex(index);
    setTempService({ ...services[index] });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditIndex(null);
    setTempService(emptyService);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditIndex(null);
    setTempService(null);
  };

  const saveChanges = () => {
    if (!tempService) return;
    const updated = [...services];
    if (editIndex === null) setServices([...services, tempService]);
    else {
      updated[editIndex] = tempService;
      setServices(updated);
    }
    closeModal();
  };

  const handleChange = (field, value) => {
    setTempService({ ...tempService, [field]: value });
  };

  const handleImageUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setTempService((p) => ({ ...p, image: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const filteredServices = services.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">

      {/* SEARCH AND ADD BUTTON */}
      <div className="flex gap-4">
        <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search services..." className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700" />
        <button onClick={openAddModal} className="px-5 py-3 bg-sky-400 text-black rounded-xl font-bold whitespace-nowrap">+ Add New</button>
      </div>

      {/* SERVICES GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filteredServices.map((s,i)=> (
          <div
            key={i}
            onClick={() => openEditModal(i)}
            className="cursor-pointer bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:scale-[1.02] transition"
          >
            <img src={s.image} className="h-32 w-full object-cover" alt={s.title} />
            <div className="p-4">
              <div className="text-lg font-bold mb-1">{s.title}</div>
              <div className="text-sm text-zinc-400">{s.hours} hours</div>
              <div className="text-sm text-sky-300 mt-1">£{calculatePrice(s.hours)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* EDIT/ADD MODAL */}
      {isModalOpen && tempService && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
          <div className="bg-zinc-900 rounded-3xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6">
              {editIndex===null ? "Add Service" : "Edit Service"}
            </h2>

            <div className="space-y-4">
              <input className="w-full p-3 rounded-xl bg-zinc-950" value={tempService.title} onChange={(e)=>handleChange("title",e.target.value)} placeholder="Service Title" />
              <textarea className="w-full p-3 rounded-xl bg-zinc-950" value={tempService.description} onChange={(e)=>handleChange("description",e.target.value)} placeholder="Service Description" rows="3" />
              <input className="w-full p-3 rounded-xl bg-zinc-950" inputMode="decimal" value={tempService.hours} onChange={(e)=>setTempService({...tempService,hours:sanitizeNumberInput(e.target.value)})} placeholder="Hours" />
              <div>
                <label className="text-sm text-zinc-300 mb-2 block">Service Image</label>
                <input type="file" accept="image/*" onChange={(e)=>handleImageUpload(e.target.files[0])} className="w-full p-2 rounded-xl bg-zinc-950" />
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-6">
              <button onClick={closeModal} className="px-6 py-2 border rounded-xl">Cancel</button>
              <button onClick={saveChanges} className="px-6 py-2 bg-sky-400 text-black rounded-xl font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}