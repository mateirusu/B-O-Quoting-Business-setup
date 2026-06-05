import { useNavigate } from "react-router-dom";

const customerName = c =>
  [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unnamed";

export default function JobsTable({ jobs, showCustomer = true }) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-700">
      <table className="w-full text-sm text-left">
        <thead className="bg-zinc-800 text-zinc-400 uppercase text-xs">
          <tr>
            <th className="px-4 py-3">Title</th>
            {showCustomer && <th className="px-4 py-3">Customer</th>}
            <th className="px-4 py-3">Town / City</th>
            <th className="px-4 py-3">Postcode</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3 w-20"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-700">
          {jobs.map(j => (
            <tr key={j.job_id} className="hover:bg-zinc-800 transition">
              <td className="px-4 py-3 text-white font-medium">{j.title}</td>
              {showCustomer && (
                <td className="px-4 py-3 text-zinc-300">{customerName(j.customer)}</td>
              )}
              <td className="px-4 py-3 text-zinc-300">{j.town_city || "—"}</td>
              <td className="px-4 py-3 text-zinc-300">{j.postcode  || "—"}</td>
              <td className="px-4 py-3 text-zinc-400">{new Date(j.created_at).toLocaleDateString("en-GB")}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end">
                  <button
                    onClick={() => navigate(`/crm/jobs/${j.job_id}`)}
                    className="px-3 py-1 text-xs rounded-lg bg-sky-500 text-black font-semibold hover:bg-sky-400 transition"
                  >
                    View
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
