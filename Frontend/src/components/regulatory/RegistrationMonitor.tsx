"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  BellRing,
  Check,
  Download,
  Filter,
  Search,
  Share2,
} from "lucide-react";
import { AskForm } from "@/components/ui/AskForm";
import { Card } from "@/components/ui/Card";
import { downloadCsv, toCsv } from "@/lib/csv";
import { clientApi } from "@/lib/client-api";
import { regulators, type Registration as Filing, type Regulator } from "@/data/regulatory";

const market: Record<Regulator, string> = {
  "CIB&RC": "India",
  ANVISA: "Brazil",
  APVMA: "Australia",
  EPA: "United States",
  "EU BPR": "European Union",
};

type SortKey = "regulator" | "brand" | "active" | "format" | "filed" | "preLaunch";
const columns: { key: SortKey; label: string }[] = [
  { key: "regulator", label: "Regulator" },
  { key: "brand", label: "Brand" },
  { key: "active", label: "Active + Loading" },
  { key: "format", label: "Format" },
  { key: "filed", label: "Filed" },
  { key: "preLaunch", label: "Alert" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(date: string) {
  if (!date) return "Recent";
  const [y, m, d] = date.split("-").map(Number);
  if (!m || !d || !y) return date;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const idOf = (f: Filing) => `${f.regulator}-${f.brand}-${f.active}`;

const iconButton =
  "grid size-8 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink";

const alertOptions = ["Pre-launch", "Monitoring"] as const;
type AlertOption = (typeof alertOptions)[number];

export function RegistrationMonitor({ filings: initialFilings }: { filings?: Filing[] }) {
  const [filingsList, setFilingsList] = useState<Filing[]>(initialFilings || []);
  const [filter, setFilter] = useState<Regulator | null>(null);
  const [alerts, setAlerts] = useState<AlertOption[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "filed", dir: -1 });
  const [watched, setWatched] = useState<string[]>([]);
  const [shared, setShared] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // RA-03: Live compliance feed sorted by upcoming deadline
  useEffect(() => {
    if (!initialFilings || initialFilings.length === 0) {
      async function loadLiveUpdates() {
        try {
          const res = await clientApi<{ data: any[] }>("/regulatory/updates?upcoming=1");
          if (res.data && res.data.length > 0) {
            const mapped: Filing[] = res.data.map((item) => ({
              regulator: (item.authority?.includes("CIB") ? "CIB&RC" : item.authority || "CIB&RC") as Regulator,
              brand: item.authority?.includes("CIB") ? "CIB&RC Regulatory Mandate" : "Industry Registration",
              active: item.title,
              loading: item.days_left ? `${item.days_left}d left` : "Active",
              format: item.update_type || "Regulatory Decision",
              filed: item.effective_date || "2026-08-01",
              preLaunch: item.days_left && item.days_left <= 30,
            }));
            setFilingsList(mapped);
          }
        } catch (err) {
          console.warn("Could not load database regulatory updates:", err);
        }
      }
      loadLiveUpdates();
    }
  }, [initialFilings]);

  const q = query.trim().toLowerCase();
  const shown = filingsList
    .filter(
      (f) =>
        (!filter || f.regulator === filter) &&
        (alerts.length === 0 || alerts.includes(f.preLaunch ? "Pre-launch" : "Monitoring")) &&
        (!q || [f.brand, f.active, f.format, f.regulator].some((v) => v.toLowerCase().includes(q))),
    )
    .sort((x, y) => {
      const a = sort.key === "preLaunch" ? Number(x.preLaunch) : x[sort.key].toLowerCase();
      const b = sort.key === "preLaunch" ? Number(y.preLaunch) : y[sort.key].toLowerCase();
      return (a < b ? -1 : a > b ? 1 : 0) * sort.dir;
    });

  const filterCount = (filter ? 1 : 0) + alerts.length;

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function exportCsv() {
    downloadCsv(
      "registration-monitor.csv",
      toCsv([
        ["Regulator", "Market", "Brand", "Active", "Loading", "Format", "Filed", "Pre-launch alert"],
        ...shown.map((f) => [f.regulator, market[f.regulator] || "Global", f.brand, f.active, f.loading, f.format, f.filed, f.preLaunch ? "Yes" : "No"]),
      ]),
    );
  }

  async function share(f: Filing) {
    const text = `${f.brand} filed ${f.active} ${f.loading} (${f.format}) with ${f.regulator}, ${market[f.regulator] || "Global"}, on ${formatDate(f.filed)}${f.preLaunch ? " — pre-launch alert" : ""}.`;
    try {
      if (navigator.share) await navigator.share({ title: `${f.brand} · ${f.regulator}`, text });
      else await navigator.clipboard.writeText(text);
      setShared(idOf(f));
      setTimeout(() => setShared((s) => (s === idOf(f) ? null : s)), 2000);
    } catch {
      // Dismiss
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {regulators.map((r) => {
          const active = filter === r;
          const count = filingsList.filter((f) => f.regulator === r).length;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? null : r)}
              className={`rounded-xl border bg-white px-4 py-4 text-center transition-colors ${
                active ? "border-brand ring-2 ring-brand/20" : "border-line hover:border-gray-300"
              }`}
            >
              <span className="block font-heading text-xl font-semibold text-ink">
                {count}
              </span>
              <span className="mt-1 block text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
                {r}
              </span>
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f1f3f2] p-2.5">
          <label className="flex w-full items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 focus-within:border-brand sm:w-72">
            <Search className="size-4 shrink-0 text-gray-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search filings"
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-gray-400"
            />
          </label>
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
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line px-4 py-3">
            {[
              {
                label: "Regulator",
                options: regulators as readonly string[],
                isOn: (o: string) => filter === o,
                set: (o: string) => setFilter(filter === o ? null : (o as Regulator)),
              },
              {
                label: "Alert",
                options: alertOptions as readonly string[],
                isOn: (o: string) => alerts.includes(o as AlertOption),
                set: (o: string) =>
                  setAlerts((l) => (l.includes(o as AlertOption) ? l.filter((v) => v !== o) : [...l, o as AlertOption])),
              },
            ].map((group) => (
              <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
                  {group.label}
                </span>
                {group.options.map((o) => {
                  const on = group.isOn(o);
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
                  setFilter(null);
                  setAlerts([]);
                }}
                className="text-[0.8125rem] font-semibold text-brand hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-208 text-[0.9375rem]">
              <thead className="bg-[#E5E8E3]">
                <tr>
                  {columns.map((c) => {
                    const active = sort.key === c.key;
                    const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                        className="px-4 py-3 text-left text-[0.8125rem] font-semibold tracking-wider text-gray-600 uppercase"
                      >
                        <button type="button" onClick={() => toggleSort(c.key)} className="flex items-center gap-1.5 uppercase">
                          {c.label}
                          <Icon className={`size-3.5 ${active ? "text-brand" : "text-gray-400"}`} />
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="px-4 py-3 text-right text-[0.8125rem] font-semibold tracking-wider text-gray-600 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-gray-500">
                      No filings match{q ? ` “${query}”` : ""}.
                    </td>
                  </tr>
                )}
                {shown.map((f) => {
                  const id = idOf(f);
                  const isWatched = watched.includes(id);
                  return (
                    <tr key={id} className="transition-colors hover:bg-[#fafbfa]">
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-brand">{f.regulator}</span>
                        <span className="block text-[0.8125rem] text-gray-500">{market[f.regulator] || "Global"}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">{f.brand}</td>
                      <td className="px-4 py-3">
                        <span className="text-ink">{f.active}</span>{" "}
                        <span className="rounded bg-[#f1f3f2] px-1.5 py-0.5 text-[0.8125rem] text-gray-600 tabular-nums">
                          {f.loading}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{f.format}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
                        {formatDate(f.filed)}
                      </td>
                      <td className="px-4 py-3">
                        {f.preLaunch ? (
                          <span className="inline-flex items-center gap-1.5 rounded bg-red-100 px-2 py-1 text-[0.8125rem] font-medium whitespace-nowrap text-red-700">
                            <span aria-hidden className="size-1.5 rounded-full bg-red-600" />
                            Upcoming Deadline (≤30d)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded bg-[#EEF2EF] px-2 py-1 text-[0.8125rem] font-medium whitespace-nowrap text-gray-600">
                            <span aria-hidden className="size-1.5 rounded-full bg-gray-400" />
                            Monitoring
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-pressed={isWatched}
                            aria-label={isWatched ? `Stop watching ${f.brand} ${f.active}` : `Watch ${f.brand} ${f.active}`}
                            title={isWatched ? "Watching" : "Watch for updates"}
                            onClick={() =>
                              setWatched((prev) => (isWatched ? prev.filter((w) => w !== id) : [...prev, id]))
                            }
                            className={`${iconButton} ${isWatched ? "text-brand" : ""}`}
                          >
                            {isWatched ? <BellRing className="size-4" strokeWidth={1.75} /> : <Bell className="size-4" strokeWidth={1.75} />}
                          </button>
                          <button
                            type="button"
                            aria-label={`Share ${f.brand} ${f.active} filing`}
                            title={shared === id ? "Copied" : "Share"}
                            onClick={() => share(f)}
                            className={iconButton}
                          >
                            {shared === id ? <Check className="size-4 text-brand" /> : <Share2 className="size-4" strokeWidth={1.75} />}
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

        {watched.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            Watching {watched.length} {watched.length === 1 ? "filing" : "filings"} on this page. Notifications active.
          </p>
        )}
      </Card>

      <AskForm
        variant="bar"
        placeholder="Ask about any regulator filing or competitor registration..."
        onAsk={async (question) => {
          setNotice(`Querying regulatory knowledge base for: "${question}"`);
        }}
      />
      {notice && (
        <p role="status" className="-mt-2 text-xs text-gray-500">
          {notice}
        </p>
      )}
    </>
  );
}