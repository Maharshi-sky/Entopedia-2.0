import type { Metadata } from "next";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Admin · Entopedia",
};

export default async function AdminPage() {
  const [kpis, users, moduleUsage] = await Promise.all([
    api.adminKpis(),
    api.users(),
    api.moduleUsage(),
  ]);
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-gray-500">
          User metrics, access management and role-based permissions
        </p>
      </div>
      <AdminOverview kpis={kpis} users={users} moduleUsage={moduleUsage} />
    </>
  );
}
