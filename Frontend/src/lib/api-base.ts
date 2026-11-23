// The Entopedia API's base URL. Kept apart from backend.ts (which is server-only) so the proxy can use it.
export function backendUrl(): string | null {
  const raw =
    process.env.ENTOPEDIA_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://entopedia-2-0-backend.onrender.com/api";
  const clean = raw.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean : `${clean}/api`;
}
