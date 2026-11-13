"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileText,
  Lock,
  Network,
  Presentation,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { builders, EMPTY_SOURCE_DATA, toMarkdown, type Page, type TemplateId } from "./content";

type Template = {
  title: string;
  description: string;
  icon: LucideIcon;
  // Modules the template reads from; shown so users know where content comes from.
  modules: string[];
} & ({ id: TemplateId; locked?: false } | { id: string; locked: true; pages: number; reason: string });

const templates: Template[] = [
  {
    id: "patent-landscape",
    title: "Patent Landscape Report",
    description: "Auto-generated landscape from an uploaded patent set",
    icon: Network,
    modules: ["Patent Sheet Analyser"],
  },
  {
    id: "paper-digest",
    title: "Research Paper Digest",
    description: "Summarise and key insights across a paper set",
    icon: BookOpen,
    modules: ["Research Papers"],
  },
  {
    id: "teardown",
    title: "Teardown Summary",
    description: "Competitor SKU teardown with active, format, price",
    icon: ScanSearch,
    modules: ["Product Library", "Regulatory & Actives"],
  },
  {
    id: "quarterly-deck",
    title: "Quarterly Landscape Deck",
    description: "Patent + competitor + regulatory intelligence digest",
    icon: Presentation,
    modules: ["Competitor Intelligence", "Patent Sheet Analyser", "Deals & Investments", "Regulatory & Actives", "News"],
  },
  // Templates appear as more modules are enabled; until then they show locked, not hidden.
  {
    id: "field-report",
    title: "Pest Vision Field Report",
    description: "Species identifications and hotspots from field photos",
    icon: Bug,
    modules: ["Pest Vision"],
    locked: true,
    pages: 5,
    reason: "Needs Pest Vision access",
  },
  {
    id: "compliance-pack",
    title: "Claims Compliance Pack",
    description: "Claim ideas checked against each market's rules",
    icon: ShieldCheck,
    modules: ["Claim Studio AI", "Regulatory & Actives"],
    locked: true,
    pages: 8,
    reason: "Needs Claim Studio AI access",
  },
];

// Short status steps while the pages are assembled; each names what it reads.
const STEP_MS = 320;

type Run = { id: TemplateId; step: number; pages: Page[] };

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function TemplateCard({
  template,
  pages,
  active,
  onGenerate,
  onRequest,
}: {
  template: Template;
  pages: number;
  active: boolean;
  onGenerate: () => void;
  onRequest: () => void;
}) {
  const { title, description, icon: Icon, modules, locked } = template;
  return (
    <div
      className={`flex flex-col rounded-xl border bg-white p-5 transition-colors ${
        active ? "border-brand ring-1 ring-brand" : "border-line"
      } ${locked ? "bg-[#fafbfa]" : ""}`}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-lg border border-[#E0E5E1] bg-[#F6F8F6] ${
            locked ? "text-gray-400" : "text-brand"
          }`}
        >
          <Icon className="size-[1.125rem]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className={`text-[1.0625rem] leading-snug font-semibold ${locked ? "text-gray-500" : "text-ink"}`}>
              {title}
            </h2>
            {locked && (
              <span className="flex shrink-0 items-center gap-1 rounded bg-[#EEF2EF] px-2 py-0.5 text-[0.75rem] font-semibold text-gray-600">
                <Lock className="size-3" /> Locked
              </span>
            )}
          </div>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-gray-500">{description}</p>
          <p className="pt-3.5 text-sm font-semibold text-gray-600">{pages} PP</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {modules.map((m) => (
          <span key={m} className="rounded bg-[#f1f3f2] px-2 py-0.5 text-[0.75rem] text-gray-600">
            {m}
          </span>
        ))}
      </div>

      <div aria-hidden className="min-h-4 flex-1" />
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-[0.8125rem] text-gray-500">
          {template.locked ? template.reason : "Sources cited on every page"}
        </span>
        {locked ? (
          <button
            type="button"
            onClick={onRequest}
            className="shrink-0 rounded-lg border border-line bg-white px-3.5 py-2 text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-gray-50"
          >
            Request access
          </button>
        ) : (
          <button
            type="button"
            onClick={onGenerate}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-brand/90"
          >
            <Sparkles className="size-3.5" strokeWidth={1.75} />
            {active ? "Regenerate" : "Generate"}
          </button>
        )}
      </div>
    </div>
  );
}

function Generating({ template, step }: { template: Template; step: number }) {
  const steps = [
    ...template.modules.map((m) => `Reading ${m}`),
    "Laying out pages",
    "Attaching sources",
  ];
  return (
    <ol className="mt-4 space-y-2.5" aria-live="polite">
      {steps.map((s, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={s} className={`flex items-center gap-3 text-[0.9375rem] ${done || current ? "text-ink" : "text-gray-400"}`}>
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full ${
                done ? "bg-brand text-white" : current ? "animate-pulse bg-brand-soft" : "bg-gray-100"
              }`}
            >
              {done && <Check className="size-3" strokeWidth={3} />}
            </span>
            {s}
            {current && "…"}
          </li>
        );
      })}
    </ol>
  );
}

