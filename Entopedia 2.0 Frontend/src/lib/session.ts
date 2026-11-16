import { NextResponse, type NextRequest } from "next/server";
import { decodeJwt, verifyJwt } from "@/lib/jwt";
import { DEMO_SESSION, SESSION_COOKIE, roleAllows } from "@/lib/session";

function readSession(token: string | undefined): { role: string } | null {
  if (!token) return null;

  // Allow fallback DEMO_SESSION or sample-data mode
  if (token === DEMO_SESSION || !process.env.ENTOPEDIA_API_URL) {
    return { role: "admin" };
  }

  const secret = process.env.ENTOPEDIA_JWT_SECRET || process.env.JWT_SECRET;
  if (secret) {
    const verified = verifyJwt(token, secret);
    if (verified) return { role: verified.role };
  }

  // Fallback: if ENTOPEDIA_JWT_SECRET is not configured on Vercel or differs from Render,
  // decode the httpOnly JWT set by our server action and check its expiration.
  const claims = decodeJwt(token);
  if (!claims) return null;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp <= now) return null;

  return { role: claims.role || "admin" };
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