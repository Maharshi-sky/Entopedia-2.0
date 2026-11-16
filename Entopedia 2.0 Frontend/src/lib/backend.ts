import "server-only";
import { decodeJwt } from "./jwt";

// Server-side client for the Entopedia API (the Express backend).
//
//   ENTOPEDIA_API_URL       e.g. https://entopedia-2-0-backend.onrender.com/api
//   ENTOPEDIA_API_EMAIL     service account the server reads data with
//   ENTOPEDIA_API_PASSWORD  (create it with the backend's `npm run db:seed`)
//   ENTOPEDIA_API_KEY       optional: a long-lived JWT to use instead of login

export function backendUrl(): string | null {
  const raw = process.env.ENTOPEDIA_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return null;
  const clean = raw.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean : `${clean}/api`;
}

export class BackendError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "BackendError";
  }
}

type LoginResult =
  | { ok: true; token: string; user: { id: string; email: string; name: string; role: string } }
  | { ok: false; status: number; error: string };

/** POST /auth/login. Network failures come back as status 0. */
export async function backendLogin(email: string, password: string): Promise<LoginResult> {
  const base = backendUrl();
  if (!base) return { ok: false, status: 0, error: "ENTOPEDIA_API_URL is not set" };
  try {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (!res.ok || !body.token) {
      return { ok: false, status: res.status, error: body.error ?? res.statusText };
    }
    return {
      ok: true,
      token: body.token,
      user: { id: body.id, email: body.email, name: body.name, role: body.role },
    };
  } catch (error) {
    return { ok: false, status: 0, error: (error as Error).message };
  }
}

// The service token is kept in memory and deduplicated via `loginInFlight`
// so concurrent prerender requests only trigger ONE /auth/login call.
let service: { token: string; exp: number } | null = null;
let loginInFlight: Promise<string> | null = null;

async function serviceToken(forceRefresh = false): Promise<string> {
  const staticKey = process.env.ENTOPEDIA_API_KEY;
  if (staticKey) return staticKey;

  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && service && service.exp - 60 > now) return service.token;

  if (!forceRefresh && loginInFlight) return loginInFlight;

  loginInFlight = (async () => {
    try {
      const email = process.env.ENTOPEDIA_API_EMAIL || "admin@entopedia.com";
      const password = process.env.ENTOPEDIA_API_PASSWORD || "Entopedia@2026";

      const login = await backendLogin(email, password);
      if (!login.ok) {
        throw new BackendError(
          `Entopedia API: service account sign-in failed (${login.status || "network"}: ${login.error})`,
          login.status
        );
      }
      service = { token: login.token, exp: decodeJwt(login.token)?.exp ?? now + 3600 };
      return service.token;
    } finally {
      loginInFlight = null;
    }
  })();

  return loginInFlight;
}

/** GET {ENTOPEDIA_API_URL}/{path} as the service account, parsed as JSON. */
export async function backendGet<T = unknown>(path: string): Promise<T> {
  const base = backendUrl();
  if (!base) throw new BackendError("ENTOPEDIA_API_URL is not set");
  const url = `${base}/${path.replace(/^\/+/, "")}`;

  const request = async (token: string) =>
    fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });

  let res = await request(await serviceToken());
  if (res.status === 401 && !process.env.ENTOPEDIA_API_KEY) {
    res = await request(await serviceToken(true));
  }
  if (!res.ok) {
    const hint =
      res.status === 403
        ? " (the service account needs the admin role for admin and audit data)"
        : "";
    throw new BackendError(
      `Entopedia API: GET ${url} failed with ${res.status} ${res.statusText}${hint}`,
      res.status
    );
  }
  return (await res.json()) as T;
}