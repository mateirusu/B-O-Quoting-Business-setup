import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

export default function Pricing() {
  const { profile } = useAuth();

  const [calloutCharge, setCalloutCharge] = useState("50");
  const [basicRate, setBasicRate] = useState("50");

  const [draftCalloutCharge, setDraftCalloutCharge] = useState(calloutCharge);
  const [draftBasicRate, setDraftBasicRate] = useState(basicRate);

  const [pricingOpen, setPricingOpen] = useState(false);

  const [pricingConfirmOpen, setPricingConfirmOpen] = useState(false);
  const [pendingCallout, setPendingCallout] = useState("");
  const [pendingBasicRate, setPendingBasicRate] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Fetch pricing data from database on mount or when profile changes
  useEffect(() => {
    if (profile?.business_id) {
      fetchPricingData(profile.business_id);
    } else if (profile && !profile.business_id) {
      // Profile exists but no business_id yet, set defaults
      setLoading(false);
    }
  }, [profile]);

  const fetchPricingData = async (businessId) => {
    if (!businessId) {
      console.log("No business_id available, using defaults");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log("Fetching pricing for business_id:", businessId);

      const { data, error: fetchError } = await supabase
        .from("basic_pricing")
        .select("callout_charge, hourly_rate")
        .eq("business_id", businessId)
        .maybeSingle();

      if (fetchError) {
        console.error("Failed to fetch pricing:", fetchError);
        setError(`Failed to load pricing data: ${fetchError.message}`);
        return;
      }

      if (data) {
        setCalloutCharge(data.callout_charge?.toString() ?? "50");
        setBasicRate(data.hourly_rate?.toString() ?? "50");
        setDraftCalloutCharge(data.callout_charge?.toString() ?? "50");
        setDraftBasicRate(data.hourly_rate?.toString() ?? "50");
      }
    } catch (err) {
      console.error("Error fetching pricing:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const sanitizeNumberInput = (value) => {
    if (!value) return "";
    let cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    return cleaned;
  };

  const savePricing = () => {
    setPendingCallout(draftCalloutCharge);
    setPendingBasicRate(draftBasicRate);
    setPricingConfirmOpen(true);
  };

  const confirmPricingSave = async () => {
    if (!profile?.business_id) {
      setError("No business associated with your account");
      setPricingConfirmOpen(false);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      console.log("Saving pricing for business_id:", profile.business_id);
      console.log("Values:", { callout_charge: parseFloat(pendingCallout), hourly_rate: parseFloat(pendingBasicRate) });

      // Upsert pricing data - will insert if doesn't exist, update if exists
      const { data, error: upsertError } = await supabase.from("basic_pricing").upsert(
        {
          business_id: profile.business_id,
          callout_charge: parseFloat(pendingCallout) || 0,
          hourly_rate: parseFloat(pendingBasicRate) || 0,
        },
        { onConflict: "business_id" }
      );

      if (upsertError) {
        console.error("Pricing update error:", upsertError);
        throw upsertError;
      }

      console.log("Pricing saved successfully:", data);

      // Update local state
      setCalloutCharge(pendingCallout);
      setBasicRate(pendingBasicRate);
      setPricingConfirmOpen(false);
      setPricingOpen(false);
    } catch (saveError) {
      console.error("Save error:", saveError);
      setError(saveError.message || "Unable to save pricing. Please check your authentication.");
    } finally {
      setSaving(false);
      setPricingConfirmOpen(false);
    }
  };

  const cancelPricingSave = () => setPricingConfirmOpen(false);

  const cancelPricing = () => {
    setDraftCalloutCharge(calloutCharge);
    setDraftBasicRate(basicRate);
    setPricingOpen(false);
  };

  return (
    <div className="space-y-6">

      {/* PRICING SECTION */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="flex justify-between p-5 cursor-pointer" onClick={() => setPricingOpen(!pricingOpen)}>
          <h2 className="text-2xl font-bold">Pricing Settings</h2>
          <span className="text-sky-400">{pricingOpen ? "▲" : "▼"}</span>
        </div>

        {pricingOpen && (
          <div className="border-t border-zinc-800 p-5 space-y-6">
            {loading ? (
              <div className="text-center text-zinc-400 py-4">Loading pricing data...</div>
            ) : (
              <>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Callout Charge (£)</h3>
                    <input 
                      value={draftCalloutCharge} 
                      inputMode="decimal" 
                      onChange={(e)=>setDraftCalloutCharge(sanitizeNumberInput(e.target.value))} 
                      className="w-full p-3 rounded-xl bg-zinc-950" 
                    />
                  </div>
                  <div>
                    <h3 className="text-sm text-zinc-300 mb-2">Basic Hourly Rate (£)</h3>
                    <input 
                      value={draftBasicRate} 
                      inputMode="decimal" 
                      onChange={(e)=>setDraftBasicRate(sanitizeNumberInput(e.target.value))} 
                      className="w-full p-3 rounded-xl bg-zinc-950" 
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500 p-4 text-red-200">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-4">
                  <button onClick={cancelPricing} className="px-6 py-2 border rounded-xl">Cancel</button>
                  <button 
                    onClick={savePricing} 
                    className="px-6 py-2 bg-sky-400 text-black rounded-xl font-bold"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* CONFIRM PRICING MODAL */}
      {pricingConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 w-full max-w-xl">
            <h2 className="text-xl font-bold mb-4">Confirm Pricing Changes</h2>
            <p className="text-zinc-300 mb-4">
              These changes will affect ALL services. Apply?
            </p>
            <div className="text-sm text-zinc-300 mb-6 space-y-1">
              <div>Callout: £{calloutCharge} → £{pendingCallout}</div>
              <div>Hourly: £{basicRate} → £{pendingBasicRate}</div>
            </div>
            <div className="flex justify-end gap-4">
              <button onClick={cancelPricingSave} className="px-4 py-2 border rounded-xl">Cancel</button>
              <button 
                onClick={confirmPricingSave} 
                className="px-4 py-2 bg-sky-400 text-black rounded-xl font-bold"
                disabled={saving}
              >
                {saving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}