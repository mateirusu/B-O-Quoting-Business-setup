import { useState } from "react";
import PageHeader from "../../components/PageHeader";
import Clients from "./Client/ClientTable";
import Jobs from "./Job/JobsTable";
import Quotes from "./Quote/Quotes";

export default function CRM() {
  const [activeTab, setActiveTab] = useState("Clients");

  const renderContent = () => {
    switch (activeTab) {
      case "Clients": return <Clients />;
      case "Jobs":    return <Jobs />;
      case "Quotes":  return <Quotes />;
      default:        return null;
    }
  };

  return (
    <div className="min-h-screen text-white p-6">
      <PageHeader title="CRM" />

      <div className="flex gap-6">
        <aside style={{ width: "10%" }} className="space-y-2">
          {["Clients", "Jobs", "Quotes"].map((tab) => (
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
