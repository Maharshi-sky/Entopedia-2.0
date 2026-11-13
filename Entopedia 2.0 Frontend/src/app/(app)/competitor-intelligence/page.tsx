import type { Metadata } from "next";
import { CompetitorWorkspace } from "@/components/competitor/CompetitorWorkspace";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Competitor Intelligence · Entopedia",
};

// The header lives in CompetitorWorkspace because Add Product sits beside the title.
export default async function CompetitorIntelligencePage() {
  const [profiles, launchSignals, filings, whiteSpace, patents, papers, products] =
    await Promise.all([
      api.competitorProfiles(),
      api.launchSignals(),
      api.strategicFilings(),
      api.whiteSpace(),
      api.patents(),
      api.papers(),
      api.products(),
    ]);

  return (
    <CompetitorWorkspace
      data={{ profiles, launchSignals, filings, whiteSpace, patents, papers, products }}
    />
  );
}
