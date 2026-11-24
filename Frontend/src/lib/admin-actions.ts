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
  if (!isUserId(id)) return { ok: false, error: "Unknown user." };
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

const isUserId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

export async function setUserActive(id: string, active: boolean): Promise<SaveUserResult> {
  if (!isUserId(id)) return { ok: false, error: "Unknown user." };
  try {
    await userApi(`admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: active === true }) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: string;
  access: AccessLevel;
  modules: string[];
};

export async function createUser(input: CreateUserInput): Promise<SaveUserResult> {
  const name = String(input?.name ?? "").trim();
  const email = String(input?.email ?? "").trim().toLowerCase();
  const password = String(input?.password ?? "");
  if (!name) return { ok: false, error: "Name can't be empty." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (password.length < 10) return { ok: false, error: "The password needs at least 10 characters." };
  if (!roles.some((r) => r.value === input?.role)) return { ok: false, error: "Pick a role." };
  if (!accessLevels.some((a) => a.value === input?.access)) return { ok: false, error: "Pick an access level." };
  const modules = Array.isArray(input?.modules) ? input.modules.filter((m) => typeof m === "string").slice(0, 100) : [];

  try {
    await userApi("admin/users", {
      method: "POST",
      body: JSON.stringify({ name, email, password, role: input.role, access_level: input.access, modules }),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function removeUser(id: string): Promise<SaveUserResult> {
  if (!isUserId(id)) return { ok: false, error: "Unknown user." };
  try {
    await userApi(`admin/users/${id}`, { method: "DELETE" });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function restoreUser(id: string): Promise<SaveUserResult> {
  if (!isUserId(id)) return { ok: false, error: "Unknown user." };
  try {
    await userApi(`admin/users/${id}/restore`, { method: "POST" });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
