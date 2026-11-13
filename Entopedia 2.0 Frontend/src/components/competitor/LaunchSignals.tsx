"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { LaunchSignal } from "@/data/competitors";
import { SourceBox } from "./SourceBox";

export function LaunchSignals({ signals }: { signals: LaunchSignal[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card className="flex flex-col">
      <h2 className="text-xs font-semibold tracking-widest text-ink uppercase">
        Launch Signals
      </h2>

      <ul className="mt-3 divide-y divide-line">
        {signals.map((s) => {
          const expanded = open === s.title;
          return (
            <li key={s.title}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : s.title)}
                className="flex w-full gap-3 py-3 text-left"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink">
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {s.detail}
                  </span>
                </span>
                <ChevronRight
                  className={`mt-0.5 size-4 shrink-0 text-gray-500 transition-transform ${
                    expanded ? "rotate-90" : ""
                  }`}
                />
              </button>
              {expanded && (
                <ul className="mb-3 ml-4.5 space-y-1 rounded-lg bg-[#f5f6f5] p-2.5 text-xs text-gray-600">
                  {s.evidence.map((e) => (
                    <li key={e}>· {e}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <SourceBox
        caption="Filing patterns read forward — click any signal to see the evidence."
        sources={["USPTO", "EPO", "CIB&RC", "IP India", "ANVISA"]}
        confidence={71}
        status="Inferred"
      />
    </Card>
  );
}
