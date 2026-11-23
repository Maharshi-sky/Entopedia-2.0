import "server-only";
import { cookies, headers } from "next/headers";
import { backendUrl } from "./backend";
import { DEMO_SESSION, SESSION_COOKIE } from "./session";

// Calls the Entopedia API as the signed-in user (their own session token), so the API's role checks
// apply and activity is recorded against them. The browser's address and user agent are passed on
// for the activity log.

export class UserApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "UserApiError";
  }
}

/** Address and user agent of the browser making this request, for the API's activity log. */
export async function clientHeaders(): Promise<Record<string, string>> {
  const h = await headers();
  const out: Record<string, string> = {};
  const forwarded = h.get("x-forwarded-for") ?? h.get("x-real-ip");
  if (forwarded) out["X-Forwarded-For"] = forwarded;
  const agent = h.get("user-agent");
  if (agent) out["User-Agent"] = agent;
  return out;
}

export async function userApi<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const base = backendUrl();
  if (!base) throw new UserApiError("ENTOPEDIA_API_URL is not set.", 0);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token === DEMO_SESSION) throw new UserApiError("Sign in again.", 401);

  const res = await fetch(`${base}/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(await clientHeaders()),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(init?.timeoutMs ?? 15000),
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new UserApiError(body.error ?? `The API answered ${res.status}.`, res.status);
  return body as T;
}
