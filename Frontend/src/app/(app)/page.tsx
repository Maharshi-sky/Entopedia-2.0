import { IntelligenceGlance } from "@/components/dashboard/IntelligenceGlance";
import { CompetitorMomentum } from "@/components/dashboard/CompetitorMomentum";
import { NewsFlow } from "@/components/dashboard/NewsFlow";
import { SignalFeed } from "@/components/dashboard/SignalFeed";
import { RecentNews } from "@/components/dashboard/RecentNews";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { api } from "@/lib/api";

export default async function Home() {
  const [metrics, momentum, newsFlow, signals, news] = await Promise.all([
    api.dashboardMetrics(),
    api.competitorMomentum(),
    api.newsFlow(),
    api.signals(),
    api.news(),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Executive Intelligence Overview
          </p>
        </div>
        <SegmentedControl
          label="Date range"
          options={["7D", "30D", "90D", "YTD"]}
          defaultValue="30D"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IntelligenceGlance metrics={metrics} />
        <CompetitorMomentum data={momentum} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
        <NewsFlow data={newsFlow} />
        <SignalFeed signals={signals} />
      </div>

      <RecentNews articles={news} />
    </>
  );
}
