import { backendUrl } from "./api-base";
import type { ModuleAccess } from "./modules";

// The signed-in user's module access (GET /user/modules), cached per session token: the proxy checks it
// on every page load. Not server-only, because the proxy uses it; never imported by client components.
//
//  - A fresh answer is reused for FRESH_MS, so an admin's change reaches the user within that time.
//  - Several checks at once (page, sidebar, visit tracking) share one request.
//  - If the API is slow or down (e.g. the local AI is using the whole CPU), the last known answer for
//    this session is used instead of locking the page. Only a session never checked is locked.
//  - If the API says the session is no longer valid (401/403), nothing cached is used.

const FRESH_MS = 120_000;
const TIMEOUT_MS = 10_000;
const MAX_ENTRIES = 500;

type Entry = { at: number; access: ModuleAccess };
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<ModuleAccess | null>>();

async function ask(token: string): Promise<ModuleAccess | null> {
  const base = backendUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/user/modules`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      // Signed out, deactivated or removed: forget what was known.
      cache.delete(token);
      return {};
    }
    if (!res.ok) return cache.get(token)?.access ?? null;
    const body = (await res.json()) as { modules?: ModuleAccess };
    const access = body.modules ?? {};
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(token, { at: Date.now(), access });
    return access;
  } catch {
    // Timed out or unreachable: the last known answer, if there is one.
    return cache.get(token)?.access ?? null;
  }
}

/** The user's {slug: level}; null only when the API can't be asked and nothing is known for this session. */
export async function fetchModuleAccess(token: string): Promise<ModuleAccess | null> {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.access;

  const pending = inFlight.get(token);
  if (pending) return pending;
  const request = ask(token).finally(() => inFlight.delete(token));
  inFlight.set(token, request);
  return request;
}
