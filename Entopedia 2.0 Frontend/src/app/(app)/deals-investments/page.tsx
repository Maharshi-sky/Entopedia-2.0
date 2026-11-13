import type { Metadata } from "next";
import { DealsOverview } from "@/components/deals/DealsOverview";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Deals & Investments · Entopedia",
};

export default async function DealsInvestmentsPage() {
  const [deals, investors] = await Promise.all([api.deals(), api.investors()]);
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Deals &amp; Investments</h1>
        <p className="mt-1 text-sm text-gray-500">
          Key funding, M&amp;A, and investor tracking across the industry
        </p>
      </div>
      <DealsOverview deals={deals} investors={investors} />
    </>
  );
}