function PagePreview({ page, index, total }: { page: Page; index: number; total: number }) {
  return (
    <div key={index} className="chart-fade flex aspect-[16/10] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-6 py-3">
        <span className="text-[0.75rem] font-semibold tracking-wider text-gray-400 uppercase">
          Page {index + 1} of {total}
        </span>
        <Badge tone="green" size="sm">Retrieved</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <h3 className="font-heading text-xl font-semibold text-ink">{page.title}</h3>
        <ul className="mt-3 space-y-2">
          {page.points.map((p) => (
            <li key={p} className="flex gap-2 text-[0.9375rem] leading-relaxed text-gray-700">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      {page.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-[#fafbfa] px-6 py-2.5">
          <span className="text-[0.75rem] font-semibold tracking-wider text-gray-500 uppercase">Sources</span>
          {page.sources.map((s, i) => (
            <span key={s} className="rounded border border-line bg-white px-1.5 py-0.5 text-[0.75rem] text-gray-600">
              <span className="font-semibold text-ink tabular-nums">[{i + 1}]</span> {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeliverableGenerator() {
  const [run, setRun] = useState<Run | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const toastTimer = useRef<number | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      clearTimeout(toastTimer.current);
    },
    [],
  );

  const ready = templates.filter((t) => !t.locked);
  const pageCount = (t: Template) => (t.locked ? t.pages : builders[t.id](EMPTY_SOURCE_DATA).length);
  const template = run ? templates.find((t) => t.id === run.id)! : null;
  const stepCount = template ? template.modules.length + 2 : 0;
  const done = run !== null && run.step >= stepCount;

  function notify(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }

  function generate(t: Template) {
    if (t.locked) return;
    timers.current.forEach(clearTimeout);
    const pages = builders[t.id](EMPTY_SOURCE_DATA);
    const steps = t.modules.length + 2;
    setRun({ id: t.id, step: 0, pages });
    setPageIndex(0);
    timers.current = Array.from({ length: steps }, (_, i) =>
      window.setTimeout(() => setRun((r) => (r && r.id === t.id ? { ...r, step: i + 1 } : r)), STEP_MS * (i + 1)),
    );
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <>
      <p className="text-xs text-gray-600">
        {ready.length} templates ready to generate · {templates.length - ready.length} need module access. Every
        page is assembled from your modules&apos; data and cites where each point came from.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            pages={pageCount(t)}
            active={run?.id === t.id}
            onGenerate={() => generate(t)}
            onRequest={() =>
              notify("Access requests aren't connected yet — ask an Admin to enable the module for you.")
            }
          />
        ))}
      </div>

      {run && template && (
        <div ref={panelRef} className="scroll-mt-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">{template.title}</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {done
                    ? `${run.pages.length} pages from ${template.modules.join(", ")}.`
                    : `Assembling from ${template.modules.length} ${template.modules.length === 1 ? "module" : "modules"}…`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {done && (
                  <>
                    {(["PPT", "PDF"] as const).map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() =>
                          notify(`The ${format} export service isn't connected yet, so no file was created. Download the outline instead.`)
                        }
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.875rem] font-semibold transition-colors ${
                          format === "PPT"
                            ? "bg-brand text-white hover:bg-brand/90"
                            : "border border-line bg-white text-ink hover:bg-gray-50"
                        }`}
                      >
                        <FileDown className="size-4" strokeWidth={1.75} />
                        Export {format}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        downloadText(
                          `${template.id}.md`,
                          toMarkdown(template.title, run.pages),
                        );
                        notify("Outline downloaded with sources.");
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-gray-50"
                    >
                      <FileText className="size-4" strokeWidth={1.75} />
                      Outline .md
                    </button>
                  </>
                )}
                <button
                  type="button"
                  aria-label="Close preview"
                  onClick={() => {
                    timers.current.forEach(clearTimeout);
                    setRun(null);
                  }}
                  className="grid size-9 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {!done ? (
              <Generating template={template} step={run.step} />
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[14rem_1fr]">
                {/* Page rail: a column on desktop, a sideways strip on smaller screens. */}
                <ol className="scrollbar-none flex gap-2 overflow-x-auto lg:max-h-[32rem] lg:flex-col lg:overflow-y-auto">
                  {run.pages.map((p, i) => (
                    <li key={p.title} className="shrink-0 lg:shrink">
                      <button
                        type="button"
                        aria-current={i === pageIndex ? "page" : undefined}
                        onClick={() => setPageIndex(i)}
                        className={`chart-fade w-44 rounded-lg border px-3 py-2 text-left transition-colors lg:w-full ${
                          i === pageIndex ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"
                        }`}
                        style={{ animationDelay: `${i * 45}ms` }}
                      >
                        <span className="block text-[0.75rem] font-semibold text-gray-500 tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="block truncate text-[0.875rem] font-medium text-ink">{p.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>

                <div>
                  <PagePreview page={run.pages[pageIndex]} index={pageIndex} total={run.pages.length} />
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      disabled={pageIndex === 0}
                      onClick={() => setPageIndex((i) => i - 1)}
                      className="flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-gray-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="size-4" /> Previous
                    </button>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {pageIndex + 1} / {run.pages.length}
                    </span>
                    <button
                      type="button"
                      disabled={pageIndex === run.pages.length - 1}
                      onClick={() => setPageIndex((i) => i + 1)}
                      className="flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-gray-50 disabled:opacity-40"
                    >
                      Next <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="drawer-in fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl bg-ink px-4 py-3 text-[0.875rem] text-white shadow-xl"
        >
          <span className="flex-1">{toast}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="text-white/60 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
