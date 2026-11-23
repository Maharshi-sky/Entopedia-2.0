"use server";

import type { NotificationPrefs } from "./profile";
import { userApi } from "./user-api";

// The signed-in user's own account: shown in Settings and the sidebar, changed from Settings.

type Result = { ok: true } | { ok: false; error: string };
const fail = (error: unknown): Result => ({ ok: false, error: error instanceof Error ? error.message : String(error) });

/** Name, email and role for the sidebar's profile row; null when not signed in to the API. */
export async function getMe(): Promise<{ name: string; email: string; role: string } | null> {
  try {
    const p = await userApi<{ name?: string; email?: string; role?: string }>("user/profile", { timeoutMs: 8000 });
    return { name: p.name ?? "", email: p.email ?? "", role: p.role ?? "" };
  } catch {
    return null;
  }
}

export async function updateName(name: string): Promise<Result> {
  const clean = String(name ?? "").trim();
  if (!clean || clean.length > 255) return { ok: false, error: "Name must be 1 to 255 characters." };
  try {
    await userApi("user/profile", { method: "PUT", body: JSON.stringify({ name: clean }) });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function changePassword(current: string, next: string): Promise<Result> {
  if (typeof current !== "string" || typeof next !== "string") return { ok: false, error: "Fill in both passwords." };
  try {
    await userApi("user/password", {
      method: "POST",
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveNotifications(prefs: NotificationPrefs): Promise<Result> {
  const clean = Object.fromEntries(
    (["email", "push", "digest", "regulatory"] as const).map((k) => [k, prefs?.[k] === true]),
  );
  try {
    await userApi("user/notification-preferences", { method: "POST", body: JSON.stringify({ preferences: clean }) });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
