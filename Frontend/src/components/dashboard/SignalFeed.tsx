import { ChevronRight, Radio, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Signal } from "@/data/dashboard";

export function SignalFeed({ signals }: { signals: Signal[] }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Live signal feed</h2>
          <p className="mt-1 text-xs text-gray-500">
            Latest activity requiring attention
          </p>
        </div>
        <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
          {signals.length}
        </span>
      </div>

      <ul className="mt-5 flex-1 border-t border-line">
        {signals.map((s) => {
          const Icon = s.kind === "alert" ? TriangleAlert : Radio;
          return (
            <li key={s.title} className="border-b border-line">
              <button
                type="button"
                className="flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:bg-gray-50"
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    s.kind === "alert"
                      ? "bg-red-50 text-red-500"
                      : "bg-brand-soft text-brand"
                  }`}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <Badge tone={s.badge}>{s.tag}</Badge>
                    <span className="text-[0.8125rem] text-gray-500">{s.time}</span>
                  </span>
                  <span className="mt-1 block text-[0.9375rem] text-ink">
                    {s.title}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-gray-500" />
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="mt-5 w-full rounded-lg bg-brand py-3 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90"
      >
        Review all signals
      </button>
    </Card>
  );
}
