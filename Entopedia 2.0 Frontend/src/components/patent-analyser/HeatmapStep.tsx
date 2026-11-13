"use client";

import { useState } from "react";
import { ArrowLeftRight, ChevronDown, Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Sheet } from "./sheet";
import {
  crossTab,
  crossTabCsv,
  downloadCsv,
  fields,
  fileBase,
  type CrossTab,
  type Derived,
  type Field,
} from "./analysis";
import { RecordTable } from "./RecordTable";
import { StepIntro } from "./StepIntro";

export type HeatAxes = { rows: Field; cols: Field };

// Single-hue scale (brand green) with the count printed in every cell,
// so it reads without relying on colour alone.
function cellStyle(count: number, max: number) {
  if (count === 0) return undefined;
  const t = count / max;
  return {
    backgroundColor: `color-mix(in srgb, #004736 ${Math.round(12 + t * 88)}%, transparent)`,
    color: t >= 0.5 ? "#fff" : undefined,
  };
}

function insightFor(tab: CrossTab, axes: HeatAxes) {
  let best = { r: 0, c: 0, n: 0 };
  let empty = 0;
  tab.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.length > best.n) best = { r, c, n: cell.length };
      if (cell.length === 0) empty++;
    }),
  );
  if (best.n === 0) return "No filings to cross yet.";
  const totalCells = tab.rows.length * tab.cols.length;
  const crowded = `${tab.rows[best.r]} × ${tab.cols[best.c]} is the most crowded ground (${best.n} filings)`;
  return empty
    ? `${crowded}; ${empty} of ${totalCells} ${axes.rows.toLowerCase()}–${axes.cols.toLowerCase()} combinations have no filings at all.`
    : `${crowded}; every combination has at least one filing, so there's no open white space on these axes.`;
}

