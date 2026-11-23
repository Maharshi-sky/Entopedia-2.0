// The one data store. Every key here is an API resource: with no API configured
// the app serves these samples; with ENTOPEDIA_API_URL set, src/lib/api.ts
// fetches GET {ENTOPEDIA_API_URL}/{path} instead and expects the same shape.

import { auditLog } from "./audit";
import {
  competitorProfiles,
  launchSignals,
  papers,
  patents,
  products,
  strategicFilings,
  whiteSpace,
} from "./competitors";
import { metrics, momentum, newsFlow, signals } from "./dashboard";
import { deals, investorProfiles } from "./deals";
import { articles } from "./news";
import { approvalChat } from "./newsletter";
import { pests } from "./pests";
import { actives, registrations } from "./regulatory";

export const store = {
  dashboardMetrics: metrics,
  competitorMomentum: momentum,
  newsFlow,
  signals,
  news: articles,
  competitorProfiles,
  launchSignals,
  strategicFilings,
  whiteSpace,
  patents,
  papers,
  products,
  actives,
  registrations,
  deals,
  investors: investorProfiles,
  pests,
  approvalChat,
  auditLog,
};

export type Store = typeof store;
export type Resource = keyof Store;

// The URL path each resource is served from, relative to ENTOPEDIA_API_URL.
export const resourcePaths: Record<Resource, string> = {
  dashboardMetrics: "dashboard-metrics",
  competitorMomentum: "competitor-momentum",
  newsFlow: "news-flow",
  signals: "signals",
  news: "news",
  competitorProfiles: "competitor-profiles",
  launchSignals: "launch-signals",
  strategicFilings: "strategic-filings",
  whiteSpace: "white-space",
  patents: "patents",
  papers: "papers",
  products: "products",
  actives: "actives",
  registrations: "registrations",
  deals: "deals",
  investors: "investors",
  pests: "pests",
  approvalChat: "newsletter/approval-chat",
  auditLog: "audit-log",
};
