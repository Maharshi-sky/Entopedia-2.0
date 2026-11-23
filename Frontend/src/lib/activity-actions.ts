"use server";

import { cookies } from "next/headers";
import { fetchModuleAccess } from "./module-access";
import { moduleForPath, type ModuleAccess } from "./modules";
import { DEMO_SESSION, SESSION_COOKIE } from "./session";
import { userApi } from "./user-api";

/** Records that the signed-in user opened a module page. Best effort: never throws. */
export async function recordVisit(pathname: string): Promise<void> {
  if (typeof pathname !== "string") return;
  const slug = moduleForPath(pathname);
  if (!slug) return;
  try {
    await userApi("user/visit", { method: "POST", body: JSON.stringify({ module: slug }), timeoutMs: 5000 });
  } catch {
    // Activity is not worth an error on the page.
  }
}

/** The signed-in user's module access, for the sidebar's locks. null = unknown (show nothing locked). */
export async function getMyModules(): Promise<ModuleAccess | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token === DEMO_SESSION) return null;
  return fetchModuleAccess(token);
}
