import type { Metadata } from "next";
import { AuditLog } from "@/components/audit/AuditLog";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Audit & Provenance · Entopedia",
};

export default async function AuditPage() {
  const entries = await api.auditLog();
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Audit &amp; Provenance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every AI query is logged with sources, confidence and retrieval type full
          traceability
        </p>
      </div>
      <AuditLog entries={entries} />
    </>
  );
}