function AxisSelect({
  label,
  value,
  other,
  onChange,
}: {
  label: string;
  value: Field;
  other: Field;
  onChange: (field: Field) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.8125rem] font-bold tracking-wider text-gray-600 uppercase">
        {label}
      </span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as Field)}
          className="w-full min-w-44 cursor-pointer appearance-none rounded-lg border border-line bg-white py-2 pr-9 pl-3 text-[0.9375rem] text-ink outline-none focus:border-brand"
        >
          {fields.map((f) => (
            <option key={f} value={f} disabled={f === other}>
              {f}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink" />
      </span>
    </label>
  );
}

export function HeatmapStep({
  sheet,
  derived,
  axes,
  onAxesChange,
}: {
  sheet: Sheet;
  derived: Derived;
  axes: HeatAxes;
  onAxesChange: (axes: HeatAxes) => void;
}) {
  const tab = crossTab(derived.records, axes.rows, axes.cols);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [drill, setDrill] = useState<{ r: number; c: number } | null>(null);

  function changeAxes(next: HeatAxes) {
    onAxesChange(next);
    setDrill(null);
    setHover(null);
  }

  const focus = hover ?? drill;
  const focusCount = focus ? tab.cells[focus.r]?.[focus.c]?.length : undefined;
  const drillRecords = drill ? (tab.cells[drill.r]?.[drill.c] ?? []) : [];

  return (
    <>
      <StepIntro
        title="Where the white space is"
        description="Cross any two fields against each other. Dense cells are crowded ground; empty cells are combinations nobody has filed on yet."
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <AxisSelect
            label="Rows"
            value={axes.rows}
            other={axes.cols}
            onChange={(rows) => changeAxes({ ...axes, rows })}
          />
          <button
            type="button"
            aria-label="Swap rows and columns"
            title="Swap axes"
            onClick={() => changeAxes({ rows: axes.cols, cols: axes.rows })}
            className="grid size-10 place-items-center rounded-lg border border-line text-gray-600 transition-colors hover:bg-gray-50 hover:text-ink"
          >
            <ArrowLeftRight className="size-4" strokeWidth={1.75} />
          </button>
          <AxisSelect
            label="Columns"
            value={axes.cols}
            other={axes.rows}
            onChange={(cols) => changeAxes({ ...axes, cols })}
          />
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                `${fileBase(sheet)}-heatmap-${axes.rows}-x-${axes.cols}.csv`.toLowerCase().replace(/\s+/g, "-"),
                crossTabCsv(tab, axes.rows, axes.cols),
              )
            }
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-line bg-[#f1f3f2] px-3.5 py-2.5 text-[0.8125rem] font-bold tracking-wider text-ink uppercase transition-colors hover:bg-gray-200"
          >
            <Download className="size-4" strokeWidth={1.75} />
            Heat map .csv
          </button>
        </div>
      </Card>

      <Card>
        <h3 className="text-[1.0625rem] font-semibold text-ink">
          {axes.rows} × {axes.cols}
        </h3>
        <p className="mt-1 text-xs text-gray-600">{insightFor(tab, axes)}</p>

        {/* Scrolls inside the card on small screens; the row labels stay pinned. */}
        <div className="mt-4 overflow-x-auto">
          <table className="border-separate border-spacing-1 text-[0.875rem]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white" />
                {tab.cols.map((col, c) => (
                  <th
                    key={col}
                    scope="col"
                    className={`max-w-28 min-w-16 px-1 pb-1 text-left align-bottom text-[0.8125rem] font-medium transition-colors ${
                      focus?.c === c ? "text-brand" : "text-gray-500"
                    }`}
                  >
                    <span className="line-clamp-2">{col}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab.rows.map((row, r) => (
                <tr key={row}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 max-w-48 bg-white pr-3 text-left font-medium whitespace-nowrap transition-colors ${
                      focus?.r === r ? "text-brand" : "text-ink"
                    }`}
                  >
                    <span className="block truncate">{row}</span>
                  </th>
                  {tab.cells[r].map((cell, c) => {
                    const n = cell.length;
                    const inLine = focus && (focus.r === r || focus.c === c);
                    const active = drill?.r === r && drill?.c === c;
                    return (
                      <td key={c} className="p-0">
                        <button
                          type="button"
                          // Not `disabled`: empty cells still need hover to say "white space".
                          aria-disabled={n === 0}
                          aria-label={`${row} × ${tab.cols[c]}: ${n} filings`}
                          onMouseEnter={() => setHover({ r, c })}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover({ r, c })}
                          onBlur={() => setHover(null)}
                          onClick={() => n > 0 && setDrill(active ? null : { r, c })}
                          style={{ ...cellStyle(n, tab.max), animationDelay: `${(r + c) * 25}ms` }}
                          className={`chart-fade grid h-10 w-full min-w-16 place-items-center rounded-md font-semibold tabular-nums transition-transform duration-150 ${
                            n === 0
                              ? "cursor-default border border-dashed border-gray-300 text-gray-400"
                              : "text-ink hover:-translate-y-0.5 hover:shadow-md"
                          } ${active ? "ring-2 ring-amber-400" : inLine && n > 0 ? "ring-1 ring-brand/40" : ""}`}
                        >
                          {n === 0 ? "—" : n}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p role="status" className="text-xs text-gray-600">
            {focus && focusCount !== undefined
              ? `${tab.rows[focus.r]} × ${tab.cols[focus.c]}: ${focusCount} ${focusCount === 1 ? "filing" : "filings"}${focusCount ? " — click to open the records" : " — white space"}`
              : "Hover or tap a cell to see its count; click to open its records."}
          </p>
          <div className="flex items-center gap-3 text-[0.8125rem] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded border border-dashed border-gray-300" />
              None
            </span>
            <span className="flex items-center gap-1.5 tabular-nums">
              1
              <span
                className="inline-block h-3 w-24 rounded"
                style={{
                  background:
                    "linear-gradient(to right, color-mix(in srgb, #004736 12%, transparent), #004736)",
                }}
              />
              {tab.max}
            </span>
          </div>
        </div>
      </Card>

      {drill && drillRecords.length > 0 && (
        <RecordTable
          label={`${tab.rows[drill.r]} × ${tab.cols[drill.c]}`}
          records={drillRecords}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}
