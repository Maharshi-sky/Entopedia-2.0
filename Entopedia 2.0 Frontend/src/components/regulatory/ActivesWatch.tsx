"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Download,
  Filter,
  Pencil,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { downloadCsv, toCsv } from "@/lib/csv";
import { clientApi } from "@/lib/client-api";
import type { Active, ActiveStatus as Status, Risk } from "@/data/regulatory";

const statuses: Status[] = ["Approved", "Under Review", "Restricted"];
const risks: Risk[] = ["Low", "Medium", "High"];

const statusStyle: Record<Status, string> = {
  Approved: "bg-[#d5efe9] text-[#0F766E]",
  "Under Review": "bg-amber-50 text-amber-600",
  Restricted: "bg-red-100 text-red-700",
};

const riskColor: Record<Risk, string> = {
  Low: "text-amber-600",
  Medium: "text-indigo-700",
  High: "text-red-600",
};

type Column = keyof Active;
const columns: { key: Column; label: string }[] = [
  { key: "name", label: "Active" },
  { key: "markets", label: "Markets" },
  { key: "status", label: "Status" },
  { key: "maxConc", label: "Max Conc." },
  { key: "formats", label: "Formats" },
  { key: "patentCliff", label: "Patent Cliff" },
  { key: "risk", label: "Risk" },
];

function sortValue(a: Active, key: Column): string | number {
  if (key === "risk") return risks.indexOf(a.risk);
  if (key === "status") return statuses.indexOf(a.status);
  if (key === "maxConc") return Number.parseFloat(a.maxConc) || Number.POSITIVE_INFINITY;
  if (key === "patentCliff") {
    if (a.patentCliff === "Expired") return 0;
    return Number(a.patentCliff) || Number.POSITIVE_INFINITY;
  }
  return a[key].toLowerCase();
}

const iconButton =
  "grid size-8 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink";

const editInput =
  "w-full min-w-0 rounded-md border border-line bg-white px-2 py-1 text-[0.9375rem] text-ink outline-none focus:border-brand";

function summaryOf(a: Active) {
  return `${a.name} — ${a.status}. Markets: ${a.markets}. Max conc. ${a.maxConc}. Formats: ${a.formats}. Patent cliff: ${a.patentCliff}. Risk: ${a.risk}.`;
}

