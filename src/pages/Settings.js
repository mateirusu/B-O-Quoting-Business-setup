import { useState } from "react";
import PageHeader from "../components/PageHeader";
import Profile from "./Profile";
import Pricing from "./Pricing";
import Services from "./Services";
import Materials from "./Materials";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("Pricing");

  const renderContent = () => {
    switch (activeTab) {
      case "Pricing":
        return <Pricing />;
      case "Services":
        return <Services />;
      case "Materials":
        return <Materials />;
      case "Business":
        return <div className="text-slate-300">Business settings will be displayed here.</div>;
      case "Engineers":
        return <div className="text-slate-300">Engineers settings will be displayed here.</div>;
      case "Profile":
        return <Profile />;
      default:
        return <div className="text-slate-300">Select a settings category.</div>;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader title="Settings"/>

      <div className="flex gap-6">
        <aside style={{ width: "10%" }} className="bg-zinc-900 rounded-2xl p-4 space-y-3">
          {["Pricing", "Services", "Materials", "Business", "Engineers", "Profile"].map((tab) => (
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
