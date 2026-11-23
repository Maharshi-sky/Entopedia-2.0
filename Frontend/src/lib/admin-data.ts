import "server-only";
import type { AccessLevel, ActivityEntry, AdminKpi, AppModule, ModuleUsage, User } from "@/data/admin";
import { userApi } from "./user-api";

// The Admin page's data, read as the signed-in admin. Nothing falls back to sample data: when the
// API can't be read the page says so.

type Row = Record<string, unknown>;
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : v == null ? fallback : String(v));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const list = <T = Row>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const count = (n: number) => n.toLocaleString("en-US");

export type AdminPageData = {
  kpis: AdminKpi[];
  users: User[];
  moduleUsage: ModuleUsage[];
  modules: AppModule[];
  activity: ActivityEntry[];
};

function toAccess(levels: string[]): AccessLevel | null {
  if (levels.includes("full")) return "full";
  if (levels.includes("standard")) return "standard";
  if (levels.includes("read")) return "read";
  return null;
}

export function toUser(u: Row): User {
  return {
    id: str(u.id),
    name: str(u.name),
    email: str(u.email),
    role: str(u.role),
    access: toAccess(list<string>(u.access_levels).map((l) => l.toLowerCase())),
    modules: list<string>(u.modules),
    active: u.is_active !== false,
    lastLogin: u.last_login_at ? str(u.last_login_at) : null,
    lastActive: u.last_active ? str(u.last_active) : null,
  };
}

const ACTIONS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  login_failed: "Failed sign-in",
  module_visit: "Opened",
  ai_query: "AI query",
  "admin.update_user": "Changed user",
  "admin.update_access": "Changed module access",
  "profile.update": "Changed own name",
  password_changed: "Changed password",
  password_change_failed: "Failed password change",
  "knowledge.upload": "Uploaded document",
  "knowledge.delete": "Removed document",
  "news.dismiss": "Marked news not relevant",
};

function describe(action: string, details: Row | null): string {
  if (!details) return "";
  if (action === "login_failed") return `${str(details.email)} · ${str(details.reason)}`;
  if (action === "password_change_failed") return str(details.reason);
  if (action === "knowledge.upload" || action === "knowledge.delete") return str(details.filename);
  if (action === "news.dismiss") return str(details.title);
  if (action === "profile.update") {
    return `name: ${str((details.before as Row | undefined)?.name)} → ${str((details.after as Row | undefined)?.name)}`;
  }
  if (action === "ai_query") return str(details.query);
  if (action === "admin.update_user") {
    const before = (details.before ?? {}) as Row;
    const after = (details.after ?? {}) as Row;
    const parts = Object.keys(after).map((k) => `${k.replace("is_active", "active")}: ${str(before[k])} → ${str(after[k])}`);
    return `${str(details.email)} · ${parts.join(", ")}`;
  }
  if (action === "admin.update_access") {
    const after = (details.after ?? {}) as Row;
    const level = str(Object.values(after)[0], "none");
    return `${str(details.email)} · ${Object.keys(after).length} modules (${level})`;
  }
  return "";
}

export function toActivity(raw: unknown): ActivityEntry[] {
  return list((raw as Row)?.data).map((e) => {
    const action = str(e.action);
    const details = (e.details && typeof e.details === "object" ? e.details : null) as Row | null;
    return {
      id: str(e.id),
      at: str(e.at),
      user: str(e.user_name) || (action === "login_failed" ? "Unknown" : "System"),
      email: str(e.user_email),
      action: ACTIONS[action] ?? action,
      module: e.module ? str(e.module) : null,
      detail: describe(action, details),
      ip: e.ip_address ? str(e.ip_address) : null,
    };
  });
}

export async function loadAdminPage(): Promise<AdminPageData> {
  const [usage, users, modules, activity] = await Promise.all([
    userApi<Row>("admin/usage-metrics?period=30d"),
    userApi<Row>("admin/users?limit=500"),
    userApi<Row>("admin/modules"),
    userApi<Row>("admin/activity?limit=50"),
  ]);
  return {
    kpis: [
      { label: "Active Users (30d)", value: count(num(usage.active_users)) },
      { label: "Sign-ins (30d)", value: count(num(usage.logins)) },
      { label: "AI Queries (30d)", value: count(num(usage.total_queries)) },
      { label: "User Accounts", value: count(num(usage.active_accounts)) },
    ],
    users: list(users.data).map(toUser),
    moduleUsage: list(usage.module_usage).map((m) => ({
      module: str(m.module),
      pct: num(m.pct),
      users: num(m.users),
      visits: num(m.visits),
    })),
    modules: list(modules.modules).map((m) => ({ slug: str(m.slug), name: str(m.name), group: str(m.group) })),
    activity: toActivity(activity),
  };
}
