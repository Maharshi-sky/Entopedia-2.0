"use server";

import { accessLevels, roles, type AccessLevel } from "@/data/admin";
import { userApi } from "./user-api";

// Admin page writes, made with the signed-in admin's own token: the API checks the role and
// records each change in the activity log.

export type SaveUserInput = {
  name: string;
  role: string;
  active: boolean;
  access: AccessLevel;
  modules: string[];
};

export type SaveUserResult = { ok: true } | { ok: false; error: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function saveUser(id: string, input: SaveUserInput): Promise<SaveUserResult> {
  // Arguments come from the browser: keep them to known shapes before sending them on.
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown user." };
  if (!roles.some((r) => r.value === input?.role)) return { ok: false, error: "Pick a role." };
  if (!accessLevels.some((a) => a.value === input?.access)) return { ok: false, error: "Pick an access level." };
  const name = String(input?.name ?? "").trim();
  if (!name) return { ok: false, error: "Name can't be empty." };
  const modules = Array.isArray(input?.modules) ? input.modules.filter((m) => typeof m === "string").slice(0, 100) : [];

  try {
    await userApi(`admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, role: input.role, is_active: input.active === true }),
    });
    await userApi(`admin/users/${id}/modules`, {
      method: "PUT",
      body: JSON.stringify({ modules, access_level: input.access }),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function setUserActive(id: string, active: boolean): Promise<SaveUserResult> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown user." };
  try {
    await userApi(`admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: active === true }) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
