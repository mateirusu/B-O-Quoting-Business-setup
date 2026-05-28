import { useState } from "react";

export default function Pricing() {
  const [calloutCharge, setCalloutCharge] = useState("50");
  const [basicRate, setBasicRate] = useState("50");

  const [draftCalloutCharge, setDraftCalloutCharge] = useState(calloutCharge);
  const [draftBasicRate, setDraftBasicRate] = useState(basicRate);

  const [pricingOpen, setPricingOpen] = useState(false);

  const [pricingConfirmOpen, setPricingConfirmOpen] = useState(false);
  const [pendingCallout, setPendingCallout] = useState("");
  const [pendingBasicRate, setPendingBasicRate] = useState("");

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

  const confirmPricingSave = () => {
    setCalloutCharge(pendingCallout);
    setBasicRate(pendingBasicRate);
    setPricingConfirmOpen(false);
    setPricingOpen(false);
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
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm text-zinc-300 mb-2">Callout Charge (£)</h3>
                <input value={draftCalloutCharge} inputMode="decimal" onChange={(e)=>setDraftCalloutCharge(sanitizeNumberInput(e.target.value))} className="w-full p-3 rounded-xl bg-zinc-950" />
              </div>
              <div>
                <h3 className="text-sm text-zinc-300 mb-2">Basic Hourly Rate (£)</h3>
                <input value={draftBasicRate} inputMode="decimal" onChange={(e)=>setDraftBasicRate(sanitizeNumberInput(e.target.value))} className="w-full p-3 rounded-xl bg-zinc-950" />
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button onClick={cancelPricing} className="px-6 py-2 border rounded-xl">Cancel</button>
              <button onClick={savePricing} className="px-6 py-2 bg-sky-400 text-black rounded-xl font-bold">Save</button>
            </div>
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
              <button onClick={confirmPricingSave} className="px-4 py-2 bg-sky-400 text-black rounded-xl font-bold">Confirm</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}