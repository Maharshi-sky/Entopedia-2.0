"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ExternalLink, Loader2, ThumbsDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { dismissNews, loadNewsPage } from "@/lib/news-actions";
import { getMe } from "@/lib/profile-actions";
import type { NewsFeedData, NewsFilters } from "@/lib/news-data";
import {
  categories,
  categoryTone,
  type Article,
  type CategoryFilter,
} from "./articles";

// Stories come 20 at a time ("Load more"). Filters run on the server, so they
// cover every story, not just the ones loaded. If the server could not read
// the first page, the feed reads it with the user's own token on load.

const PAGE = 20;

// Shortcut buttons; every category is still in the dropdown.
const quickFilters = categories.slice(0, 5);

type KindFilter = "all" | "brand" | "related" | "company";
const kindLabels: Record<KindFilter, string> = {
  all: "Brand & category news",
  brand: "About the brand",
  related: "Pest-control category",
  company: "Company news",
};

type SourceFilter = "india" | "all";
const sourceLabels: Record<SourceFilter, string> = {
  india: "Indian sources",
  all: "All sources",
};

const kindBadge = (kind: string | undefined, name: string) =>
  kind === "related"
    ? { tone: "indigo" as const, text: `Related · ${name}` }
    : kind === "company"
      ? { tone: "amber" as const, text: `Company · ${name}` }
      : { tone: "green" as const, text: name };

