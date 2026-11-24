"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, RotateCcw } from "lucide-react";
import { MODULE_BY_PATH, MODULE_NAMES } from "@/lib/modules";

const RETRY_SECONDS = 4;
/** An automatic retry within this long ago means the API is still struggling: wait for the button instead. */
const RECENT_RETRY_MS = 30_000;

export function LockedNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = params.get("module") ?? "";
  const name = MODULE_NAMES[slug] ?? "this module";
  const unavailable = params.get("reason") === "unavailable";
  // Where the module lives, to go back there once the API answers again.
  const path = Object.entries(MODULE_BY_PATH).find(([, s]) => s === slug)?.[0] ?? "/";

  // The API didn't answer (usually busy for a moment): try the page again by itself, but only once in a
  // while, so a longer outage doesn't turn into a retry every few seconds.
  const [countdown, setCountdown] = useState(unavailable ? RETRY_SECONDS : 0);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!unavailable || countdown <= 0) return;
    const timer = window.setTimeout(() => {
      if (countdown === 1) {
        const key = `entopedia:locked-retry:${slug}`;
        let recent = false;
        try {
          recent = Date.now() - Number(sessionStorage.getItem(key) ?? 0) < RECENT_RETRY_MS;
          if (!recent) sessionStorage.setItem(key, String(Date.now()));
        } catch {
          // Storage unavailable: retry anyway; the countdown still runs only once per visit.
        }
        if (recent) setGaveUp(true);
        else router.replace(path);
      }
      setCountdown((c) => c - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [unavailable, countdown, path, router, slug]);

  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-2xl border border-line bg-white px-8 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-gray-100 text-gray-500">
        <Lock className="size-5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-ink">
        {unavailable ? `Couldn't open ${name} just now` : `You don't have access to ${name}`}
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        {unavailable
          ? "The Entopedia API was too busy to confirm your access."
          : "Ask an administrator to give you access on the Admin page."}
      </p>
      {unavailable ? (
        <>
          <button
            type="button"
            onClick={() => router.replace(path)}
            className="mt-6 flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
          >
            <RotateCcw className="size-4" /> Try again
          </button>
          {countdown > 0 && !gaveUp && <p className="mt-2 text-xs text-gray-500">Trying again in {countdown}s…</p>}
          {gaveUp && <p className="mt-2 text-xs text-gray-500">Still busy. Try again in a moment.</p>}
        </>
      ) : (
        <Link
          href="/settings"
          className="mt-6 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
        >
          Go to settings
        </Link>
      )}
    </div>
  );
}
