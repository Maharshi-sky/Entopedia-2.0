"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backendLogin, backendUrl } from "./backend";
import { decodeJwt, verifyJwt } from "./jwt";
import { DEMO_SESSION, REMEMBER_SECONDS, SESSION_COOKIE, safeNext } from "./session";
import { clientHeaders, userApi } from "./user-api";

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

  const result = await backendLogin(email, password, await clientHeaders());
  if (!result.ok) {
    const error =
      result.status === 401
        ? "Incorrect email or password."
        : result.status === 403
          ? "This account is disabled. Contact your administrator."
          : `Sign-in failed (status ${result.status}: ${result.error || "unreachable"} — target: ${backendUrl()})`;
    return { error, email };
  }

  // ── NEW ──
  // Every page checks the session with ENTOPEDIA_JWT_SECRET. If that is not the backend's JWT_SECRET, the
  // token looks forged and each page sends the user back here without a word, so stop and say why.
  const secret = process.env.ENTOPEDIA_JWT_SECRET;
  if (!secret || !verifyJwt(result.token, secret)) {
    console.error("Sign-in: the API token does not verify with ENTOPEDIA_JWT_SECRET; set it to the backend's JWT_SECRET.");
    return {
      error: "Signed in at the API, but this app cannot verify the session. ENTOPEDIA_JWT_SECRET (Frontend .env.local) must equal JWT_SECRET (Backend .env); restart the frontend after changing it.",
      email,
    };
  }
  // ── END NEW ──

  const exp = decodeJwt(result.token)?.exp;
  const secondsLeft = exp ? exp - Math.floor(Date.now() / 1000) : REMEMBER_SECONDS;
  store.set(SESSION_COOKIE, result.token, {
    ...base,
    ...(remember ? { maxAge: Math.max(60, Math.min(REMEMBER_SECONDS, secondsLeft)) } : {}),
  });
  redirect(next);
}

export async function signOut(): Promise<void> {
  // Recorded for the Admin page's activity list; signing out works even if the API can't be reached.
  await userApi("auth/logout", { method: "POST", timeoutMs: 5000 }).catch(() => undefined);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}