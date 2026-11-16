import { NextResponse, type NextRequest } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { DEMO_SESSION, SESSION_COOKIE, roleAllows } from "@/lib/session";

// Sends signed-out visitors to /login (remembering where they were going),
// sends signed-in visitors away from /login, and keeps /admin and /audit to the
// roles the API allows there.
//
// With ENTOPEDIA_API_URL set, the session cookie is the API's JWT and must
// verify against ENTOPEDIA_JWT_SECRET (the backend's JWT_SECRET). A cookie
// that is missing, forged or expired counts as signed out.

let warnedNoSecret = false;

function readSession(token: string | undefined): { role: string } | null {
  if (!token) return null;
  if (!process.env.ENTOPEDIA_API_URL) {
    // Sample-data mode: any session cookie signs in, with full access (previous behaviour).
    return { role: "admin" };
  }
  if (token === DEMO_SESSION) return null;
  const secret = process.env.ENTOPEDIA_JWT_SECRET;
  if (!secret) {
    if (!warnedNoSecret) {
      console.error("ENTOPEDIA_JWT_SECRET is not set, so no session can be verified. Set it to the backend's JWT_SECRET.");
      warnedNoSecret = true;
    }
    return null;
  }
  const claims = verifyJwt(token, secret);
  return claims ? { role: claims.role } : null;
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = readSession(token);
  const { pathname, search } = request.nextUrl;
  const onLogin = pathname === "/login";

  if (!session && !onLogin) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    const response = NextResponse.redirect(url);
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  if (!session && onLogin && token) {
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  if (session && onLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (session && !roleAllows(pathname, session.role)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip Next.js internals and any file with an extension (images, favicon).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
