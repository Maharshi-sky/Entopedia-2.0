import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";
import { DEMO_SESSION, SESSION_COOKIE } from "@/lib/session";

// A Knowledge Hub file, passed through byte for byte with the user's own session (the generic
// /api/backend proxy reads responses as text, which would corrupt PDFs and spreadsheets).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const base = backendUrl();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!UUID.test(id) || !base || !token || token === DEMO_SESSION) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const res = await fetch(`${base}/knowledge/documents/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok || !res.body) return new NextResponse(null, { status: res.status === 404 ? 404 : 502 });
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
