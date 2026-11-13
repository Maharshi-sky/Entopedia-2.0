"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { Patent } from "@/data/competitors";

const columns: { key: keyof Patent; label: string }[] = [
  { key: "number", label: "Patent #" },
  { key: "assignee", label: "Assignee" },
  { key: "active", label: "Active" },
  { key: "technology", label: "Technology" },
  { key: "filed", label: "Filed" },
  { key: "status", label: "Status" },
  { key: "maturity", label: "Maturity Score" },
];

export function PatentTable({ patents }: { patents: Patent[] }) {
  const [sort, setSort] = useState<{ key: keyof Patent; dir: 1 | -1 } | null>(
    null,
  );

  const rows = sort
    ? [...patents].sort((a, b) =>
        a[sort.key] < b[sort.key] ? -sort.dir : a[sort.key] > b[sort.key] ? sort.dir : 0,
      )
    : patents;

  function toggleSort(key: keyof Patent) {
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === 1
          ? { key, dir: -1 }
          : null
        : { key, dir: 1 },
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-160 text-xs">
        <thead className="bg-[#E5E8E3] text-gray-600">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  aria-sort={
                    active ? (sort.dir === 1 ? "ascending" : "descending") : undefined
                  }
                  className="border-r border-line px-3 py-2.5 text-left font-medium last:border-r-0"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    {c.label}
                    {active &&
                      (sort.dir === 1 ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p) => (
            <tr key={p.number} className="hover:bg-[#fafbfa]">
              <td className="px-3 py-3 font-semibold text-brand">{p.number}</td>
              <td className="px-3 py-3 text-ink">{p.assignee}</td>
              <td className="px-3 py-3 text-gray-600">{p.active}</td>
              <td className="px-3 py-3 text-gray-600">{p.technology}</td>
              <td className="px-3 py-3 text-gray-600">{p.filed}</td>
              <td className="px-3 py-3">
                <Badge tone={p.status === "Granted" ? "amber" : "purple"}>
                  {p.status}
                </Badge>
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div
                    role="meter"
                    aria-label={`Maturity score ${p.maturity}`}
                    aria-valuenow={p.maturity}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-200"
                  >
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${p.maturity}%` }}
                    />
                  </div>
                  <span className="font-semibold text-ink">{p.maturity}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
