"use client";

import { Fragment, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Download,
  Filter,
  Flag,
  Search,
  ShieldCheck,
} from "lucide-react";
import { downloadCsv, toCsv } from "@/lib/csv";
import type { AuditEntry, Retrieval } from "@/data/audit";

// Same table look as Actives Watch: no column lines, normal-case headers,
// borderless pills.
const th = "px-4 py-3 text-left text-[0.875rem] font-semibold text-ink";
const td = "px-4 py-3";
const pill = "inline-block rounded px-2.5 py-1 text-[0.8125rem] font-medium whitespace-nowrap";
const iconButton =
  "grid size-8 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink";

type Band = "High (90%+)" | "Medium (80–89%)" | "Low (<80%)";

const retrievals: Retrieval[] = ["Retrieved", "Inferred"];
const bands: Band[] = ["High (90%+)", "Medium (80–89%)", "Low (<80%)"];

const bandOf = (c: number): Band => (c >= 90 ? "High (90%+)" : c >= 80 ? "Medium (80–89%)" : "Low (<80%)");

// Every confidence level is labelled, so colour is never the only signal.
const bandStyle: Record<Band, string> = {
  "High (90%+)": "bg-[#d5efe9] text-[#0F766E]",
  "Medium (80–89%)": "bg-amber-50 text-amber-600",
  "Low (<80%)": "bg-red-100 text-red-700",
};

const retrievalStyle: Record<Retrieval, string> = {
  Retrieved: "bg-[#d5efe9] text-[#0F766E]",
  Inferred: "bg-indigo-50 text-indigo-600",
};

