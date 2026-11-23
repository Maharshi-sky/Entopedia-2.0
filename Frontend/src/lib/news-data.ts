import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Article, NewsKind } from "@/data/news";
import { toArticles } from "./adapters";
import { backendGet, backendUrl } from "./backend";

// The News page reads stories a page at a time: the first page here (cached,
// read as the service account), later pages and filter changes through the
// loadNewsPage server action (src/lib/news-actions.ts).

export const NEWS_PAGE_SIZE = 20;

export type NewsFilters = {
  /** App category, e.g. "Regulatory"; absent = all. */
  category?: string;
  brand?: string;
  /** Absent = about the brand and related; company news only when asked for. */
  kind?: NewsKind;
  /** "india" = Indian outlets only (the default on the News page); "all" = every outlet. */
  source?: "india" | "all";
};

/** What the News page shows before the reader changes anything. */
export const DEFAULT_NEWS_FILTERS: NewsFilters = { source: "india" };

export type NewsPage = {
  articles: Article[];
  /** Stories matching the filters, all pages together. */
  total: number;
};

export type NewsFeedData = NewsPage & {
  /** Brands that have stories, for the brand filter. */
  brands: string[];
  /** false = API unavailable; the page shows no stories and asks for a refresh. */
  live: boolean;
};

export function newsQuery(filters: NewsFilters, offset: number, limit = NEWS_PAGE_SIZE): string {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters.category) qs.set("category", filters.category);
  if (filters.brand) qs.set("brand", filters.brand);
  if (filters.kind) qs.set("kind", filters.kind);
  if (filters.source === "india") qs.set("source", "india");
  return `news?${qs}`;
}

export function toNewsPage(raw: unknown): NewsPage {
  const total = Number((raw as { pagination?: { total?: unknown } })?.pagination?.total);
  const articles = toArticles(raw);
  return { articles, total: Number.isFinite(total) ? total : articles.length };
}

// No API (or it failed): no stories. The page asks for a refresh instead of showing sample stories.
const sample = (): NewsFeedData => ({
  articles: [],
  total: 0,
  brands: [],
  live: false,
});

export async function firstNewsPage(): Promise<NewsFeedData> {
  "use cache";
  cacheLife("minutes");
  cacheTag("news");

  if (!backendUrl()) return sample();
  try {
    const [raw, brands] = await Promise.all([
      backendGet(newsQuery(DEFAULT_NEWS_FILTERS, 0)),
      backendGet<{ data?: Array<{ name?: string; stories?: number }> }>("news/brands"),
    ]);
    return {
      ...toNewsPage(raw),
      brands: (brands.data ?? []).filter((b) => b.name && (b.stories ?? 0) > 0).map((b) => b.name as string),
      live: true,
    };
  } catch (error) {
    console.error("News: falling back to sample stories:", error instanceof Error ? error.message : error);
    return sample();
  }
}
