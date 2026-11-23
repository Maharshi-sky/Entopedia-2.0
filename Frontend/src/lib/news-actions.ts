"use server";

import { cookies } from "next/headers";
import { updateTag } from "next/cache";
import { backendUrl } from "./backend";
import { DEMO_SESSION, SESSION_COOKIE } from "./session";
import { newsQuery, toNewsPage, type NewsFilters, type NewsPage } from "./news-data";

// Server actions for the News page's refresh control (admins only). They call the Entopedia API
// with the signed-in user's own token, so the API's admin check applies.

export type NewsRun = {
  id: number;
  status: "running" | "done" | "failed";
  started_by: "admin" | "schedule" | "cli";
  days: number;
  country: string;
  ai_model: string | null;
  brands: string[];
  found: number | null;
  saved: number | null;
  dropped: number | null;
  with_image: number | null;
  notes: {
    ai?: string;
    /** While running: brands finished, of total, the one in progress and stories saved so far. */
    progress?: { done: number; total: number; current: string | null; saved: number };
  } | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type NewsBrandRow = {
  name: string;
  about: string;
  search_terms: string[];
  company: string | null;
  is_active: boolean;
  stories: number;
  latest: string | null;
};

export type NewsPanelState =
  | { ok: true; run: NewsRun | null; brands: NewsBrandRow[] }
  | { ok: false; error: string };

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const base = backendUrl();
  if (!base) throw new Error("ENTOPEDIA_API_URL is not set.");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token === DEMO_SESSION) throw new Error("Sign in again to manage news.");
  const res = await fetch(`${base}/${path}`, {
    ...init,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

const errorOf = (body: unknown, status: number) =>
  (body as { error?: string })?.error ?? `The API answered ${status}.`;

/** The latest refresh and the tracked brands. */
export async function getNewsPanel(): Promise<NewsPanelState> {
  try {
    const [run, brands] = await Promise.all([
      call<NewsRun | { status: "idle" }>("news/refresh"),
      call<{ data: NewsBrandRow[] }>("news/brands"),
    ]);
    if (run.status !== 200) return { ok: false, error: errorOf(run.body, run.status) };
    if (brands.status !== 200) return { ok: false, error: errorOf(brands.body, brands.status) };
    return {
      ok: true,
      run: "id" in run.body ? run.body : null,
      brands: brands.body.data ?? [],
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Starts a refresh. A refresh that is already running is returned as is. */
export async function startNewsRefresh(options: { days: number; country: string }): Promise<{ ok: true; run: NewsRun } | { ok: false; error: string }> {
  try {
    const qs = new URLSearchParams({ days: String(options.days), country: options.country });
    const res = await call<NewsRun & { error?: string; run?: NewsRun }>(`news/refresh?${qs}`, { method: "POST" });
    if (res.status === 202) return { ok: true, run: res.body };
    if (res.status === 409 && res.body.run) return { ok: true, run: res.body.run };
    return { ok: false, error: errorOf(res.body, res.status) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One page of stories for the News page ("Load more", or a filter change),
 * read with the signed-in user's token.
 */
export async function loadNewsPage(
  filters: NewsFilters,
  offset: number
): Promise<({ ok: true } & NewsPage) | { ok: false; error: string }> {
  // Arguments come from the browser: keep them to known shapes.
  const clean: NewsFilters = {
    category: typeof filters?.category === "string" ? filters.category.slice(0, 60) : undefined,
    brand: typeof filters?.brand === "string" ? filters.brand.slice(0, 120) : undefined,
    kind: filters?.kind === "brand" || filters?.kind === "related" || filters?.kind === "company" ? filters.kind : undefined,
    source: filters?.source === "all" ? "all" : "india",
  };
  const start = Number.isInteger(offset) && offset >= 0 && offset <= 100_000 ? offset : 0;
  try {
    const res = await call<unknown>(newsQuery(clean, start));
    if (res.status !== 200) return { ok: false, error: errorOf(res.body, res.status) };
    return { ok: true, ...toNewsPage(res.body) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** After a refresh: the News page, dashboard news and newsletter show the new stories on the next load. */
export async function showLatestNews(): Promise<void> {
  updateTag("news");
  updateTag("newsFlow");
}

/** An admin marks a story not relevant: it is removed and later refreshes leave it out. */
export async function dismissNews(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown story." };
  try {
    const res = await call<{ error?: string }>(`news/${id}/dismiss`, { method: "POST" });
    if (res.status !== 200) return { ok: false, error: errorOf(res.body, res.status) };
    updateTag("news");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
