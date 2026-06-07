import { useState } from "react";
import PageHeader from "../../../components/PageHeader";
import CustomerDetails from "./ClientDetails";
import CustomerJobs from "./ClientJobs";
import CustomerQuotes from "./ClientQuotes";

export default function CustomerView() {
  const [activeTab, setActiveTab] = useState("Client Details");

  const renderContent = () => {
    switch (activeTab) {
      case "Client Details": return <CustomerDetails />;
      case "Jobs":           return <CustomerJobs />;
      case "Quotes":         return <CustomerQuotes />;
      default:               return null;
    }
  };

  return (
    <div className="min-h-screen text-white p-6">
      <PageHeader title="Client" />

      <div className="flex gap-6">
        <aside style={{ width: "10%" }} className="space-y-2">
          {["Client Details", "Jobs", "Quotes"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-4 py-3 rounded-lg transition ${
                activeTab === tab
                  ? "bg-sky-500 text-black font-semibold"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </aside>

        <section style={{ width: "90%" }}>
          {renderContent()}
        </section>
      </div>
    </div>
  );
}
