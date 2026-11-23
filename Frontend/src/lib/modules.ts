// Which module each page belongs to (modules.slug in the database). Used to lock pages and sidebar
// items the user has no access to, and to record module visits. Pages not listed (Settings, the
// locked page) belong to no module and are open to every signed-in user.

export const MODULE_BY_PATH: Record<string, string> = {
  "/": "dashboard",
  "/competitor-intelligence": "competitor-intelligence",
  "/patent-sheet-analyser": "patent-analyser",
  "/regulatory-actives": "regulatory-actives",
  "/news": "news",
  "/deals-investments": "deals-investments",
  "/claim-studio": "claim-studio",
  "/knowledge-hub": "knowledge-hub",
  "/pest-vision": "pest-vision",
  "/newsletter": "newsletter",
  "/deliverables": "deliverables",
  "/admin": "admin",
  "/audit": "audit",
};

export const MODULE_NAMES: Record<string, string> = {
  dashboard: "Dashboard",
  "competitor-intelligence": "Competitor Intelligence",
  "patent-analyser": "Patent Sheet Analyser",
  "regulatory-actives": "Regulatory & Actives",
  news: "News",
  "deals-investments": "Deals & Investments",
  "claim-studio": "Claim Studio AI",
  "knowledge-hub": "Knowledge Hub",
  "pest-vision": "Pest Vision",
  newsletter: "Newsletter",
  deliverables: "Deliverables",
  admin: "Admin",
  audit: "Audit & Provenance",
};

/** The module a path belongs to ("/news/123" → "news"), or null. */
export function moduleForPath(pathname: string): string | null {
  const top = pathname === "/" ? "/" : `/${pathname.split("/")[1] ?? ""}`;
  return MODULE_BY_PATH[top] ?? null;
}

/** {slug: access level}, as GET /user/modules returns it. */
export type ModuleAccess = Record<string, string>;
