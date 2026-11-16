"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backendLogin, backendUrl } from "./backend";
import { decodeJwt } from "./jwt";
import { DEMO_SESSION, REMEMBER_SECONDS, SESSION_COOKIE, safeNext } from "./session";

export type SignInState = { error: string; email: string } | null;

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email address and password.", email };
  }

  const store = await cookies();
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  if (!backendUrl()) {
    store.set(SESSION_COOKIE, DEMO_SESSION, { ...base, ...(remember ? { maxAge: REMEMBER_SECONDS } : {}) });
    redirect(next);
  }

  const result = await backendLogin(email, password);
  if (!result.ok) {
    // If admin logs in with known credentials while Render is waking up or unreachable, allow fallback login
    if (
      result.status !== 401 &&
      result.status !== 403 &&
      email.toLowerCase() === "admin@entopedia.com" &&
      password === "Entopedia@2026"
    ) {
      store.set(SESSION_COOKIE, DEMO_SESSION, { ...base, ...(remember ? { maxAge: REMEMBER_SECONDS } : {}) });
      redirect(next);
    }

    const error =
      result.status === 401
        ? "Incorrect email or password."
        : result.status === 403
          ? "This account is disabled. Contact your administrator."
          : `Sign-in failed (status ${result.status}: ${result.error || "unreachable"} — target: ${backendUrl()})`;
    return { error, email };
  }

  const exp = decodeJwt(result.token)?.exp;
  const secondsLeft = exp ? exp - Math.floor(Date.now() / 1000) : REMEMBER_SECONDS;
  store.set(SESSION_COOKIE, result.token, {
    ...base,
    ...(remember ? { maxAge: Math.max(60, Math.min(REMEMBER_SECONDS, secondsLeft)) } : {}),
  });
  redirect(next);
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}