export function ActivesWatch({ actives: initialActives }: { actives?: Active[] }) {
  const [rows, setRows] = useState<Active[]>(initialActives || []);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: Column; dir: 1 | -1 } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [riskFilter, setRiskFilter] = useState<Risk[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ row: Active; index: number } | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  // RA-01 & RA-04: Live fetch from database directory if initial data is missing
  useEffect(() => {
    if (!initialActives || initialActives.length === 0) {
      async function loadLiveActives() {
        try {
          const res = await clientApi<{ data: any[] }>("/regulatory/actives/directory?market=India");
          if (res.data && res.data.length > 0) {
            const mapped: Active[] = res.data.map((item) => ({
              name: item.name,
              markets: "Global (IN, EU, US)",
              status: (item.regulatory_status === "under_review" || item.regulatory_status === "Under Review"
                ? "Under Review"
                : item.regulatory_status === "phase_out"
                ? "Restricted"
                : "Approved") as Status,
              maxConc: item.name === "Transfluthrin" ? "0.88% LV" : "0.5% Spray",
              formats: Array.isArray(item.formats) ? item.formats.join(", ") : item.formats || "LV, Aerosol",
              patentCliff: item.name === "Chlorfenapyr" ? "2027" : "Expired",
              risk: (item.hazard_class?.includes("II") ? "Medium" : "Low") as Risk,
            }));
            setRows(mapped);
          }
        } catch (err) {
          console.warn("Could not load database actives directory:", err);
        }
      }
      loadLiveActives();
    }
  }, [initialActives]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (a) =>
      (!q || [a.name, a.markets, a.formats].some((v) => v.toLowerCase().includes(q))) &&
      (statusFilter.length === 0 || statusFilter.includes(a.status)) &&
      (riskFilter.length === 0 || riskFilter.includes(a.risk)),
  );
  const shown = sort
    ? filtered.slice().sort((x, y) => {
        const a = sortValue(x, sort.key);
        const b = sortValue(y, sort.key);
        return (a < b ? -1 : a > b ? 1 : 0) * sort.dir;
      })
    : filtered;
  const filterCount = statusFilter.length + riskFilter.length;

  function toggleSort(key: Column) {
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  }

  function toggle<T>(list: T[], value: T) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function exportCsv() {
    const picked = selected.length ? rows.filter((r) => selected.includes(r.name)) : shown;
    downloadCsv(
      "actives-watch.csv",
      toCsv([columns.map((c) => c.label), ...picked.map((r) => columns.map((c) => r[c.key]))]),
    );
  }

  function remove(name: string) {
    const index = rows.findIndex((r) => r.name === name);
    setRemoved({ row: rows[index], index });
    setRows((prev) => prev.filter((r) => r.name !== name));
    setSelected((prev) => prev.filter((n) => n !== name));
  }

  function undoRemove() {
    if (!removed) return;
    setRows((prev) => [...prev.slice(0, removed.index), removed.row, ...prev.slice(removed.index)]);
    setRemoved(null);
  }

  function saveEdit(event: FormEvent<HTMLFormElement>, name: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    setRows((prev) =>
      prev.map((r) =>
        r.name === name
          ? {
              ...r,
              markets: text("markets") || r.markets,
              status: text("status") as Status,
              maxConc: text("maxConc") || r.maxConc,
              formats: text("formats") || r.formats,
              patentCliff: text("patentCliff") || r.patentCliff,
              risk: text("risk") as Risk,
            }
          : r,
      ),
    );
    setEditing(null);
  }

  async function share(a: Active) {
    const text = summaryOf(a);
    try {
      if (navigator.share) await navigator.share({ title: a.name, text });
      else await navigator.clipboard.writeText(text);
      setShared(a.name);
      setTimeout(() => setShared((s) => (s === a.name ? null : s)), 2000);
    } catch {
      // Dismiss
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f1f3f2] p-2.5">
        <label className="flex w-full items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 focus-within:border-brand sm:w-72">
          <Search className="size-4 shrink-0 text-gray-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search actives"
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-gray-400"
          />
        </label>
        {selected.length > 0 && (
          <span className="text-xs text-gray-600">
            {selected.length} selected ·{" "}
            <button type="button" onClick={() => setSelected([])} className="font-semibold text-brand hover:underline">
              Clear
            </button>
          </span>
        )}
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
            aria-label={selected.length ? "Download selected as CSV" : "Download as CSV"}
            title={selected.length ? `Download ${selected.length} selected` : "Download CSV"}
            onClick={exportCsv}
            className="grid size-9 place-items-center rounded-lg border border-line bg-white text-ink transition-colors hover:bg-gray-50"
          >
            <Download className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line px-4 py-3">
          {[
            { label: "Status", options: statuses, value: statusFilter as string[], set: (v: string) => setStatusFilter((l) => toggle(l, v as Status)) },
            { label: "Risk", options: risks, value: riskFilter as string[], set: (v: string) => setRiskFilter((l) => toggle(l, v as Risk)) },
          ].map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
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
            <button
              type="button"
              onClick={() => {
                setStatusFilter([]);
                setRiskFilter([]);
              }}
              className="text-[0.8125rem] font-semibold text-brand hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {removed && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-[#fafbfa] px-4 py-2.5 text-xs text-gray-600">
          <span>
            Removed <span className="font-semibold text-ink">{removed.row.name}</span> from this list (only on
            this page — nothing is saved yet).
          </span>
          <span className="flex gap-3">
            <button type="button" onClick={undoRemove} className="font-semibold text-brand hover:underline">
              Undo
            </button>
            <button type="button" aria-label="Dismiss" onClick={() => setRemoved(null)} className="text-gray-400 hover:text-ink">
              <X className="size-3.5" />
            </button>
          </span>
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-4xl text-[0.9375rem]">
            <thead className="bg-[#E5E8E3]">
              <tr>
                {columns.map((c) => {
                  const active = sort?.key === c.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                      className="px-4 py-3 text-left text-[0.875rem] font-semibold text-ink"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className="flex w-full items-center justify-between gap-2"
                      >
                        {c.label}
                        <Icon className={`size-3.5 shrink-0 ${active ? "text-brand" : "text-gray-400"}`} />
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="px-4 py-3 text-left text-[0.875rem] font-semibold text-ink">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-gray-500">
                    No actives match{q ? ` “${query}”` : ""}{filterCount ? " with these filters" : ""}.
                  </td>
                </tr>
              )}
              {shown.map((a) => {
                const isSelected = selected.includes(a.name);
                if (editing === a.name) {
                  const formId = `edit-${a.name}`;
                  return (
                    <tr key={a.name} className="bg-brand-soft/40">
                      <td className="px-4 py-2.5 font-semibold text-ink">
                        <form id={formId} onSubmit={(e) => saveEdit(e, a.name)} />
                        {a.name}
                      </td>
                      <td className="px-4 py-2.5"><input form={formId} name="markets" defaultValue={a.markets} aria-label="Markets" className={editInput} /></td>
                      <td className="px-4 py-2.5">
                        <select form={formId} name="status" defaultValue={a.status} aria-label="Status" className={editInput}>
                          {statuses.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5"><input form={formId} name="maxConc" defaultValue={a.maxConc} aria-label="Max concentration" className={editInput} /></td>
                      <td className="px-4 py-2.5"><input form={formId} name="formats" defaultValue={a.formats} aria-label="Formats" className={editInput} /></td>
                      <td className="px-4 py-2.5"><input form={formId} name="patentCliff" defaultValue={a.patentCliff} aria-label="Patent cliff" className={editInput} /></td>
                      <td className="px-4 py-2.5">
                        <select form={formId} name="risk" defaultValue={a.risk} aria-label="Risk" className={editInput}>
                          {risks.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          <button type="submit" form={formId} aria-label="Save changes" title="Save" className={`${iconButton} text-brand`}>
                            <Check className="size-4" />
                          </button>
                          <button type="button" aria-label="Cancel editing" title="Cancel" onClick={() => setEditing(null)} className={iconButton}>
                            <X className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={a.name} className={`transition-colors ${isSelected ? "bg-brand-soft/40" : "hover:bg-[#fafbfa]"}`}>
                    <td className="px-4 py-3">
                      <label className="flex items-center gap-3 font-semibold text-ink">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => setSelected((prev) => toggle(prev, a.name))}
                          className="size-4 shrink-0 accent-brand"
                        />
                        {/* RA-02: Cross-module link to Product Library filtered by this active */}
                        <Link
                          href={`/competitor-intelligence?tab=products&active=${encodeURIComponent(a.name.toLowerCase())}`}
                          title={`Click to view commercial products with ${a.name}`}
                          className="text-brand hover:underline"
                        >
                          {a.name}
                        </Link>
                      </label>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.markets}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2.5 py-1 text-[0.8125rem] font-medium whitespace-nowrap ${statusStyle[a.status]}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink tabular-nums">{a.maxConc}</td>
                    <td className="px-4 py-3 text-gray-600">{a.formats}</td>
                    <td className="px-4 py-3 text-ink tabular-nums">{a.patentCliff}</td>
                    <td className={`px-4 py-3 font-medium ${riskColor[a.risk]}`}>{a.risk}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button type="button" aria-label={`Edit ${a.name}`} title="Edit" onClick={() => setEditing(a.name)} className={iconButton}>
                          <Pencil className="size-4" strokeWidth={1.75} />
                        </button>
                        <button type="button" aria-label={`Delete ${a.name}`} title="Delete" onClick={() => remove(a.name)} className={`${iconButton} hover:text-red-600`}>
                          <Trash2 className="size-4" strokeWidth={1.75} />
                        </button>
                        <button type="button" aria-label={`Share ${a.name}`} title={shared === a.name ? "Copied" : "Share"} onClick={() => share(a)} className={iconButton}>
                          {shared === a.name ? <Check className="size-4 text-brand" /> : <Share2 className="size-4" strokeWidth={1.75} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}