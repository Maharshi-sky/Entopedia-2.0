// The one data store. Every key here is an API resource: with no API configured
// the app serves these samples; with ENTOPEDIA_API_URL set, src/lib/api.ts
// fetches GET {ENTOPEDIA_API_URL}/{path} instead and expects the same shape.

import { adminKpis, moduleUsage, users } from "./admin";
import { auditLog } from "./audit";
import { claimsEvidence } from "./claims";
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
import { ingestionQueue, savedAssets, suggestedQuestions } from "./knowledge";
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
  claimsEvidence,
  knowledgeQueue: ingestionQueue,
  knowledgeAssets: savedAssets,
  knowledgeQuestions: suggestedQuestions,
  pests,
  approvalChat,
  adminKpis,
  users,
  moduleUsage,
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
  claimsEvidence: "claims-evidence",
  knowledgeQueue: "knowledge/queue",
  knowledgeAssets: "knowledge/assets",
  knowledgeQuestions: "knowledge/suggested-questions",
  pests: "pests",
  approvalChat: "newsletter/approval-chat",
  adminKpis: "admin/kpis",
  users: "admin/users",
  moduleUsage: "admin/module-usage",
  auditLog: "audit-log",
};
