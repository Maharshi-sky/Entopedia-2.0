import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { DEMO_SESSION, SESSION_COOKIE } from "@/lib/session";

const ALLOWED_PREFIXES = [
  "pest-vision",
  "competitor",
  "competitors",
  "patent",
  "patents",
  "regulatory",
  "claim",
  "claims",
  "papers",
  "news",
  "dashboard",
  "ai",
  "knowledge",
];

// Browser calls go to the API as the signed-in user, never as the server's own account: the API then
// applies that user's role and module access. No session means 401, not a fallback login.
async function userToken(): Promise<string | null> {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessionCookie && sessionCookie !== DEMO_SESSION ? sessionCookie : null;
}

async function handleProxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const base = backendUrl(); // Guarantees exact "http://localhost:4000/api" (no double /api)
  if (!base) {
    return NextResponse.json(
      { error: "ENTOPEDIA_API_URL is not configured" },
      { status: 500 },
    );
  }

  const { path } = await context.params;
  const rootPrefix = path[0] || "";

  if (!ALLOWED_PREFIXES.includes(rootPrefix)) {
    return NextResponse.json(
      { error: `Proxy route prefix "${rootPrefix}" is not permitted` },
      { status: 403 },
    );
  }

  const targetPath = path.join("/");
  const search = request.nextUrl.search || "";
  const targetUrl = `${base}/${targetPath}${search}`;

  const token = await userToken();
  if (!token) {
    return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  }
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  const hasBody = !["GET", "HEAD"].includes(request.method.toUpperCase());
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (err) {
    // Details stay in the server log; the browser only learns the API is down.
    console.error(`Backend unreachable at ${targetUrl}:`, err);
    return NextResponse.json(
      { error: "The Entopedia API isn't reachable right now. Check the backend is running, then try again." },
      { status: 502 },
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;