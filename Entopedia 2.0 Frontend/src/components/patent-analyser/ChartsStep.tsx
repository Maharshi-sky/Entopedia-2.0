"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Sheet } from "./sheet";
import {
  downloadCsv,
  fileBase,
  groupBy,
  share,
  toCsv,
  type Derived,
  type Field,
  type Group,
} from "./analysis";
import { RecordTable } from "./RecordTable";
import { StepIntro } from "./StepIntro";

const VISIBLE_BARS = 8;

// One sentence per chart, said before the chart that supports it.
function insightFor(field: Field, groups: Group[], total: number) {
  const [top, second] = groups;
  if (!top) return "No records to chart yet.";
  const n = top.records.length;
  switch (field) {
    case "Jurisdiction":
      return `${top.value} leads with ${n} of ${total} filings (${share(n, total)}%).`;
    case "Filer":
      if (!second) return `${top.value} is the only filer in the set.`;
      return second.records.length === n
        ? `${top.value} and ${second.value} are level as the most active filers, with ${n} filings each.`
        : `${top.value} is the most active filer: ${n} filings, ${(n / second.records.length).toFixed(1)}× ${second.value}.`;
    case "Organisation":
      return groups.length === 1
        ? `All ${total} filings come from ${top.value.toLowerCase()}.`
        : `${top.value} account for ${share(n, total)}% of filings.`;
    default: {
      const other = groups.find((g) => g.value === "Other")?.records.length ?? 0;
      const busiest = top.value === "Other" ? second : top;
      const lead = busiest
        ? `${busiest.value} is the most crowded technology (${busiest.records.length} filings)`
        : "No filing matches a technology category";
      return other ? `${lead}; ${other} filings match no category yet.` : `${lead}.`;
    }
  }
}

function BarChart({
  title,
  field,
  groups,
  total,
  selected,
  onSelect,
  onExport,
}: {
  title: string;
  field: Field;
  groups: Group[];
  total: number;
  selected: string | null;
  onSelect: (value: string) => void;
  onExport: () => void;
}) {
  const shown = groups.slice(0, VISIBLE_BARS);
  const hidden = groups.length - shown.length;
  const max = Math.max(1, ...shown.map((g) => g.records.length));

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1.0625rem] font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-xs text-gray-600">{insightFor(field, groups, total)}</p>
        </div>
        <button
          type="button"
          onClick={onExport}
          aria-label={`Export ${title} as CSV`}
          title="Export CSV"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-gray-600 transition-colors hover:bg-gray-50 hover:text-ink"
        >
          <Download className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      <ul className="mt-4 space-y-1">
        {shown.map((g, i) => {
          const n = g.records.length;
          const active = selected === g.value;
          return (
            <li key={g.value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(g.value)}
                className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
                  active ? "bg-brand-soft" : "hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center justify-between gap-3 text-[0.875rem]">
                  <span className="truncate text-ink">{g.value}</span>
                  <span className="shrink-0 text-gray-500 tabular-nums">
                    <span className="font-semibold text-ink">{n}</span> · {share(n, total)}%
                  </span>
                </span>
                {/* An SVG line so the bar shares the draw-on-reveal animation. */}
                <svg
                  viewBox="0 0 100 4"
                  preserveAspectRatio="none"
                  className="mt-1 block h-1.5 w-full rounded-full bg-gray-100"
                  aria-hidden
                >
                  <line
                    x1="0"
                    y1="2"
                    x2={(n / max) * 100}
                    y2="2"
                    pathLength={1}
                    stroke="#004736"
                    strokeWidth="4"
                    className="chart-draw"
                    style={{ animationDelay: `${i * 60}ms` }}
                  />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="mt-2 px-2 text-xs text-gray-500">
          +{hidden} more in the CSV export
        </p>
      )}
    </Card>
  );
}

const charts: { field: Field; title: string }[] = [
  { field: "Jurisdiction", title: "Where in the world" },
  { field: "Filer", title: "Which filers" },
  { field: "Organisation", title: "Which kinds of organisation" },
  { field: "Technology", title: "Which technologies" },
];

export function ChartsStep({ sheet, derived }: { sheet: Sheet; derived: Derived }) {
  const { records } = derived;
  const [drill, setDrill] = useState<{ field: Field; value: string } | null>(null);
  const total = records.length;

  function exportChart(field: Field, groups: Group[]) {
    downloadCsv(
      `${fileBase(sheet)}-${field.toLowerCase().replace(/\s+/g, "-")}.csv`,
      toCsv([[field, "Filings", "Share %"], ...groups.map((g) => [g.value, g.records.length, share(g.records.length, total)])]),
    );
  }

  const drillRecords = drill ? records.filter((r) => r[drill.field] === drill.value) : [];

  return (
    <>
      <StepIntro
        title="Where the innovation is"
        description="Four questions answered off the same sheet: where in the world, which filers, which kinds of organisation, and which technologies. Jurisdiction is read from the publication number, so it needs no extra column."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {charts.map(({ field, title }) => {
          const groups = groupBy(records, field);
          return (
            <BarChart
              key={field}
              title={title}
              field={field}
              groups={groups}
              total={total}
              selected={drill?.field === field ? drill.value : null}
              onSelect={(value) =>
                setDrill((d) => (d?.field === field && d.value === value ? null : { field, value }))
              }
              onExport={() => exportChart(field, groups)}
            />
          );
        })}
      </div>

      {drill && (
        <RecordTable
          label={`${drill.field}: ${drill.value}`}
          records={drillRecords}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}
