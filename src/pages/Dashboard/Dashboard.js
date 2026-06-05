import PageHeader from "../../components/PageHeader";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PageHeader title="Dashboard" />
      <div className="bg-zinc-900 p-6 rounded-2xl">App running successfully.</div>
    </div>
  );
}
