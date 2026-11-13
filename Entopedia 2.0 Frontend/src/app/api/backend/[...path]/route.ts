import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

const BACKEND_URL = process.env.ENTOPEDIA_API_URL || "http://localhost:4000";

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
];

async function handleProxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const targetPath = path.join("/");

  // Allow-list check
  const rootPrefix = path[0];
  if (!ALLOWED_PREFIXES.includes(rootPrefix)) {
    return NextResponse.json(
      { error: "Forbidden proxy path" },
      { status: 403 }
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  const url = new URL(request.url);
  const backendTarget = `${BACKEND_URL}/api/${targetPath}${url.search}`;

  const headers: Record<string, string> = {};
  if (token && token !== "demo") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      fetchOptions.body = await request.text();
    }

    const res = await fetch(backendTarget, fetchOptions);
    const data = await res.text();

    return new NextResponse(data, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Backend Proxy Error:", error);
    return NextResponse.json(
      { error: "Backend service unreachable" },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;