"use client";

import { useState } from "react";
import { ChevronDown, Download, Ellipsis, Table2 } from "lucide-react";
import { Card, IconButton } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { Momentum } from "@/data/dashboard";

// "All months" option; the others are the data's own month labels.
const ALL = "6M";

const SIZE = 280;
const THICKNESS = 44;
const C = SIZE / 2;
const R_OUTER = (SIZE - 16) / 2; // leaves room for the hover growth
const R_INNER = R_OUTER - THICKNESS;
const START_ANGLE = -60; // degrees clockwise from twelve o'clock
const GAP = 7; // visible gap between segments, in px
const CORNER = 8; // same-colour outline with round joins softens the corners

type Slice = Momentum["competitors"][number] & { value: number };

function polar(r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return `${(C + r * Math.cos(rad)).toFixed(2)} ${(C + r * Math.sin(rad)).toFixed(2)}`;
}

// Filled ring segment. Each edge is pulled in by a fixed distance (not a fixed
// angle) so the gaps keep parallel sides, plus half the outline width.
function sectorPath(start: number, end: number, gapped: boolean) {
  const inset = gapped ? (GAP + CORNER) / 2 : 0;
  const toDeg = (px: number, r: number) => (px / r) * (180 / Math.PI);
  const rOut = R_OUTER - CORNER / 2;
  const rIn = R_INNER + CORNER / 2;
  const o1 = start + toDeg(inset, rOut);
  const o2 = Math.min(end - toDeg(inset, rOut), o1 + 359.99);
  const i1 = start + toDeg(inset, rIn);
  const i2 = Math.min(end - toDeg(inset, rIn), i1 + 359.99);
  const large = (a: number, b: number) => (b - a > 180 ? 1 : 0);
  return [
    `M${polar(rOut, o1)}`,
    `A${rOut} ${rOut} 0 ${large(o1, o2)} 1 ${polar(rOut, o2)}`,
    `L${polar(rIn, i2)}`,
    `A${rIn} ${rIn} 0 ${large(i1, i2)} 0 ${polar(rIn, i1)}`,
    "Z",
  ].join(" ");
}

function Donut({
  period,
  slices,
  total,
  hovered,
  onHover,
}: {
  period: string;
  slices: Slice[];
  total: number;
  hovered: string | null;
  onHover: (name: string | null) => void;
}) {
  const visible = slices.filter((s) => s.value > 0);
  const arcs = visible.map((s, i) => {
    const before = visible.slice(0, i).reduce((sum, p) => sum + p.value, 0);
    const start = START_ANGLE + (before / total) * 360;
    const end = start + (s.value / total) * 360;
    return { ...s, d: sectorPath(start, end, visible.length > 1) };
  });
  const active = slices.find((s) => s.name === hovered);

  return (
    <div className="relative mx-auto w-full max-w-52">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full"
        role="img"
        aria-label={`Launch share: ${slices
          .map((s) => `${s.name} ${s.value}`)
          .join(", ")}`}
        onPointerLeave={() => onHover(null)}
      >
        {/* Keyed by period so the segments redraw whenever the data changes. */}
        <g key={period}>
          {arcs.map((a, i) => {
            const isActive = a.name === hovered;
            return (
              // Entrance animates the group; hover scales the path, so the two never clash.
              <g
                key={a.name}
                className="chart-pop"
                style={{
                  transformOrigin: `${C}px ${C}px`,
                  animationDelay: `${0.3 + i * 0.25}s`,
                }}
              >
                <path
                  d={a.d}
                  fill={a.color}
                  stroke={a.color}
                  strokeWidth={CORNER}
                  strokeLinejoin="round"
                  opacity={hovered && !isActive ? 0.35 : 1}
                  className="cursor-pointer transition-[transform,opacity] duration-200"
                  style={{
                    transformOrigin: `${C}px ${C}px`,
                    transform: isActive ? "scale(1.04)" : undefined,
                  }}
                  onPointerEnter={() => onHover(a.name)}
                />
              </g>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <p className="font-heading text-4xl font-semibold text-ink">
          {active ? active.value : total}
        </p>
        <p className="text-xs text-gray-500">
          {active
            ? `${active.name} · ${total ? Math.round((active.value / total) * 100) : 0}%`
            : "total launches"}
        </p>
      </div>
    </div>
  );
}

export function CompetitorMomentum({ data }: { data: Momentum }) {
  const { months, competitors, legendOrder } = data;
  const periods = [ALL, ...months];
  const [period, setPeriod] = useState(ALL);
  const [hovered, setHovered] = useState<string | null>(null);

  const monthIndex = months.indexOf(period);
  const slices: Slice[] = competitors.map((c) => ({
    ...c,
    value:
      monthIndex === -1
        ? c.monthly.reduce((sum, v) => sum + v, 0)
        : c.monthly[monthIndex],
  }));
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const legend = legendOrder.map((name) => slices.find((s) => s.name === name)!);

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.0625rem] font-semibold text-ink">
          Competitor launch momentum
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-lg border border-line px-3 text-xs text-ink transition-colors hover:bg-gray-50"
          >
            Investigate launches
            <ChevronDown className="size-3.5" />
          </button>
          <IconButton icon={Table2} label="View as table" />
          <IconButton icon={Download} label="Download" />
          <IconButton icon={Ellipsis} label="More options" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-xs text-gray-500">View period</span>
        <SegmentedControl
          label="View period"
          variant="muted"
          options={periods}
          value={period}
          onChange={setPeriod}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 flex-1 items-center gap-6 sm:grid-cols-[1.4fr_1fr]">
        <Donut
          period={period}
          slices={slices}
          total={total}
          hovered={hovered}
          onHover={setHovered}
        />
        <ul className="space-y-1" onPointerLeave={() => setHovered(null)}>
          {legend.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onPointerEnter={() => setHovered(s.name)}
                onFocus={() => setHovered(s.name)}
                onBlur={() => setHovered(null)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-[background-color,opacity] ${
                  hovered === s.name ? "bg-gray-50" : ""
                } ${hovered && hovered !== s.name ? "opacity-50" : ""}`}
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-md text-[0.8125rem] font-semibold text-white"
                  style={{ backgroundColor: s.color }}
                >
                  {s.short}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[0.9375rem] font-semibold text-ink">
                    {s.name}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {total ? Math.round((s.value / total) * 100) : 0}% of selected
                    period
                  </span>
                </span>
                <span className="text-[1.0625rem] font-semibold text-ink">
                  {s.value}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
