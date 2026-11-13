"use client";

import { useActionState, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { signIn, type SignInState } from "@/lib/auth-actions";

const inputClass =
  "w-full rounded-lg border border-line bg-white py-2.5 pr-3 pl-9 text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-gray-400 focus:border-brand focus:ring-2 focus:ring-brand/15";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, null);
  // Page to return to after signing in, read at submit time; the action only
  // accepts same-site paths.
  function rememberNext(event: FormEvent<HTMLFormElement>) {
    const field = event.currentTarget.elements.namedItem("next") as HTMLInputElement | null;
    if (field) field.value = new URLSearchParams(window.location.search).get("next") ?? "/";
  }

  return (
    <form action={formAction} onSubmit={rememberNext} className="mt-6 space-y-4">
      <input type="hidden" name="next" defaultValue="/" />
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[0.875rem] text-red-700"
        >
          {state.error}
        </p>
      )}
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-[0.9375rem] font-semibold text-ink"
        >
          Email address
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state?.email}
            placeholder="Enter your email address"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label
            htmlFor="password"
            className="text-[0.9375rem] font-semibold text-ink"
          >
            Password
          </label>
          <a
            href="#"
            className="text-[0.9375rem] font-semibold text-brand hover:underline"
          >
            Forgot password?
          </a>
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 transition-colors hover:text-ink"
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </div>

      <label className="flex w-fit items-center gap-2 text-[0.9375rem] text-ink">
        <input
          type="checkbox"
          name="remember"
          className="size-4 rounded border-line accent-brand"
        />
        Remember me
      </label>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Signing in…" : "Sign in"}
        {!pending && <ArrowRight className="size-4" />}
      </button>
    </form>
  );
}