/** The same event from other outlets: "+2 more sources", opening to their links. */
function MoreSources({ sources }: { sources: { source: string; url?: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="text-[0.8125rem] text-gray-500">
      <button type="button" onClick={() => setOpen((v) => !v)} className="font-semibold text-brand hover:underline" aria-expanded={open}>
        +{sources.length} more {sources.length === 1 ? "source" : "sources"}
      </button>
      {open && (
        <span className="ml-1">
          {sources.map((s, i) => (
            <span key={`${s.source}-${i}`}>
              {i > 0 && " · "}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand hover:underline">
                  {s.source}
                </a>
              ) : (
                s.source
              )}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** Shown when a story has no picture, or the publisher's picture fails to load. */
function PublisherTile({ source }: { source: string }) {
  const initials =
    source
      .split(/[\s|·-]+/)
      .filter((w) => /^[\p{L}\p{N}]/u.test(w))
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "N";
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-brand/5 px-2 text-center">
      <span className="text-2xl font-semibold text-brand/70">{initials}</span>
      <span className="line-clamp-2 text-[0.6875rem] font-semibold tracking-wider text-gray-500 uppercase">
        {source}
      </span>
    </div>
  );
}

function ArticleRow({
  article,
  onDismiss,
}: {
  article: Article;
  /** Admins only: remove the story as not relevant. */
  onDismiss?: (article: Article) => void;
}) {
  return (
    <article className="flex overflow-hidden rounded-xl border border-line bg-white">
      {/* Image keeps a fixed share of the row and stretches to its full height. */}
      <div className="relative min-h-32 w-[30%] shrink-0 sm:w-[22%]">
        {article.image ? (
          <RemoteImage src={article.image} alt="" fallback={<PublisherTile source={article.source} />} />
        ) : (
          <PublisherTile source={article.source} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={categoryTone[article.category]} pill>
            {article.category}
          </Badge>
          {(article.brands ?? (article.brand ? [{ name: article.brand, kind: article.kind ?? "brand" }] : [])).map((b) => {
            const badge = kindBadge(b.kind, b.name);
            return (
              <Badge key={`${b.name}-${b.kind}`} tone={badge.tone} pill>
                {badge.text}
              </Badge>
            );
          })}
          <span className="text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
            {article.source}
          </span>
        </div>
        <h2 className="mt-2 text-[1.0625rem] leading-snug font-semibold text-ink">
          {article.title}
        </h2>
        <p className="text-xs text-gray-600">{article.summary}</p>
        {article.moreSources && <MoreSources sources={article.moreSources} />}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
            {article.time}
          </span>
          <span className="flex items-center gap-2">
          {onDismiss && article.id && (
            <button
              type="button"
              onClick={() => onDismiss(article)}
              title="Remove this story and keep it out of later refreshes"
              className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-[0.8125rem] font-semibold text-gray-600 transition-colors hover:border-red-300 hover:text-red-600"
            >
              <ThumbsDown className="size-3.5" />
              Not relevant
            </button>
          )}
          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-[0.8125rem] font-bold tracking-wider text-white uppercase transition-colors hover:bg-brand/90"
            >
              Read article
              <ExternalLink className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          </span>
        </div>
      </div>
    </article>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative shrink-0">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="cursor-pointer appearance-none rounded-lg border border-line bg-white py-2 pr-8 pl-3 text-[0.9375rem] text-ink outline-none focus:border-brand disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink" />
    </div>
  );
}

type Filters = { category: CategoryFilter; brand: string; kind: KindFilter; source: SourceFilter };

/** What the page shows first: brand and category news from Indian outlets (matches the server's first page). */
const DEFAULT_FILTERS: Filters = { category: "All News", brand: "all", kind: "all", source: "india" };

const toApi = (f: Filters): NewsFilters => ({
  category: f.category === "All News" ? undefined : f.category,
  brand: f.brand === "all" ? undefined : f.brand,
  kind: f.kind === "all" ? undefined : f.kind,
  source: f.source,
});

/** Sample mode: the same filtering and paging, on the stories given. */
function localPage(all: Article[], f: Filters, offset: number) {
  const matching = all.filter(
    (a) =>
      (f.category === "All News" || a.category === f.category) &&
      (f.brand === "all" || a.brand === f.brand) &&
      (f.kind === "all" || a.kind === f.kind)
  );
  return { articles: matching.slice(offset, offset + PAGE), total: matching.length };
}

export function NewsFeed({ initial }: { initial: NewsFeedData }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<Article[]>(
    initial.live ? initial.articles : initial.articles.slice(0, PAGE)
  );
  const [total, setTotal] = useState(initial.total);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);
  // Only the latest request may update the list (filters can change while one is in flight).
  const request = useRef(0);
  // true = stories come from the API (server-side, or the user's token after a server failure).
  const [live, setLive] = useState(initial.live);

  // A refresh on this page reloads the server data as brands finish. Show the new first page, unless the
  // reader has filtered or loaded more (then their view stays; the new stories come with the next change).
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    const untouched =
      filters.category === "All News" && filters.brand === "all" && filters.kind === "all" &&
      filters.source === "india" && items.length <= PAGE;
    // Without server data, keep what the user's own token loaded.
    if (untouched && initial.live) {
      setLive(true);
      setItems(initial.articles);
      setTotal(initial.total);
    }
  }

  // The first page is read on the server as the service account. If that failed, read the saved stories
  // with the signed-in user's own token, so every user still sees what earlier refreshes saved.
  useEffect(() => {
    if (initial.live) return;
    const id = ++request.current;
    startTransition(async () => {
      const page = await loadNewsPage(toApi(DEFAULT_FILTERS), 0);
      if (id !== request.current || !page.ok) return;
      setLive(true);
      setItems(page.articles);
      setTotal(page.total);
    });
  }, [initial.live]);

  async function fetchPage(f: Filters, offset: number) {
    if (!live) return { ok: true as const, ...localPage(initial.articles, f, offset) };
    return loadNewsPage(toApi(f), offset);
  }

  function applyFilters(next: Filters) {
    setFilters(next);
    const id = ++request.current;
    startTransition(async () => {
      const page = await fetchPage(next, 0);
      if (id !== request.current) return;
      if (!page.ok) {
        setError(page.error);
        return;
      }
      setError(null);
      setItems(page.articles);
      setTotal(page.total);
    });
  }

  async function loadMore() {
    const id = request.current;
    setLoadingMore(true);
    const page = await fetchPage(filters, items.length);
    setLoadingMore(false);
    if (id !== request.current) return;
    if (!page.ok) {
      setError(page.error);
      return;
    }
    setError(null);
    // A refresh may have added stories meanwhile: skip any already shown.
    const seen = new Set(items.map((a) => a.id ?? `${a.brand ?? ""}|${a.title}`));
    setItems([...items, ...page.articles.filter((a) => !seen.has(a.id ?? `${a.brand ?? ""}|${a.title}`))]);
    setTotal(page.total);
  }

  const filtered =
    filters.category !== "All News" || filters.brand !== "all" || filters.kind !== "all" || filters.source !== "india";

  // Admins can remove a story as not relevant; later refreshes then leave it out.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let current = true;
    getMe().then((me) => {
      if (current) setIsAdmin(me?.role === "admin");
    });
    return () => {
      current = false;
    };
  }, []);

  async function dismiss(article: Article) {
    if (!article.id) return;
    if (!window.confirm(`Remove "${article.title}" as not relevant? Later refreshes will leave it out.`)) return;
    const result = await dismissNews(article.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setItems((prev) => prev.filter((a) => a.id !== article.id));
    setTotal((t) => Math.max(0, t - 1));
  }
  const more = items.length < total;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="News category"
          className="scrollbar-none flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1.5"
        >
          {quickFilters.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === filters.category}
              onClick={() => applyFilters({ ...filters, category: c })}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-[0.9375rem] transition-colors ${
                c === filters.category
                  ? "bg-brand font-semibold text-white"
                  : "text-gray-600 hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {initial.brands.length > 0 && (
            <>
              <Select
                label="Brand"
                value={filters.brand}
                onChange={(brand) => applyFilters({ ...filters, brand })}
                options={[{ value: "all", label: "All brands" }, ...initial.brands.map((b) => ({ value: b, label: b }))]}
              />
              <Select
                label="Story type"
                value={filters.kind}
                onChange={(kind) => applyFilters({ ...filters, kind })}
                options={(Object.keys(kindLabels) as KindFilter[]).map((k) => ({ value: k, label: kindLabels[k] }))}
              />
            </>
          )}
          <Select
            label="Sources"
            value={filters.source}
            onChange={(source) => applyFilters({ ...filters, source })}
            options={(Object.keys(sourceLabels) as SourceFilter[]).map((k) => ({ value: k, label: sourceLabels[k] }))}
          />
          {/* Full list; the buttons are just the common shortcuts. */}
          <Select
            label="Filter news"
            value={filters.category}
            onChange={(category) => applyFilters({ ...filters, category })}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load news: {error}
        </p>
      )}

      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : undefined}>
        {items.length > 0 ? (
          <div className="space-y-3">
            {items.map((a) => (
              <ArticleRow
                key={a.id ?? `${a.brand ?? ""}|${a.title}`}
                article={a}
                onDismiss={isAdmin && live ? (article) => void dismiss(article) : undefined}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line py-16 text-center text-[0.9375rem] text-gray-500">
            {pending
              ? "Loading…"
              : filtered
                ? "No stories match these filters."
                : "Click refresh to fetch latest News"}
          </p>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex flex-col items-center gap-2 pb-4">
          <p className="text-sm text-gray-500" aria-live="polite">
            Showing {items.length} of {total} {total === 1 ? "story" : "stories"}
          </p>
          {more && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore || pending}
              className="flex items-center gap-2 rounded-lg border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
