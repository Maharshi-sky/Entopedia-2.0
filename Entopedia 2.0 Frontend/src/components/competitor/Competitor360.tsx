"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { CompetitorProfile } from "@/data/competitors";
import { SourceBox } from "./SourceBox";

export function Competitor360({ profiles }: { profiles: CompetitorProfile[] }) {
  const [selected, setSelected] = useState(profiles[0]?.name ?? "");
  const profile = profiles.find((p) => p.name === selected) ?? profiles[0];
  if (!profile) {
    return (
      <Card>
        <h2 className="text-[0.9375rem] font-semibold text-ink">Competitor 360</h2>
        <p className="mt-2 text-xs text-gray-500">No competitor profiles yet.</p>
      </Card>
    );
  }

  const rows: [string, string | number][] = [
    ["Patents", profile.patents],
    ["Active Filings", profile.activeFilings],
    ["SKUs tracked", profile.skus ?? "—"],
    ["Recent launches", profile.launches ?? "—"],
    ["Regional footprint", profile.footprint],
  ];

  return (
    <Card className="flex flex-col">
      <h2 className="text-[0.9375rem] font-semibold text-ink">Competitor 360</h2>

      <div className="relative mt-3">
        <select
          aria-label="Competitor"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full cursor-pointer appearance-none rounded-lg border border-line bg-white py-2.5 pr-9 pl-3 text-[0.9375rem] text-ink outline-none focus:border-brand"
        >
          {profiles.map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink" />
      </div>

      <dl className="mt-3 divide-y divide-line rounded-lg border border-line">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between px-3 py-2.5 text-[0.9375rem]"
          >
            <dt className="text-gray-600">{label}</dt>
            <dd className="font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <SourceBox
        caption="Everything on one competitor, in one place."
        {...profile.provenance}
      />
    </Card>
  );
}
