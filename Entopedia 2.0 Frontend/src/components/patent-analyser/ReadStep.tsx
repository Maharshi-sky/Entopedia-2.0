"use client";

import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import type { Sheet } from "./sheet";
import { MODEL_NOT_CONNECTED, primaryButton, secondaryButton } from "./styles";

const SLICE = 20;

export function ReadStep({ sheet }: { sheet: Sheet }) {
  const [brief, setBrief] = useState("");
  const [sliceOnly, setSliceOnly] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const toRead = sliceOnly ? Math.min(SLICE, sheet.rows.length) : sheet.rows.length;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(MODEL_NOT_CONNECTED);
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
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-y rounded-lg border border-line px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brand"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" className={primaryButton}>
              Read records
            </button>
            {/* Nothing runs yet, so there is never a read to stop. */}
            <button type="button" disabled className={secondaryButton}>
              Stop
            </button>
            <p role="status" className="text-xs text-gray-600">
              {status ?? `${sheet.rows.length} records loaded · ${toRead} will be read.`}
            </p>
          </div>

          <label className="mt-4 flex w-fit items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={sliceOnly}
              onChange={(e) => setSliceOnly(e.target.checked)}
              className="size-4 accent-brand"
            />
            First {SLICE} records only
            <span className="text-gray-500">
              Test the brief on a slice before running a few thousand rows.
            </span>
          </label>
        </form>
      </Card>
    </>
  );
}
