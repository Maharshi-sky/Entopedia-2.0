import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/charts/Sparkline";
import { CountUp } from "@/components/ui/CountUp";
import { metricIcons, type Metric } from "./metrics";

function MetricTile({
  id,
  title,
  value,
  caption,
  icon,
  tone,
  trend,
  delay,
}: Metric & { delay: number }) {
  const alert = tone === "alert";
  const Icon = metricIcons[icon];
  return (
    <div className="flex flex-col justify-between rounded-xl border border-line p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-lg ${
              alert ? "bg-red-50 text-red-500" : "bg-brand-soft text-brand"
            }`}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
          <span className="text-[0.9375rem] font-semibold text-ink">{title}</span>
        </div>
        <button
          type="button"
          aria-label={`Open ${title}`}
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-ink transition-colors hover:bg-gray-50"
        >
          <ArrowUpRight className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-3xl font-semibold text-ink tabular-nums">
            <CountUp value={value} delay={delay} />
          </p>
          <p className="mt-1.5 text-xs text-gray-500">{caption}</p>
        </div>
        <Sparkline
          id={`spark-${id}`}
          data={trend}
          color={alert ? "#dc2626" : "#004736"}
          delay={delay}
        />
      </div>
    </div>
  );
}

export function IntelligenceGlance({ metrics }: { metrics: Metric[] }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            Intelligence at a glance
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Signals detected across enabled modules
          </p>
        </div>
        <span className="mt-6 text-xs text-gray-500">30D view</span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Tiles animate one after another so each line's growth is visible. */}
        {metrics.map((metric, i) => (
          <MetricTile key={metric.id} {...metric} delay={0.3 + i * 0.35} />
        ))}
      </div>
    </Card>
  );
}
