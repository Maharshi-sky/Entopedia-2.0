"use client";

import type { FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Derived } from "./analysis";
import { primaryButton, secondaryButton } from "./styles";
import { analyserStore as store } from "./store";

const reads = [
  "Executive summary",
  "Cross-cutting themes",
  "Filer profiles",
  "What changed recently",
];

const askModes = [
  {
    label: "Ask a question",
    placeholder: "Who is filing on the enzymatic route, and has anyone claimed a dosing point in the line?",
  },
  {
    label: "Compare filers",
    placeholder: "How do Godrej and SC Johnson differ in what they claim for LV formats?",
  },
  {
    label: "Find what's missing",
    placeholder: "Which active and format combinations have no filings at all?",
  },
];

type AnalyserState = ReturnType<typeof store.get>;

export function ReadSetStep({
  derived,
  preset,
  ask,
}: {
  derived: Derived;
  /** Answers live in the analyser store, so they are still here after switching steps or modules. */
  preset: AnalyserState["preset"];
  ask: AnalyserState["ask"];
}) {
  const read = preset.name;
  const presetLoading = preset.loading;
  const mode = ask.mode;
  const placeholder = askModes.find((m) => m.label === mode)?.placeholder;

  function buildPayloadRecords() {
    // High and Medium relevance records first when the sheet has been read
    const rank = { High: 0, Medium: 1, Low: 2 };
    return [...derived.records]
      .sort((a, b) => (rank[a.relevance ?? "Medium"] ?? 1) - (rank[b.relevance ?? "Medium"] ?? 1))
      .map((r) => ({
        number: r.number,
        title: r.title,
        abstract: r.abstract,
        summary: r.summary,
        Filer: r.Filer,
        Technology: r.Technology,
        "Priority year": r["Priority year"],
        relevance: r.relevance,
      }));
  }

  function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void store.ask(buildPayloadRecords());
  }

  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-ink">Read the set</h2>
        <p className="mt-1 text-xs text-gray-600">
          A sheet of 30 to 100 records is small enough for the model to hold all
          of it at once, which is what makes these whole-set reads possible. Each
          one goes out with every summary in the sheet and comes back citing
          publication numbers.
        </p>
      </section>

      <Card>
        <div className="flex flex-wrap gap-2">
          {reads.map((r) => (
            <button
              key={r}
              type="button"
              disabled={presetLoading}
              aria-pressed={read === r}
              onClick={() => void store.runPreset(r, buildPayloadRecords())}
              className={read === r ? primaryButton : secondaryButton}
            >
              {presetLoading && read === r ? `Running ${r}…` : r}
            </button>
          ))}
        </div>

        {preset.error && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {preset.error}
          </p>
        )}

        {preset.output ? (
          <div className="mt-4 rounded-lg border border-line bg-[#fafbfa] p-4">
            <div className="whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink">
              {preset.output}
            </div>
            {preset.meta && <p className="mt-3 text-xs text-gray-500">{preset.meta}</p>}
          </div>
        ) : (
          <p className="mt-3 text-[0.8125rem] text-gray-500">
            {presetLoading
              ? `Analyzing ${derived.records.length} records with the AI model…`
              : "One model call each, over the whole sheet rather than a ranked slice. Above roughly 150 records these switch to the highest relevance rows and say so in the output."}
          </p>
        )}
      </Card>

      <section>
        <h2 className="text-base font-semibold text-ink">Ask something specific</h2>
        <p className="mt-1 text-xs text-gray-600">
          Three modes over the same records. Answers cite publication numbers and
          say what the set cannot answer rather than filling the gap.
        </p>
      </section>

      <Card>
        <form onSubmit={handleAsk}>
          <div className="relative w-full max-w-64">
            <select
              aria-label="Question mode"
              value={mode}
              onChange={(e) => store.setAskMode(e.target.value)}
              className="w-full cursor-pointer appearance-none rounded-lg border border-line bg-white py-2 pr-9 pl-3 text-[0.9375rem] text-ink outline-none focus:border-brand"
            >
              {askModes.map((m) => (
                <option key={m.label}>{m.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink" />
          </div>

          <label
            htmlFor="set-question"
            className="mt-4 block text-[0.8125rem] font-bold tracking-wider text-gray-600 uppercase"
          >
            Question
          </label>
          <textarea
            id="set-question"
            required
            value={ask.question}
            onChange={(e) => store.setQuestion(e.target.value)}
            rows={2}
            placeholder={placeholder}
            className="mt-2 w-full resize-y rounded-lg border border-line px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={ask.loading} className={primaryButton}>
              {ask.loading ? "Running…" : "Run"}
            </button>
          </div>
        </form>

        {ask.error && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {ask.error}
          </p>
        )}

        {ask.output && (
          <div className="mt-4 rounded-lg border border-line bg-[#fafbfa] p-4">
            <div className="whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink">
              {ask.output}
            </div>
            {ask.meta && <p className="mt-3 text-xs text-gray-500">{ask.meta}</p>}
          </div>
        )}
      </Card>
    </>
  );
}