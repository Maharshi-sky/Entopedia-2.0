import { Card } from "@/components/ui/Card";
import type { StrategicFiling } from "@/data/competitors";

export function StrategicFilings({ filings }: { filings: StrategicFiling[] }) {
  return (
    <Card>
      <h2 className="text-[0.9375rem] font-semibold text-ink">
        Strategic Filings (30d)
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {filings.map((f) => (
          <li key={f.company} className="flex gap-3 py-3">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-red-500" />
            <div>
              <p className="text-[0.9375rem] text-ink">{f.company}</p>
              <p className="mt-0.5 text-xs text-gray-500">{f.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
