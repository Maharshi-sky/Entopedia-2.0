"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { tableScroll, td, th } from "@/components/regulatory/table";
import type { PatentRecord } from "./analysis";

// Drill-down: the records behind whichever bar, cell or dot was clicked.
export function RecordTable({
  label,
  records,
  onClose,
}: {
  label: string;
  records: PatentRecord[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [label]);

  return (
    <div ref={ref} className="scroll-mt-4">
      <Card flush className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-[#f1f3f2] px-4 py-3">
          <h3 className="text-[0.9375rem] font-semibold text-ink">
            {records.length} {records.length === 1 ? "record" : "records"} · {label}
          </h3>
          <button
            type="button"
            aria-label="Close records"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className={`${tableScroll} max-h-80 overflow-y-auto`}>
          <table className="w-full min-w-[44rem] text-[0.9375rem]">
            <thead className="sticky top-0 bg-[#E5E8E3]">
              <tr className="border-b border-line">
                {["Publication number", "Title", "Filer", "Jurisdiction", "Year"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap font-semibold text-ink tabular-nums`}>
                    {r.number}
                  </td>
                  <td className={`${td} text-ink`}>{r.title}</td>
                  <td className={`${td} text-gray-600`}>{r.Filer}</td>
                  <td className={`${td} whitespace-nowrap text-gray-600`}>{r.Jurisdiction}</td>
                  <td className={`${td} text-gray-600 tabular-nums`}>{r["Priority year"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
