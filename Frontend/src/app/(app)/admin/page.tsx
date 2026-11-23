import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { loadAdminPage } from "@/lib/admin-data";

export const metadata: Metadata = {
  title: "Admin · Entopedia",
};

// Read per request as the signed-in admin (their session cookie), so it streams in under <Suspense>.
async function AdminContent() {
  const result = await loadAdminPage().then(
    (data) => ({ ok: true as const, data }),
    (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
  );
  if (!result.ok) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Couldn&apos;t load users and activity from the API: {result.error}
      </p>
    );
  }
  return <AdminOverview data={result.data} />;
}

export default function AdminPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-gray-500">
          Users, module access and what people have been doing
        </p>
      </div>
      <Suspense
        fallback={<p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-sm text-gray-500">Loading users and activity…</p>}
      >
        <AdminContent />
      </Suspense>
    </>
  );
}
