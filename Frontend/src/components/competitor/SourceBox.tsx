import { ExternalLink } from "lucide-react";
import type { Provenance } from "@/data/competitors";

export type { Provenance };

// Caption plus the evidence strip at the foot of each competitor panel.
export function SourceBox({
  caption,
  sources,
  confidence,
  status,
}: Provenance & { caption?: string }) {
  return (
    <div className="mt-auto pt-3">
      {caption && (
        <p className="text-[0.8125rem] text-gray-500 italic">{caption}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-brand-soft/70 p-2.5">
        <div className="flex flex-wrap gap-1.5">
          {sources.map((source) => (
            <span
              key={source}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[0.8125rem] text-gray-600"
            >
              <ExternalLink className="size-3" />
              {source}
            </span>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <span className="rounded-md border border-emerald-200 bg-brand-soft px-2 py-1 text-[0.8125rem] font-semibold text-brand">
            {confidence}% confidence
          </span>
          <span className="rounded-md border border-line bg-white/60 px-2 py-1 text-[0.75rem] font-bold tracking-wide text-gray-600 uppercase">
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}
