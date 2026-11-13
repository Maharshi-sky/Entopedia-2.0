"use client";

import { useState, type FormEvent } from "react";
import { LogOut, Shield } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { signOut } from "@/lib/auth-actions";

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand";

const labelClass = "mb-1.5 block text-[0.9375rem] text-ink";

const sectionTitle = "text-lg font-medium text-ink";

const notificationOptions = [
  { id: "email", label: "Email Notifications", hint: "Receive updates via email" },
  { id: "push", label: "Push Notifications", hint: "Browser push notifications" },
  { id: "digest", label: "Weekly Digest", hint: "Weekly summary digest" },
  { id: "regulatory", label: "Regulatory Alerts", hint: "Urgent compliance alerts" },
] as const;

type NotificationId = (typeof notificationOptions)[number]["id"];

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-lg transition-colors ${
        checked ? "bg-brand" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-1 left-1 size-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

function Profile() {
  const [name, setName] = useState("demo123");
  const [status, setStatus] = useState<string | null>(null);

  // No account service yet: keep the edits on screen, but send nothing.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("The account service isn't connected yet, so these changes weren't saved.");
  }

  const display = name.trim() || "User";

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <h2 className={sectionTitle}>Profile</h2>
        <div className="mt-1 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-lg font-semibold text-white">
            {display[0].toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-semibold text-ink capitalize">
              {display}
            </p>
            <p className="text-xs text-gray-500">Skyquest Team</p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
          <div>
            <label htmlFor="set-name" className={labelClass}>
              Display Name
            </label>
            <input
              id="set-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="set-role" className={labelClass}>
              Role
            </label>
            <input
              id="set-role"
              defaultValue="Product Intelligence Analyst"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="set-email" className={labelClass}>
              Email
            </label>
            <input
              id="set-email"
              type="email"
              defaultValue="demo123@skyquest.com"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="set-team" className={labelClass}>
              Team
            </label>
            <input id="set-team" defaultValue="Entopedia / Skyquest" className={inputClass} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90"
          >
            Save Changes
          </button>
          {status && <p className="text-xs text-gray-500">{status}</p>}
        </div>
      </form>
    </Card>
  );
}

function Notifications() {
  const [enabled, setEnabled] = useState<Record<NotificationId, boolean>>({
    email: true,
    push: true,
    digest: true,
    regulatory: true,
  });

  return (
    <Card>
      <h2 className={sectionTitle}>Notifications</h2>
      <ul className="mt-3 divide-y divide-line">
        {notificationOptions.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-[0.9375rem] text-ink">{o.label}</p>
              <p className="text-xs text-gray-500">{o.hint}</p>
            </div>
            <Toggle
              label={o.label}
              checked={enabled[o.id]}
              onChange={(v) => setEnabled((prev) => ({ ...prev, [o.id]: v }))}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Security() {
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = String(data.get("current") ?? "");
    const next = String(data.get("next") ?? "");
    if (next.length < 8) {
      setStatus({ text: "The new password needs at least 8 characters.", error: true });
      return;
    }
    if (next === current) {
      setStatus({ text: "The new password must differ from the current one.", error: true });
      return;
    }
    event.currentTarget.reset();
    setStatus({
      text: "The account service isn't connected yet, so your password wasn't changed.",
      error: false,
    });
  }

  return (
    <Card>
      <h2 className={sectionTitle}>Security</h2>
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-[#f5f6f5] px-4 py-3.5">
        <Shield className="size-6 shrink-0 text-amber-500" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] text-ink">Two-Factor Authentication</p>
          <p className="text-xs text-gray-500">Authenticator app enabled</p>
        </div>
        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.8125rem] text-amber-600">
          Active
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <p className="text-[0.9375rem] text-ink">Change Password</p>
        <input
          name="current"
          type="password"
          required
          autoComplete="current-password"
          aria-label="Current password"
          placeholder="Current password"
          className={inputClass}
        />
        <input
          name="next"
          type="password"
          required
          autoComplete="new-password"
          aria-label="New password"
          placeholder="New password"
          className={inputClass}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-lg border border-line bg-brand-soft px-4 py-2 text-[0.9375rem] text-brand transition-colors hover:bg-brand hover:text-white"
          >
            Update Password
          </button>
          {status && (
            <p className={`text-xs ${status.error ? "text-red-600" : "text-gray-500"}`}>
              {status.text}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

export function SettingsPanel() {
  return (
    <>
      <Profile />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Notifications />
        <Security />
      </div>
      <Card>
        <h2 className={sectionTitle}>Session</h2>
        <form action={signOut}>
          <button
            type="submit"
            className="mt-1 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[0.9375rem] text-red-600 transition-colors hover:bg-red-100"
          >
            <LogOut className="size-4" strokeWidth={1.75} />
            Sign Out
          </button>
        </form>
      </Card>
    </>
  );
}
