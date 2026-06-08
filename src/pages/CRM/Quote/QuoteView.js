import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import PageHeader from "../../../components/PageHeader";
import QuoteDetails from "./QuoteDetails";
import QuoteServices from "./QuoteServices";
import QuoteTimeline from "./QuoteTimeline";
import { supabase } from "../../../supabaseClient";

export default function QuoteView() {
  const { quoteId } = useParams();
  const [activeTab,           setActiveTab]           = useState("Quote Details");
  const [hasCustomerRequests, setHasCustomerRequests] = useState(false);

  const checkCustomerRequests = async () => {
    if (!quoteId) return;
    const { data } = await supabase
      .from("quote_service_link")
      .select("service:service_id(service_type)")
      .eq("quote_id", quoteId);
    setHasCustomerRequests(
      (data || []).some(row => row.service?.service_type === "Customer Request")
    );
  };

  useEffect(() => { checkCustomerRequests(); }, [quoteId]);

  const renderContent = () => {
    switch (activeTab) {
      case "Quote Details": return <QuoteDetails hasCustomerRequests={hasCustomerRequests} onNavigateToServices={() => setActiveTab("Services")} />;
      case "Services":      return <QuoteServices onCustomerRequestsChange={checkCustomerRequests} />;
      case "Timeline":      return <QuoteTimeline />;
      default:              return null;
    }
  };

  return (
    <div className="min-h-screen text-white p-6">
      <PageHeader title="Quote" />

      <div className="flex gap-6">
        <aside style={{ width: "10%" }} className="space-y-2">
          {["Quote Details", "Services", "Timeline"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-4 py-3 rounded-lg transition relative ${
                activeTab === tab
                  ? "bg-sky-500 text-black font-semibold"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {tab}
              {tab === "Services" && hasCustomerRequests && (
                <span style={{
                  position: "absolute", top: "6px", right: "8px",
                  width: "8px", height: "8px", borderRadius: "50%",
                  background: "#f59e0b", display: "inline-block",
                }} />
              )}
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
