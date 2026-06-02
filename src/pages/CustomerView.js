import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import CustomerDetails from "./CustomerDetails";
import CustomerJobs from "./CustomerJobs";

export default function CustomerView() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Client Details");

  const renderContent = () => {
    switch (activeTab) {
      case "Client Details": return <CustomerDetails />;
      case "Jobs":           return <CustomerJobs />;
      default:               return null;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader title="Client" />

      <div className="flex gap-6">
        <aside style={{ width: "10%" }} className="bg-zinc-900 rounded-2xl p-4 space-y-3">
          <button
            onClick={() => navigate("/crm")}
            className="w-full text-left px-4 py-3 rounded-2xl text-sky-400 text-sm hover:bg-zinc-800 transition"
          >
            ← Clients
          </button>
          {["Client Details", "Jobs"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-4 py-3 rounded-2xl transition ${
                activeTab === tab
                  ? "bg-sky-500 text-black"
                  : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </aside>

        <section style={{ width: "90%" }} className="bg-zinc-900 rounded-2xl p-6">
          {renderContent()}
        </section>
      </div>
    </div>
  );
}
