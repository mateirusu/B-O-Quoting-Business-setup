import PageHeader from "../components/PageHeader";

export default function CRM() {
  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader title="CRM" subtitle="Customer management tools will be available here soon." />
      <div className="bg-zinc-900 p-6 rounded-2xl">
        <p className="text-slate-300">This is the CRM page. Content and tools for customer relationship management will be added later.</p>
      </div>
    </div>
  );
}
