// Admin: types for the Admin page. All of it comes from the API (src/lib/admin-data.ts);
// there is no sample data, so the page shows what is in the database or an error.

export const roles = [
  { value: "admin", label: "Admin" },
  { value: "marketing", label: "Marketing" },
  { value: "regulatory_specialist", label: "Regulatory" },
] as const;
export type Role = (typeof roles)[number]["value"];

// module_access.access_level values, and how the page names them.
export const accessLevels = [
  { value: "full", label: "Full", hint: "Use the ticked modules, including generating and exporting." },
  { value: "standard", label: "Standard", hint: "Use the ticked modules; no admin settings." },
  { value: "read", label: "Read-only", hint: "View the ticked modules; can't edit, generate or export." },
] as const;
export type AccessLevel = (typeof accessLevels)[number]["value"];

/** A row of the modules table (GET /admin/modules). */
export type AppModule = { slug: string; name: string; group: string };

/** GET /admin/users */
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role | string;
  access: AccessLevel | null;
  /** Module slugs the user can open. */
  modules: string[];
  active: boolean;
  lastLogin: string | null;
  lastActive: string | null;
};

/** GET /admin/users/removed: removed (soft-deleted) users an admin can restore. */
export type RemovedUser = { id: string; name: string; email: string; role: Role | string; removedAt: string | null };

/** GET /admin/usage-metrics */
export type AdminKpi = { label: string; value: string; suffix?: string };
export type ModuleUsage = { module: string; pct: number; users: number; visits: number };

/** GET /admin/activity */
export type ActivityEntry = {
  id: string;
  at: string;
  user: string;
  email: string;
  action: string;
  module: string | null;
  detail: string;
  ip: string | null;
};
