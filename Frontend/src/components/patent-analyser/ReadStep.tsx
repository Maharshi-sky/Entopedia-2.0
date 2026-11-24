"use client";

import type { FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import type { Sheet } from "./sheet";
import type { Derived, RecordReadResult } from "./analysis";
import { primaryButton, secondaryButton } from "./styles";
import { analyserStore as store, sameContext, type ReadContext } from "./store";

type AnalyserState = ReturnType<typeof store.get>;

const SLICE = 20;

function relevanceBadge(rel: RecordReadResult["relevance"]) {
  if (rel === "High") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (rel === "Medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-gray-200 bg-gray-100 text-gray-600";
}

export function ReadStep({
  sheet,
  derived,
  brief,
  categories,
  attributes,
  aiReads,
  readContext,
  sliceOnly,
  run,
}: {
  sheet: Sheet;
  derived: Derived;
  brief: string;
  categories: string[];
  attributes: string[];
  aiReads: Record<number, RecordReadResult>;
  /** The brief and setup the results below were read with. */
  readContext: ReadContext | null;
  sliceOnly: boolean;
  run: AnalyserState["run"];
}) {
  const running = run.running;
  const completedList = Object.values(aiReads).sort((a, b) => a.id - b.id);
  const readCount = completedList.length;
  const sameSetup = readContext !== null && sameContext(readContext, { brief, categories, attributes });
  const stale = !running && readCount > 0 && readContext !== null && !sameSetup;
  // With the same brief and setup, reading carries on from the records not read yet.
  const unread = sameSetup ? derived.records.filter((r) => !aiReads[r.id]) : derived.records;
  const canContinue = sameSetup && readCount > 0 && unread.length > 0;
  const allRead = sameSetup && readCount > 0 && unread.length === 0;
  const next = sliceOnly ? unread.slice(0, SLICE) : unread;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Runs in the analyser store, so it keeps going if you open another step or module.
    void store.startRead(next);
  }

  function readAllAgain() {
    const all = derived.records;
    void store.startRead(sliceOnly ? all.slice(0, SLICE) : all, { fresh: true });
  }

  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-ink">Read the sheet</h2>
        <p className="mt-1 text-xs text-gray-600">
          The brief is what relevance gets judged against. Be specific about the
          decision in front of you, because a vague brief returns a set where
          everything is medium.
        </p>
      </section>

      <Card>
        <form onSubmit={handleSubmit}>
          <label
            htmlFor="analysis-brief"
            className="text-[0.8125rem] font-bold tracking-wider text-gray-600 uppercase"
          >
            Analysis brief
          </label>
          <textarea
            id="analysis-brief"
            required
            value={brief}
            onChange={(e) => store.setBrief(e.target.value)}
            placeholder="e.g. Evaluate low-smoke mosquito coil and liquid vaporizer formulations using fluorinated pyrethroids (transfluthrin, meperfluthrin) for extended indoor protection."
            rows={3}
            className="mt-2 w-full resize-y rounded-lg border border-line px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brand"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={running || allRead} className={primaryButton}>
              {running
                ? "Reading records…"
                : allRead
                  ? "All records read"
                  : canContinue
                    ? `Continue reading (${unread.length} left)`
                    : "Read records"}
            </button>
            {readCount > 0 && sameSetup && !running && (
              <button type="button" onClick={readAllAgain} className={secondaryButton}>
                Read again from the start
              </button>
            )}
            <button
              type="button"
              disabled={!running || run.stopping}
              onClick={store.stopRead}
              className={secondaryButton}
            >
              Stop
            </button>
            <p role="status" className="text-xs text-gray-600">
              {run.status ??
                `${sheet.rows.length} records loaded · ${readCount} read` +
                  (next.length ? ` · next ${next.length} will be read via the AI model.` : ".")}
            </p>
          </div>

          {running && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{ width: `${Math.round((run.done / Math.max(1, run.total)) * 100)}%` }}
              />
            </div>
          )}

          {run.error && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {run.error}
            </p>
          )}

          {stale && (
            <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              These results were read with a different brief, taxonomy or attribute list than the one set now.
              Press Read records to read again; the new results replace these.
            </p>
          )}

          <label className="mt-4 flex w-fit items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={sliceOnly}
              onChange={(e) => store.setSliceOnly(e.target.checked)}
              disabled={running}
              className="size-4 accent-brand"
            />
            Next {SLICE} records only
            <span className="text-gray-500">
              Test the brief on a slice, then continue in steps or untick to read the rest.
            </span>
          </label>
        </form>
      </Card>

      {completedList.length > 0 && (
        <Card flush className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-[#f1f3f2] px-4 py-3">
            <h3 className="text-[0.9375rem] font-semibold text-ink">
              Extracted Read Results ({completedList.length} records)
            </h3>
            <span className="text-xs text-gray-500">
              High: {completedList.filter((r) => r.relevance === "High").length} · Medium:{" "}
              {completedList.filter((r) => r.relevance === "Medium").length} · Low:{" "}
              {completedList.filter((r) => r.relevance === "Low").length}
            </span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-208 text-left text-xs">
              <thead className="sticky top-0 bg-[#E5E8E3] text-[0.75rem] font-bold tracking-wider text-gray-700 uppercase">
                <tr className="border-b border-line">
                  <th className="px-3 py-2.5">Pub. Number</th>
                  <th className="px-3 py-2.5">Relevance</th>
                  <th className="px-3 py-2.5">AI Summary &amp; Fit</th>
                  {attributes.map((attr) => (
                    <th key={attr} className="px-3 py-2.5">
                      {attr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {completedList.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap text-ink tabular-nums">
                      {item.number}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-[0.6875rem] font-bold ${relevanceBadge(item.relevance)}`}
                      >
                        {item.relevance}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink">
                      <p className="font-medium">{item.summary}</p>
                      {item.relevance_reason && (
                        <p className="mt-1 text-[0.75rem] text-gray-500">{item.relevance_reason}</p>
                      )}
                    </td>
                    {attributes.map((attr) => (
                      <td key={attr} className="px-3 py-2.5 text-gray-700">
                        {item.attributes?.[attr] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}