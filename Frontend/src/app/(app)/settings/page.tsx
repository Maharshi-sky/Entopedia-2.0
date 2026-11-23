import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import type { NotificationPrefs, Profile } from "@/lib/profile";
import { userApi } from "@/lib/user-api";

export const metadata: Metadata = {
  title: "Settings · Entopedia",
};

type RawProfile = {
  name?: string;
  email?: string;
  role?: string;
  created_at?: string | null;
  last_login_at?: string | null;
  notifications?: NotificationPrefs;
  modules?: Record<string, string>;
};

// The signed-in user's own account, read per request with their session, so it streams in under <Suspense>.
async function SettingsContent() {
  const result = await userApi<RawProfile>("user/profile").then(
    (p): { ok: true; profile: Profile } => ({
      ok: true,
      profile: {
        name: p.name ?? "",
        email: p.email ?? "",
        role: p.role ?? "",
        createdAt: p.created_at ?? null,
        lastLogin: p.last_login_at ?? null,
        notifications: p.notifications ?? { email: true, push: true, digest: true, regulatory: true },
        modules: p.modules ?? {},
      },
    }),
    (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
  );
  if (!result.ok) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Couldn&apos;t load your account from the API: {result.error}
      </p>
    );
  }
  return <SettingsPanel profile={result.profile} />;
}

export default function SettingsPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your profile, notifications, and security
        </p>
      </div>
      <Suspense
        fallback={<p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-sm text-gray-500">Loading your account…</p>}
      >
        <SettingsContent />
      </Suspense>
    </>
  );
}
