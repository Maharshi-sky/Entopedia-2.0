"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RefreshCw } from "lucide-react";
import {
  getNewsPanel,
  showLatestNews,
  startNewsRefresh,
  type NewsBrandRow,
  type NewsRun,
} from "@/lib/news-actions";

const COUNTRIES = ["IN", "US", "UK", "AU", "SA", "DE"];
const DAY_CHOICES = [7, 30, 90];
const POLL_MS = 10_000;

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

function RunSummary({ run }: { run: NewsRun }) {
  if (run.status === "running") {
    const p = run.notes?.progress;
    return (
      <>
        Fetching news (last {run.days} days, {run.country})
        {p?.current ? (
          <>
            : <span className="font-medium text-ink">{p.current}</span> ({p.done + 1} of {p.total})
            {p.saved > 0 ? `, ${p.saved} stories saved so far` : ""}
          </>
        ) : (
          ` for ${run.brands.join(", ")}`
        )}
        … Each brand takes a few minutes; stories appear below as each one finishes.
      </>
    );
  }
  if (run.status === "failed") {
    return <span className="text-red-700">Last refresh failed: {run.error}</span>;
  }
  return (
    <>
      Last refresh {when(run.finished_at)}: {run.saved} stories saved from {run.found} found, {run.dropped} unrelated
      removed{run.with_image != null ? `, ${run.with_image} with a picture` : ""}.{" "}
      {run.ai_model ? `Sorted by ${run.ai_model}.` : "Sorted by keyword (no AI)."}
      {run.notes?.ai ? ` ${run.notes.ai}.` : ""}
    </>
  );
}

const selectClass =
  "cursor-pointer appearance-none rounded-lg border border-line bg-white py-2 pr-8 pl-3 text-[0.9375rem] text-ink outline-none focus:border-brand disabled:opacity-60";

/** Admin-only: fetch fresh brand news from the News page. */
export function NewsRefresh() {
  const router = useRouter();
  const [run, setRun] = useState<NewsRun | null>(null);
  const [brands, setBrands] = useState<NewsBrandRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [country, setCountry] = useState("IN");
  const [starting, setStarting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const watching = useRef<number | null>(null);
  const brandsShown = useRef(0);

  const load = useCallback(async () => {
    const state = await getNewsPanel();
    setLoaded(true);
    if (!state.ok) {
      setError(state.error);
      return null;
    }
    setError(null);
    setRun(state.run);
    setBrands(state.brands);
    return state.run;
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Poll while a refresh runs (it takes minutes, so every 10s is plenty; skipped while the tab is
    // in the background). When it finishes, reload the feed with the new stories.
    async function tick() {
      if (cancelled) return;
      if (document.hidden && watching.current !== null) {
        window.setTimeout(tick, POLL_MS);
        return;
      }
      const latest = await load();
      if (cancelled) return;
      if (latest?.status === "running") {
        watching.current = latest.id;
        // A brand finished and its stories were saved: show them without waiting for the whole refresh.
        const done = latest.notes?.progress?.done ?? 0;
        if (done > brandsShown.current) {
          brandsShown.current = done;
          await showLatestNews();
          router.refresh();
        }
        window.setTimeout(tick, POLL_MS);
      } else if (watching.current !== null && latest && latest.id === watching.current) {
        watching.current = null;
        await showLatestNews();
        router.refresh();
      }
    }
    tick();
    return () => {
      cancelled = true;
    };
  }, [load, router, run?.id, run?.status]);

  async function refresh() {
    setStarting(true);
    const res = await startNewsRefresh({ days, country });
    setStarting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    watching.current = res.run.id;
    brandsShown.current = 0;
    setRun(res.run);
  }

  const running = run?.status === "running";

  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-gray-600" aria-live="polite">
          {error ? (
            <span className="text-red-700">{error}</span>
          ) : !loaded ? (
            "Loading news status…"
          ) : run ? (
            <RunSummary run={run} />
          ) : (
            "No refresh has run yet."
          )}
        </p>
        <div className="relative shrink-0">
          <select
            aria-label="How far back"
            value={days}
            disabled={running}
            onChange={(e) => setDays(Number(e.target.value))}
            className={selectClass}
          >
            {DAY_CHOICES.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink" />
        </div>
        <div className="relative shrink-0">
          <select
            aria-label="Google News edition"
            value={country}
            disabled={running}
            onChange={(e) => setCountry(e.target.value)}
            className={selectClass}
          >
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink" />
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={running || starting}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${running ? "animate-spin" : ""}`} />
          {running ? "Refreshing…" : starting ? "Starting…" : "Refresh news"}
        </button>
      </div>

      {brands.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-ink">Tracked brands ({brands.length})</summary>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr>
                <th className="py-1.5 font-semibold">Brand</th>
                <th className="py-1.5 font-semibold">Searches</th>
                <th className="py-1.5 text-right font-semibold">Stories</th>
                <th className="py-1.5 text-right font-semibold">Latest</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.name} className="border-t border-line">
                  <td className="py-1.5 font-medium text-ink">
                    {b.name}
                    {!b.is_active && <span className="ml-1 text-xs text-gray-400">(paused)</span>}
                  </td>
                  <td className="py-1.5 text-gray-600">
                    {b.search_terms.length ? b.search_terms.map((t) => `"${b.name}" ${t}`).join(", ") : `"${b.name}"`}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{b.stories}</td>
                  <td className="py-1.5 text-right text-gray-600">{when(b.latest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
