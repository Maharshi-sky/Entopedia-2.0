import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { DEMO_SESSION, SESSION_COOKIE } from "@/lib/session";

// A news story's picture, fetched by the Entopedia API from the publisher
// (GET /news/:id/image). Pictures load from this site instead of the
// publisher's, so sites that block hot-linking still show them. The generic
// /api/backend proxy reads responses as text, so pictures need this route.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const base = backendUrl();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!UUID.test(id) || !base || !token || token === DEMO_SESSION) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const res = await fetch(`${base}/news/${id}/image`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "image/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      return new NextResponse(null, { status: res.status === 404 ? 404 : 502 });
    }
    return new NextResponse(await res.arrayBuffer(), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
