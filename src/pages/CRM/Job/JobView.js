import { useState } from "react";
import PageHeader from "../../../components/PageHeader";
import JobDetails from "./JobDetails";
import JobQuotes from "./JobQuotes";

export default function JobView() {
  const [activeTab, setActiveTab] = useState("Job Details");

  const renderContent = () => {
    switch (activeTab) {
      case "Job Details": return <JobDetails />;
      case "Quotes":      return <JobQuotes />;
      default:            return null;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader title="Job" />

      <div className="flex gap-6">
        <aside style={{ width: "10%" }} className="bg-zinc-900 rounded-2xl p-4 space-y-3">
          {["Job Details", "Quotes"].map(tab => (
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
