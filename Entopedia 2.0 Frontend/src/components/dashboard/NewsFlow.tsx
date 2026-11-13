"use client";

import { useState, type PointerEvent } from "react";
import { ChevronDown, Download, Ellipsis, Table2 } from "lucide-react";
import { Card, IconButton } from "@/components/ui/Card";
import type { NewsFlow as NewsFlowData, NewsFlowSeries as Series } from "@/data/dashboard";

const W = 560;
const H = 220;
const LEFT = 32;
const RIGHT = 8;
const TOP = 10;
const BOTTOM = 28;
const TICK_STEPS = [5, 10, 15, 20, 25, 30, 50, 100];

// Smallest "round" step whose four ticks cover the largest visible value.
function scaleFor(visible: Series[]) {
  const peak = Math.max(1, ...visible.flatMap((s) => s.data));
  const step = TICK_STEPS.find((t) => t * 4 >= peak) ?? Math.ceil(peak / 4);
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((n) => n * step) };
}

function LineChart({
  months,
  visible,
  emphasized,
}: {
  months: string[];
  visible: Series[];
  emphasized: string | null;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const { max, ticks } = scaleFor(visible);
  const stepX = (W - LEFT - RIGHT) / Math.max(1, months.length - 1);
  const x = (i: number) => LEFT + i * stepX;
  const y = (v: number) => TOP + (1 - v / max) * (H - TOP - BOTTOM);
  // The headline series gets marker dots.
  const lead = visible.find((s) => s.label === "Regulatory");

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const i = Math.round((px - LEFT) / stepX);
    setHoverIndex(Math.min(months.length - 1, Math.max(0, i)));
  }

  const tooltipRows =
    hoverIndex === null
      ? []
      : [...visible].sort((a, b) => b.data[hoverIndex] - a.data[hoverIndex]);

  return (
    // On phones the chart keeps a readable minimum width and scrolls sideways.
    <div className="scrollbar-none overflow-x-auto sm:overflow-visible">
    <div className="relative min-w-[30rem] sm:min-w-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={`News volume by category, ${months[0]} to ${months[months.length - 1]}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={LEFT}
              x2={W - RIGHT}
              y1={y(t)}
              y2={y(t)}
              stroke="#e6e9e7"
              strokeDasharray="3 3"
            />
            <text
              x={LEFT - 10}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-gray-500 text-[10px]"
            >
              {t}
            </text>
          </g>
        ))}
        {months.map((m, i) => (
          <text
            key={m}
            x={x(i)}
            y={H - 6}
            textAnchor={
              i === 0 ? "start" : i === months.length - 1 ? "end" : "middle"
            }
            className={`text-[10px] ${
              i === hoverIndex ? "fill-ink font-bold" : "fill-gray-500"
            }`}
          >
            {m}
          </text>
        ))}

        {hoverIndex !== null && (
          <line
            x1={x(hoverIndex)}
            x2={x(hoverIndex)}
            y1={TOP}
            y2={H - BOTTOM}
            stroke="#101917"
            strokeOpacity={0.2}
          />
        )}

        {[...visible].reverse().map((s) => {
          const dimmed = emphasized !== null && emphasized !== s.label;
          const strong = s.label === emphasized || s.label === "Regulatory";
          return (
            <polyline
              key={s.label}
              points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              pathLength={1}
              fill="none"
              stroke={s.color}
              strokeWidth={strong ? 2 : 1.25}
              strokeLinejoin="round"
              opacity={dimmed ? 0.15 : 1}
              className="chart-draw transition-opacity duration-200"
            />
          );
        })}

        {lead &&
          lead.data.map((v, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v)}
              r={2.5}
              fill={lead.color}
              opacity={emphasized && emphasized !== "Regulatory" ? 0.15 : 1}
              className="chart-fade"
              style={{ animationDelay: `${0.2 + i * 0.15}s` }}
            />
          ))}

        {hoverIndex !== null &&
          visible.map((s) => (
            <circle
              key={s.label}
              cx={x(hoverIndex)}
              cy={y(s.data[hoverIndex])}
              r={3.5}
              fill="white"
              stroke={s.color}
              strokeWidth={2}
            />
          ))}
      </svg>

      {visible.length === 0 && (
        <p className="absolute inset-0 grid place-items-center text-xs text-gray-500">
          Select a category below to show it on the chart.
        </p>
      )}

      {hoverIndex !== null && tooltipRows.length > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border border-line bg-white p-2.5 text-xs shadow-lg"
          style={{
            left: `${(x(hoverIndex) / W) * 100}%`,
            // Sits right of the guide line, flipping left near the right edge.
            transform: `translateX(${
              hoverIndex >= months.length - 2 ? "calc(-100% - 0.75rem)" : "0.75rem"
            })`,
          }}
        >
          <p className="mb-1.5 font-semibold text-ink">{months[hoverIndex]}</p>
          <ul className="space-y-1">
            {tooltipRows.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 text-gray-600">{s.label}</span>
                <span className="font-semibold text-ink">
                  {s.data[hoverIndex]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    </div>
  );
}

export function NewsFlow({ data }: { data: NewsFlowData }) {
  const { months, series } = data;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [emphasized, setEmphasized] = useState<string | null>(null);
  const visible = series.filter((s) => !hidden.has(s.label));

  function toggle(label: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <h2 className="text-[1.0625rem] font-semibold text-ink">
          News intelligence flow
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-lg border border-line px-3 text-xs text-ink transition-colors hover:bg-gray-50"
          >
            All News
            <ChevronDown className="size-3.5" />
          </button>
          <IconButton icon={Table2} label="View as table" />
          <IconButton icon={Download} label="Download" />
          <IconButton icon={Ellipsis} label="More options" />
        </div>
      </div>

      <div className="mt-4 mb-2 flex items-center justify-between text-xs">
        <p className="text-gray-500">
          {hidden.size === 0
            ? `All ${series.length} categories`
            : `${visible.length} of ${series.length} categories`}
        </p>
        {hidden.size > 0 && (
          <button
            type="button"
            onClick={() => setHidden(new Set())}
            className="font-semibold text-brand hover:underline"
          >
            Show all
          </button>
        )}
      </div>
      <LineChart
        months={months}
        visible={visible}
        emphasized={emphasized && !hidden.has(emphasized) ? emphasized : null}
      />

      <ul
        className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 border-t border-line pt-3 sm:grid-cols-3"
        onPointerLeave={() => setEmphasized(null)}
      >
        {series.map((s) => {
          const off = hidden.has(s.label);
          return (
            <li key={s.label}>
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => toggle(s.label)}
                onPointerEnter={() => setEmphasized(s.label)}
                onFocus={() => setEmphasized(s.label)}
                onBlur={() => setEmphasized(null)}
                className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-[background-color,opacity] hover:bg-gray-50 ${
                  off ? "opacity-40" : ""
                }`}
              >
                <span
                  className="h-0.5 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span
                  className={`flex-1 text-gray-700 ${off ? "line-through" : ""}`}
                >
                  {s.label}
                </span>
                <span className="text-gray-500">{s.data[s.data.length - 1]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