type SortKey = "at" | "user" | "confidence";
const columns: { label: string; sort?: SortKey }[] = [
  { label: "Timestamp", sort: "at" },
  { label: "User", sort: "user" },
  { label: "Query" },
  { label: "Modules Touched" },
  { label: "Sources Cited" },
  { label: "Retrieval" },
  { label: "Confidence", sort: "confidence" },
  { label: "Actions" },
];

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  // Filter options come from whatever the log contains.
  const users = [...new Set(entries.map((e) => e.user))];
  const modules = [...new Set(entries.flatMap((e) => e.modules))];
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [userFilter, setUserFilter] = useState<string[]>([]);
  const [moduleFilter, setModuleFilter] = useState<string[]>([]);
  const [retrievalFilter, setRetrievalFilter] = useState<Retrieval[]>([]);
  const [bandFilter, setBandFilter] = useState<Band[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "at", dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<string[]>([]);

  const q = query.trim().toLowerCase();
  const shown = entries
    .filter(
      (e) =>
        (!q || [e.query, e.user, ...e.modules, ...e.sources].some((v) => v.toLowerCase().includes(q))) &&
        (userFilter.length === 0 || userFilter.includes(e.user)) &&
        (moduleFilter.length === 0 || e.modules.some((m) => moduleFilter.includes(m))) &&
        (retrievalFilter.length === 0 || retrievalFilter.includes(e.retrieval)) &&
        (bandFilter.length === 0 || bandFilter.includes(bandOf(e.confidence))),
    )
    .sort((x, y) => {
      const a = x[sort.key];
      const b = y[sort.key];
      return (a < b ? -1 : a > b ? 1 : 0) * sort.dir;
    });

  const filterCount = userFilter.length + moduleFilter.length + retrievalFilter.length + bandFilter.length;
  const avg = shown.length ? Math.round(shown.reduce((s, e) => s + e.confidence, 0) / shown.length) : 0;
  const inferred = shown.filter((e) => e.retrieval === "Inferred").length;

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function clearFilters() {
    setUserFilter([]);
    setModuleFilter([]);
    setRetrievalFilter([]);
    setBandFilter([]);
  }

  function exportCsv() {
    downloadCsv(
      "audit-log.csv",
      toCsv([
        ["Timestamp", "User", "Query", "Modules touched", "Sources cited", "Retrieval", "Confidence %", "Flagged"],
        ...shown.map((e) => [
          e.at,
          e.user,
          e.query,
          e.modules.join("; "),
          e.sources.join("; "),
          e.retrieval,
          e.confidence,
          flagged.includes(e.id) ? "Yes" : "No",
        ]),
      ]),
    );
  }

  const filterGroups: { label: string; options: string[]; value: string[]; set: (v: string) => void }[] = [
    { label: "User", options: users, value: userFilter, set: (v) => setUserFilter((l) => toggle(l, v)) },
    { label: "Module", options: modules, value: moduleFilter, set: (v) => setModuleFilter((l) => toggle(l, v)) },
    { label: "Retrieval", options: retrievals, value: retrievalFilter, set: (v) => setRetrievalFilter((l) => toggle(l, v as Retrieval)) },
    { label: "Confidence", options: bands, value: bandFilter, set: (v) => setBandFilter((l) => toggle(l, v as Band)) },
  ];

  return (
    <>
      <section className="rounded-xl border border-line bg-white px-5 py-4">
        <h2 className="flex items-center gap-2 text-[1rem] font-bold text-[#0F766E]">
          <ShieldCheck className="size-4" strokeWidth={1.75} />
          Global Provenance Rule
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          Every AI-generated output in Entopedia carries a provenance footer with source
          chips, confidence score, and Retrieved vs. Inferred tag. This log captures the
          full audit trail.
        </p>
      </section>

      <div className="rounded-xl border border-line bg-white p-5">
        {/* Same search + filter + download strip as Actives Watch. */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f1f3f2] p-2.5">
          <label className="flex w-full items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 focus-within:border-brand sm:w-72">
            <Search className="size-4 shrink-0 text-gray-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the audit log"
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-gray-400"
            />
          </label>
          <span className="text-xs text-gray-600 tabular-nums">
            {shown.length} {shown.length === 1 ? "query" : "queries"} · avg confidence {avg}% · {inferred} inferred
            {flagged.length > 0 && ` · ${flagged.length} flagged`}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              aria-label="Filter"
              aria-expanded={showFilters}
              title="Filter"
              onClick={() => setShowFilters((v) => !v)}
              className={`relative grid size-9 place-items-center rounded-lg border bg-white transition-colors ${
                showFilters || filterCount ? "border-brand text-brand" : "border-line text-ink hover:bg-gray-50"
              }`}
            >
              <Filter className="size-4" strokeWidth={1.75} />
              {filterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-brand text-[0.6875rem] font-bold text-white">
                  {filterCount}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label="Download as CSV"
              title="Download CSV"
              onClick={exportCsv}
              className="grid size-9 place-items-center rounded-lg border border-line bg-white text-ink transition-colors hover:bg-gray-50"
            >
              <Download className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line px-4 py-3">
            {filterGroups.map((group) => (
              <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 w-24 text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
                  {group.label}
                </span>
                {group.options.map((o) => {
                  const on = group.value.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={on}
                      onClick={() => group.set(o)}
                      className={`rounded-md border px-2.5 py-1 text-[0.8125rem] transition-colors ${
                        on ? "border-brand bg-brand text-white" : "border-line text-gray-600 hover:text-ink"
                      }`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            ))}
            {filterCount > 0 && (
              <button type="button" onClick={clearFilters} className="w-fit text-[0.8125rem] font-semibold text-brand hover:underline">
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] text-[0.9375rem]">
              <thead className="bg-[#E5E8E3]">
                <tr>
                  {columns.map((c) => {
                    if (!c.sort) {
                      return (
                        <th key={c.label} scope="col" className={th}>
                          {c.label}
                        </th>
                      );
                    }
                    const key = c.sort;
                    const active = sort.key === key;
                    const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
                    return (
                      <th
                        key={c.label}
                        scope="col"
                        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                        className={th}
                      >
                        <button type="button" onClick={() => toggleSort(key)} className="flex items-center gap-1.5">
                          {c.label}
                          <Icon className={`size-3.5 ${active ? "text-brand" : "text-gray-400"}`} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">
                      No queries match{q ? ` “${query}”` : ""}{filterCount ? " with these filters" : ""}.
                    </td>
                  </tr>
                )}
                {shown.map((e) => {
                  const isOpen = open === e.id;
                  const isFlagged = flagged.includes(e.id);
                  const band = bandOf(e.confidence);
                  return (
                    <Fragment key={e.id}>
                      <tr className={`transition-colors ${isOpen ? "bg-[#fafbfa]" : "hover:bg-[#fafbfa]"}`}>
                        <td className={`${td} whitespace-nowrap text-gray-600 tabular-nums`}>{e.at}</td>
                        <td className={`${td} whitespace-nowrap font-semibold text-ink`}>{e.user}</td>
                        <td className={`${td} text-ink`}>
                          {isFlagged && (
                            <Flag aria-label="Flagged" className="mr-1.5 inline size-3.5 -translate-y-px fill-red-600 text-red-600" />
                          )}
                          {e.query}
                        </td>
                        <td className={`${td} text-gray-600`}>{e.modules.join(", ")}</td>
                        <td className={`${td} text-gray-600`}>{e.sources.join(", ")}</td>
                        <td className={td}>
                          <span className={`${pill} ${retrievalStyle[e.retrieval]}`}>{e.retrieval}</span>
                        </td>
                        <td className={td}>
                          <span title={band} className={`${pill} tabular-nums ${bandStyle[band]}`}>
                            {e.confidence}%
                          </span>
                        </td>
                        <td className={td}>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-label={`${isOpen ? "Hide" : "View"} details for “${e.query}”`}
                              title={isOpen ? "Hide details" : "View details"}
                              onClick={() => setOpen(isOpen ? null : e.id)}
                              className={iconButton}
                            >
                              <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                            </button>
                            <button
                              type="button"
                              aria-pressed={isFlagged}
                              aria-label={isFlagged ? `Unflag “${e.query}”` : `Flag “${e.query}” for review`}
                              title={isFlagged ? "Flagged for review" : "Flag for review"}
                              onClick={() => setFlagged((l) => toggle(l, e.id))}
                              className={`${iconButton} ${isFlagged ? "text-red-600 hover:text-red-700" : "hover:text-red-600"}`}
                            >
                              <Flag className={`size-4 ${isFlagged ? "fill-current" : ""}`} strokeWidth={1.75} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-[#fafbfa]">
                          <td colSpan={columns.length} className="px-4 pt-1 pb-4">
                            <div className="grid grid-cols-1 gap-4 rounded-lg border border-line bg-white p-4 text-xs text-gray-600 md:grid-cols-3">
                              <div>
                                <p className="text-[0.75rem] font-semibold tracking-wider text-gray-500 uppercase">Query</p>
                                <p className="mt-1 text-[0.9375rem] text-ink">{e.query}</p>
                                <p className="mt-1">
                                  Asked by {e.user} · {e.at}
                                </p>
                              </div>
                              <div>
                                <p className="text-[0.75rem] font-semibold tracking-wider text-gray-500 uppercase">Sources cited</p>
                                <ol className="mt-1 space-y-1">
                                  {e.sources.map((s, i) => (
                                    <li key={s}>
                                      <span className="font-semibold text-ink tabular-nums">[{i + 1}]</span> {s}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                              <div>
                                <p className="text-[0.75rem] font-semibold tracking-wider text-gray-500 uppercase">Provenance</p>
                                <p className="mt-1">
                                  <span className="font-semibold text-ink">{e.retrieval}</span> —{" "}
                                  {e.retrieval === "Retrieved"
                                    ? "every point quotes a cited source."
                                    : "some points were reasoned from the sources rather than quoted."}
                                </p>
                                <p className="mt-1">
                                  Confidence <span className="font-semibold text-ink">{e.confidence}%</span> ({band.toLowerCase()})
                                </p>
                                <p className="mt-1">Modules: {e.modules.join(", ")}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {flagged.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            Flags are kept on this page only — there&apos;s no review queue connected yet.
          </p>
        )}
      </div>
    </>
  );
}
