"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { groupBy, type Derived, type PatentRecord } from "./analysis";
import { RecordTable } from "./RecordTable";
import { StepIntro } from "./StepIntro";

const MAX_FILERS = 10;
const MIN_CLUSTER = 2;

// Network geometry (SVG user units).
const W = 520;
const H = 340;
const CX = W / 2;
const CY = H / 2;
const RING = 118;

type Link = { a: string; b: string; shared: string[] };

function filerLinks(filers: string[], records: PatentRecord[]): Link[] {
  const techs = new Map(
    filers.map((f) => [
      f,
      new Set(records.filter((r) => r.Filer === f && r.Technology !== "Other").map((r) => r.Technology)),
    ]),
  );
  const links: Link[] = [];
  filers.forEach((a, i) =>
    filers.slice(i + 1).forEach((b) => {
      const shared = [...techs.get(a)!].filter((t) => techs.get(b)!.has(t));
      if (shared.length) links.push({ a, b, shared });
    }),
  );
  return links.sort((x, y) => y.shared.length - x.shared.length);
}

function FilerNetwork({
  filers,
  counts,
  links,
  selected,
  onSelect,
}: {
  filers: string[];
  counts: Map<string, number>;
  links: Link[];
  selected: string | null;
  onSelect: (filer: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? selected;
  const maxCount = Math.max(1, ...counts.values());
  const maxShared = Math.max(1, ...links.map((l) => l.shared.length));

  const pos = new Map(
    filers.map((f, i) => {
      const angle = -Math.PI / 2 + (i / filers.length) * Math.PI * 2;
      return [f, { x: CX + Math.cos(angle) * RING, y: CY + Math.sin(angle) * RING, cos: Math.cos(angle) }];
    }),
  );
  const related = (filer: string, link: Link) => link.a === filer || link.b === filer;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Filer network">
      {links.map((l, i) => {
        const a = pos.get(l.a)!;
        const b = pos.get(l.b)!;
        const dim = focus && !related(focus, l);
        return (
          <line
            key={`${l.a}-${l.b}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            pathLength={1}
            stroke="#004736"
            strokeOpacity={dim ? 0.08 : 0.25 + (l.shared.length / maxShared) * 0.5}
            strokeWidth={1.5 + (l.shared.length / maxShared) * 4}
            strokeLinecap="round"
            className="chart-draw transition-[stroke-opacity] duration-150"
            style={{ animationDelay: `${200 + i * 40}ms` }}
          />
        );
      })}
      {filers.map((f, i) => {
        const p = pos.get(f)!;
        const r = 7 + ((counts.get(f) ?? 0) / maxCount) * 11;
        const active = focus === f;
        const dim = focus && !active && !links.some((l) => related(focus, l) && related(f, l));
        const anchor = p.cos > 0.25 ? "start" : p.cos < -0.25 ? "end" : "middle";
        const dx = anchor === "start" ? r + 6 : anchor === "end" ? -(r + 6) : 0;
        const dy = anchor === "middle" ? (p.y < CY ? -(r + 8) : r + 16) : 4;
        return (
          <g
            key={f}
            role="button"
            tabIndex={0}
            aria-label={`${f}: ${counts.get(f)} filings`}
            aria-pressed={selected === f}
            onMouseEnter={() => setHover(f)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(f)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect(selected === f ? null : f)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(selected === f ? null : f);
              }
            }}
            className="cursor-pointer outline-none"
            opacity={dim ? 0.35 : 1}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={active ? "#004736" : "#e8f3ef"}
              stroke="#004736"
              strokeWidth={active ? 0 : 1.5}
              className="chart-pop"
              style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: `${i * 50}ms` }}
            />
            <text
              x={p.x + dx}
              y={p.y + dy}
              textAnchor={anchor}
              className={`fill-current text-[12px] ${active ? "font-semibold text-brand" : "text-gray-600"}`}
            >
              {f.length > 22 ? `${f.slice(0, 21)}…` : f}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function StructureStep({ derived }: { derived: Derived }) {
  const { records } = derived;
  const [selected, setSelected] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ label: string; records: PatentRecord[] } | null>(null);

  const filerGroups = groupBy(records, "Filer").slice(0, MAX_FILERS);
  const filers = filerGroups.map((g) => g.value);
  const counts = new Map(filerGroups.map((g) => [g.value, g.records.length]));
  const links = filerLinks(filers, records);
  const shownLinks = selected ? links.filter((l) => l.a === selected || l.b === selected) : links;

  // Same filer, same technology: related filings that read as one programme of work.
  const clusters = filerGroups
    .flatMap((g) =>
      groupBy(g.records, "Technology")
        .filter((t) => t.value !== "Other" && t.records.length >= MIN_CLUSTER)
        .map((t) => ({ filer: g.value, technology: t.value, records: t.records })),
    )
    .sort((a, b) => b.records.length - a.records.length);

  const years = groupBy(records, "Priority year")
    .map((g) => g.value)
    .filter((y) => y !== "Unknown");
  const peak = groupBy(records, "Priority year")
    .filter((g) => g.value !== "Unknown")
    .sort((a, b) => b.records.length - a.records.length)[0];
  const maxDot = Math.max(
    1,
    ...filerGroups.flatMap((g) => years.map((y) => g.records.filter((r) => r["Priority year"] === y).length)),
  );

  const top = links[0];
  const networkInsight = !top
    ? "No two filers share a technology — each is working its own ground."
    : `${top.a} and ${top.b} overlap most, both filing on ${top.shared.join(", ")}. ${links.length} filer pairs share at least one technology.`;
  const span = (recs: PatentRecord[]) => {
    const ys = recs.map((r) => r["Priority year"]).filter((y) => y !== "Unknown").sort();
    return ys.length ? (ys[0] === ys[ys.length - 1] ? ys[0] : `${ys[0]}–${ys[ys.length - 1]}`) : "Undated";
  };

  return (
    <>
      <StepIntro
        title="How the set fits together"
        description="Who builds on whom: filers linked by shared technology, clusters of related filings, and when each filer was active — drawn from the sheet itself rather than an outside database."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h3 className="text-[1.0625rem] font-semibold text-ink">Filer network</h3>
          <p className="mt-1 text-xs text-gray-600">{networkInsight}</p>
          <div className="mt-2">
            <FilerNetwork
              filers={filers}
              counts={counts}
              links={links}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
          <p className="text-[0.8125rem] text-gray-500">
            Circle size = filings · line weight = shared technologies · click a filer to
            see its links
          </p>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[1.0625rem] font-semibold text-ink">
              {selected ? `${selected}'s links` : "Strongest links"}
            </h3>
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[0.8125rem] font-semibold text-brand hover:underline"
              >
                Show all
              </button>
            )}
          </div>
          {shownLinks.length === 0 ? (
            <p className="mt-3 text-xs text-gray-500">
              {selected
                ? `${selected} shares no technology with another filer in this set.`
                : "No shared technologies between filers yet."}
            </p>
          ) : (
            <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto">
              {shownLinks.slice(0, 12).map((l) => (
                <li key={`${l.a}-${l.b}`} className="py-2.5">
                  <p className="text-[0.9375rem] text-ink">
                    <span className="font-semibold">{l.a}</span>
                    <span className="text-gray-400"> ↔ </span>
                    <span className="font-semibold">{l.b}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Both file on {l.shared.join(", ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-[1.0625rem] font-semibold text-ink">Filing clusters</h3>
        <p className="mt-1 text-xs text-gray-600">
          {clusters.length
            ? `${clusters.length} clusters of related filings (same filer, same technology). The largest is ${clusters[0].filer} on ${clusters[0].technology}, with ${clusters[0].records.length} filings.`
            : `No filer has ${MIN_CLUSTER} or more filings on the same technology.`}
        </p>
        {clusters.length > 0 && (
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {clusters.map((c) => (
              <li key={`${c.filer}-${c.technology}`}>
                <details className="group rounded-lg border border-line bg-[#fafbfa]">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-[0.875rem] font-bold text-brand tabular-nums">
                      {c.records.length}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-semibold text-ink">
                        {c.filer}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {c.technology} · {span(c.records)}
                      </span>
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="border-t border-line px-3 py-2 text-xs text-gray-600">
                    {c.records.map((r) => (
                      <li key={r.id} className="flex gap-2 py-1">
                        <span className="shrink-0 font-semibold text-ink tabular-nums">{r.number}</span>
                        <span className="truncate">{r.title}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {years.length > 0 && (
        <Card>
          <h3 className="text-[1.0625rem] font-semibold text-ink">Filing timeline</h3>
          <p className="mt-1 text-xs text-gray-600">
            {peak
              ? `Filing peaked in ${peak.value} with ${peak.records.length} filings. Each dot is a filer's priority filings in that year.`
              : "Each dot is a filer's priority filings in that year."}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="text-[0.875rem]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white" />
                  {years.map((y) => (
                    <th key={y} scope="col" className="min-w-12 px-1 pb-2 text-center text-[0.8125rem] font-medium text-gray-500 tabular-nums">
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filerGroups.map((g, row) => (
                  <tr key={g.value} className="border-t border-line">
                    <th scope="row" className="sticky left-0 z-10 max-w-48 bg-white py-1.5 pr-4 text-left font-medium whitespace-nowrap text-ink">
                      <span className="block truncate">{g.value}</span>
                    </th>
                    {years.map((y, col) => {
                      const recs = g.records.filter((r) => r["Priority year"] === y);
                      const size = 10 + Math.sqrt(recs.length / maxDot) * 18;
                      return (
                        <td key={y} className="py-1.5 text-center">
                          {recs.length > 0 ? (
                            <button
                              type="button"
                              aria-label={`${g.value}, ${y}: ${recs.length} filings`}
                              title={`${g.value}, ${y}: ${recs.length}`}
                              onClick={() => setDrill({ label: `${g.value} · ${y}`, records: recs })}
                              className="chart-pop mx-auto grid place-items-center rounded-full bg-brand text-[0.75rem] font-semibold text-white transition-transform hover:scale-110"
                              style={{ width: size, height: size, animationDelay: `${(row + col) * 30}ms` }}
                            >
                              {recs.length > 1 ? recs.length : ""}
                            </button>
                          ) : (
                            <span className="mx-auto block size-1 rounded-full bg-gray-300" aria-hidden />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {drill && (
        <RecordTable label={drill.label} records={drill.records} onClose={() => setDrill(null)} />
      )}
    </>
  );
}
