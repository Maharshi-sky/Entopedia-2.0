import { cacheLife, cacheTag } from "next/cache";
import { store, type Resource, type Store } from "@/data";
import { backendGet, backendUrl } from "./backend";
import * as adapt from "./adapters";

// The single data-access layer. Pages (server components) call these; client
// components only ever receive the results as props.
//
// - ENTOPEDIA_API_URL unset → every resource returns the sample data in src/data.
// - ENTOPEDIA_API_URL set   → resources listed in `connected` are read from the
//   Entopedia API (as the service account, see src/lib/backend.ts) and turned
//   into the sample's shape by src/lib/adapters.ts. The rest have no API
//   endpoint yet and keep returning sample data (see `dataSource`).
//
// Results are cached for a few minutes per resource; call
// revalidateTag("<resource>") after a write to refresh one early.

type Connection<K extends Resource> = { path: string; adapt: (raw: unknown) => Store[K] };
type Connected = { [K in Resource]?: Connection<K> };

const connected: Connected = {
  dashboardMetrics: { path: "dashboard/kpis?range=30d", adapt: adapt.toMetrics },
  competitorMomentum: { path: "dashboard/launch-momentum", adapt: adapt.toMomentum },
  newsFlow: { path: "dashboard/news-flow?granularity=month&months=6", adapt: adapt.toNewsFlow },
  signals: { path: "dashboard/alerts", adapt: adapt.toSignals },
  news: { path: "news?limit=100", adapt: adapt.toArticles },
  competitorProfiles: { path: "competitor?limit=100", adapt: adapt.toCompetitorProfiles },
  products: { path: "competitor/products", adapt: adapt.toProducts },
  whiteSpace: { path: "patent/white-space?full=1", adapt: adapt.toWhiteSpace },
  patents: { path: "patent?limit=200", adapt: adapt.toPatents },
  actives: { path: "regulatory/actives?limit=500", adapt: adapt.toActives },
  pests: { path: "pest-vision/pests", adapt: adapt.toPests },
  auditLog: { path: "audit/ai-queries?limit=100", adapt: adapt.toAuditLog },
};

/** Where a resource's data comes from right now. */
export function dataSource(resource: Resource): "api" | "sample" {
  return backendUrl() && connected[resource] ? "api" : "sample";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`API request timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function load<K extends Resource>(resource: K): Promise<Store[K]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(resource);

  const connection = connected[resource] as Connection<K> | undefined;
  if (!backendUrl() || !connection) return store[resource];

  try {
    const raw = await withTimeout(backendGet(connection.path), 8000);
    return connection.adapt(raw);
  } catch (err) {
    console.warn(
      `[api.load] Falling back to static store for "${resource}":`,
      err instanceof Error ? err.message : err
    );
    return store[resource];
  }
}

export const api = {
  dashboardMetrics: () => load("dashboardMetrics"),
  competitorMomentum: () => load("competitorMomentum"),
  newsFlow: () => load("newsFlow"),
  signals: () => load("signals"),
  news: () => load("news"),
  competitorProfiles: () => load("competitorProfiles"),
  launchSignals: () => load("launchSignals"),
  strategicFilings: () => load("strategicFilings"),
  whiteSpace: () => load("whiteSpace"),
  patents: () => load("patents"),
  papers: () => load("papers"),
  products: () => load("products"),
  actives: () => load("actives"),
  registrations: () => load("registrations"),
  deals: () => load("deals"),
  investors: () => load("investors"),
  pests: () => load("pests"),
  approvalChat: () => load("approvalChat"),
  auditLog: () => load("auditLog"),
};