import type { Metadata } from "next";
import { RegulatoryWorkspace } from "@/components/regulatory/RegulatoryWorkspace";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Regulatory & Actives · Entopedia",
};

export default async function RegulatoryActivesPage() {
  const [actives, registrations] = await Promise.all([api.actives(), api.registrations()]);
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Regulatory &amp; Actives</h1>
        <p className="mt-1 text-sm text-gray-500">
          Actives watch and registration monitor
        </p>
      </div>
      <RegulatoryWorkspace actives={actives} registrations={registrations} />
    </>
  );
}
