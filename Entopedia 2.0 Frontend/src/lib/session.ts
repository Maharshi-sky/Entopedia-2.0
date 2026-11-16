export const SESSION_COOKIE = "entopedia_session";
export const DEMO_SESSION = "demo";
export const REMEMBER_SECONDS = 60 * 60 * 24 * 30;

export const ROLE_GATES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/audit", roles: ["admin", "regulatory_specialist"] },
];

export function roleAllows(pathname: string, role: string): boolean {
  const gate = ROLE_GATES.find((g) => pathname === g.prefix || pathname.startsWith(${g.prefix}/));
  return !gate || gate.roles.includes(role);
}

export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
