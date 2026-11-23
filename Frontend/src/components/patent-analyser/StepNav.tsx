"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { steps, type Step } from "./store";
import { primaryButton, secondaryButton } from "./styles";

/** Back and Next under each step, in tab order. */
export function StepNav({
  step,
  onChange,
  nextBlocked,
}: {
  step: Step;
  onChange: (step: Step) => void;
  /** Why Next can't be used yet; null when it can. */
  nextBlocked: string | null;
}) {
  const i = steps.indexOf(step);
  const back = i > 0 ? steps[i - 1] : null;
  const next = i < steps.length - 1 ? steps[i + 1] : null;
  const go = (to: Step) => {
    onChange(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav aria-label="Step navigation" className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-4">
      {back && (
        <button type="button" onClick={() => go(back)} className={`${secondaryButton} inline-flex items-center gap-1.5`}>
          <ArrowLeft className="size-3.5" /> Back: {back}
        </button>
      )}
      {next && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {nextBlocked && <span className="text-xs text-gray-500">{nextBlocked}</span>}
          <button
            type="button"
            disabled={nextBlocked !== null}
            onClick={() => go(next)}
            className={`${primaryButton} inline-flex items-center gap-1.5`}
          >
            Next: {next} <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}
    </nav>
  );
}
