// Admin: usage KPIs, users and module usage.

// Every module in the sidebar, in its order.
export const allModules = [
  "Dashboard",
  "Competitor Intelligence",
  "Patent Sheet Analyser",
  "Regulatory & Actives",
  "News",
  "Deals & Investments",
  "Claim Studio AI",
  "Claims Evidence",
  "Knowledge Hub",
  "Pest Vision",
  "Newsletter",
  "Deliverables",
  "Admin",
  "Audit & Provenance",
];

// API resource: GET /admin/kpis → AdminKpi[]
export type AdminKpi = { label: string; value: string; suffix?: string };

export const adminKpis: AdminKpi[] = [
  { label: "Active Users", value: "5" },
  { label: "Queries (30d)", value: "1,284" },
  { label: "Modules Active", value: "12" },
  { label: "Avg Session", value: "18", suffix: " min" },
];

// API resource: GET /admin/users → User[]
export const accessLevels = ["Full", "Standard", "Read-only", "Admin (sys)"] as const;
export type Access = (typeof accessLevels)[number];

export type User = {
  name: string;
  email: string;
  role: string;
  access: Access;
  modules: string[];
  active: boolean;
};

export const users: User[] = [
  { name: "Rahul Mehta", email: "rahul.mehta@skyquest.com", role: "Admin", access: "Full", modules: allModules, active: true },
  { name: "Sarah Chen", email: "sarah.chen@skyquest.com", role: "R&D Lead", access: "Standard", modules: ["Competitor Intelligence", "Patent Sheet Analyser", "Claim Studio AI", "Knowledge Hub", "Pest Vision"], active: true },
  { name: "James Osei", email: "james.osei@skyquest.com", role: "Regulatory", access: "Standard", modules: ["Regulatory & Actives", "Claim Studio AI", "Claims Evidence"], active: true },
  { name: "Priya Sharma", email: "priya.sharma@skyquest.com", role: "Marketing", access: "Read-only", modules: ["Dashboard", "News", "Newsletter", "Deliverables"], active: true },
  { name: "Tom Bradley", email: "tom.bradley@skyquest.com", role: "IT", access: "Admin (sys)", modules: ["Admin", "Audit & Provenance"], active: false },
];

// API resource: GET /admin/module-usage → ModuleUsage[]
// Share of active users who opened each module in the last 30 days.
export type ModuleUsage = { module: string; pct: number };

export const moduleUsage: ModuleUsage[] = [
  { module: "Dashboard", pct: 100 },
  { module: "Competitor Intelligence", pct: 87 },
  { module: "Claim Studio", pct: 74 },
  { module: "PestLens", pct: 61 },
  { module: "Regulatory", pct: 55 },
  { module: "PLM / LIMS", pct: 42 },
  { module: "News", pct: 38 },
];
