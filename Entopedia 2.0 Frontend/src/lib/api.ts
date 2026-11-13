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
  whiteSpace: { path: "patent/white-space?full=1", adapt: adapt.toWhiteSpace },
  patents: { path: "patent?limit=200", adapt: adapt.toPatents },
  actives: { path: "regulatory/actives?limit=500", adapt: adapt.toActives },
  claimsEvidence: { path: "claim/evidence-matrix", adapt: adapt.toClaimsEvidence },
  pests: { path: "pest-vision/pests", adapt: adapt.toPests },
  adminKpis: { path: "admin/usage-metrics?period=30d", adapt: adapt.toAdminKpis },
  users: { path: "admin/users?limit=200", adapt: adapt.toUsers },
  moduleUsage: { path: "admin/usage-metrics?period=30d", adapt: adapt.toModuleUsage },
  auditLog: { path: "audit/ai-queries?limit=100", adapt: adapt.toAuditLog },
};

/** Where a resource's data comes from right now. */
export function dataSource(resource: Resource): "api" | "sample" {
  return backendUrl() && connected[resource] ? "api" : "sample";
}

async function load<K extends Resource>(resource: K): Promise<Store[K]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(resource);

  const connection = connected[resource] as Connection<K> | undefined;
  if (!backendUrl() || !connection) return store[resource];
  return connection.adapt(await backendGet(connection.path));
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
  claimsEvidence: () => load("claimsEvidence"),
  knowledgeQueue: () => load("knowledgeQueue"),
  knowledgeAssets: () => load("knowledgeAssets"),
  knowledgeQuestions: () => load("knowledgeQuestions"),
  pests: () => load("pests"),
  approvalChat: () => load("approvalChat"),
  adminKpis: () => load("adminKpis"),
  users: () => load("users"),
  moduleUsage: () => load("moduleUsage"),
  auditLog: () => load("auditLog"),
};
