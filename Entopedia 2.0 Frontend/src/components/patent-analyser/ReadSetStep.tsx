"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { MODEL_NOT_CONNECTED, primaryButton, secondaryButton } from "./styles";

const reads = [
  "Executive summary",
  "Cross-cutting themes",
  "Filer profiles",
  "What changed recently",
];

const askModes = [
  { label: "Ask a question", placeholder: "Who is filing on the enzymatic route, and has anyone claimed a dosing point in the line?" },
  { label: "Compare filers", placeholder: "How do Godrej and SC Johnson differ in what they claim for LV formats?" },
  { label: "Find what's missing", placeholder: "Which active and format combinations have no filings at all?" },
];

export function ReadSetStep() {
  const [read, setRead] = useState<string | null>(null);
  const [mode, setMode] = useState(askModes[0].label);
  const [question, setQuestion] = useState("");
  const [askStatus, setAskStatus] = useState<string | null>(null);
  const placeholder = askModes.find((m) => m.label === mode)?.placeholder;

  function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAskStatus(MODEL_NOT_CONNECTED);
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
              aria-pressed={read === r}
              onClick={() => setRead(r)}
              className={read === r ? primaryButton : secondaryButton}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[0.8125rem] text-gray-500">
          {read
            ? `${read}: ${MODEL_NOT_CONNECTED}`
            : "One model call each, over the whole sheet rather than a ranked slice. Above roughly 150 records these switch to the highest relevance rows and say so in the output."}
        </p>
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
              onChange={(e) => setMode(e.target.value)}
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
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder={placeholder}
            className="mt-2 w-full resize-y rounded-lg border border-line px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" className={primaryButton}>
              Run
            </button>
            {askStatus && (
              <p role="status" className="text-xs text-gray-600">
                {askStatus}
              </p>
            )}
          </div>
        </form>
      </Card>
    </>
  );
}
