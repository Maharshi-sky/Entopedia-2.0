// Session constants shared by the proxy and the sign-in / sign-out actions.
//
// With ENTOPEDIA_API_URL set, the cookie holds the JWT the Entopedia API issued
// at sign-in. It is httpOnly, so page scripts cannot read or forge it, and the
// proxy verifies its signature and expiry on every request (src/lib/jwt.ts).
// Without ENTOPEDIA_API_URL the app runs on sample data and the cookie is only
// a demo marker, as before.
export const SESSION_COOKIE = "entopedia_session";
export const DEMO_SESSION = "demo";

// "Remember me" keeps the cookie for up to 30 days (never past the token's own
// expiry); otherwise it ends with the browser session.
export const REMEMBER_SECONDS = 60 * 60 * 24 * 30;

// Pages limited to certain API roles. Mirrors the API's own checks on
// /api/admin (admin) and /api/audit (admin, regulatory_specialist).
export const ROLE_GATES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/audit", roles: ["admin", "regulatory_specialist"] },
];

export function roleAllows(pathname: string, role: string): boolean {
  const gate = ROLE_GATES.find((g) => pathname === g.prefix || pathname.startsWith(`${g.prefix}/`));
  return !gate || gate.roles.includes(role);
}

// Only same-site paths, never "//host" or a full URL.
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
