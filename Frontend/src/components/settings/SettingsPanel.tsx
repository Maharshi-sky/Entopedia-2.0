"use client";

import { useState, useTransition, type FormEvent } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { roles } from "@/data/admin";
import { signOut } from "@/lib/auth-actions";
import { MODULE_NAMES } from "@/lib/modules";
import { PROFILE_CHANGED_EVENT, type NotificationPrefs, type Profile } from "@/lib/profile";
import { changePassword, saveNotifications, updateName } from "@/lib/profile-actions";

// The signed-in user's own account, from the database. Name, notifications and password are saved
// through the API; email, role and module access are set by an admin.

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand read-only:bg-[#f5f6f5] read-only:text-gray-600";

const labelClass = "mb-1.5 block text-[0.9375rem] text-ink";

const sectionTitle = "text-lg font-medium text-ink";

const notificationOptions = [
  { id: "email", label: "Email Notifications", hint: "Receive updates via email" },
  { id: "push", label: "Push Notifications", hint: "Browser push notifications" },
  { id: "digest", label: "Weekly Digest", hint: "Weekly summary digest" },
  { id: "regulatory", label: "Regulatory Alerts", hint: "Urgent compliance alerts" },
] as const;

type Status = { text: string; error: boolean } | null;

const roleLabel = (role: string) => roles.find((r) => r.value === role)?.label ?? role;

function formatDate(iso: string | null, withTime = false) {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p role={status.error ? "alert" : "status"} className={`text-xs ${status.error ? "text-red-600" : "text-gray-500"}`}>
      {status.text}
    </p>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-lg transition-colors disabled:opacity-60 ${
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

function ProfileCard({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.name);
  const [savedName, setSavedName] = useState(profile.name);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = name.trim();
    if (next === savedName) {
      setStatus({ text: "Nothing to save.", error: false });
      return;
    }
    startTransition(async () => {
      const result = await updateName(next);
      if (!result.ok) {
        setStatus({ text: result.error, error: true });
        return;
      }
      setSavedName(next);
      setName(next);
      setStatus({ text: "Saved.", error: false });
      window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT, { detail: { name: next } }));
    });
  }

  const display = name.trim() || profile.email || "User";
  const moduleNames = Object.keys(profile.modules)
    .map((slug) => MODULE_NAMES[slug] ?? slug)
    .sort();

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <h2 className={sectionTitle}>Profile</h2>
        <div className="mt-1 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-lg font-semibold text-white">
            {display[0].toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-semibold text-ink">{display}</p>
            <p className="text-xs text-gray-500">
              {roleLabel(profile.role)} · Member since {formatDate(profile.createdAt)}
            </p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
          <div>
            <label htmlFor="set-name" className={labelClass}>
              Display Name
            </label>
            <input
              id="set-name"
              required
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="set-role" className={labelClass}>
              Role
            </label>
            <input id="set-role" readOnly value={roleLabel(profile.role)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="set-email" className={labelClass}>
              Email
            </label>
            <input id="set-email" type="email" readOnly value={profile.email} className={inputClass} />
          </div>
          <div>
            <label htmlFor="set-login" className={labelClass}>
              Last sign-in
            </label>
            <input id="set-login" readOnly value={formatDate(profile.lastLogin, true)} className={inputClass} suppressHydrationWarning />
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">Email, role and module access are managed by an administrator.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-70"
          >
            {pending ? "Saving…" : "Save Changes"}
          </button>
          <StatusLine status={status} />
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[0.9375rem] text-ink">
            Your modules <span className="text-gray-500">({moduleNames.length})</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">{moduleNames.length ? moduleNames.join(" · ") : "No modules yet."}</p>
        </div>
      </form>
    </Card>
  );
}

function Notifications({ initial }: { initial: NotificationPrefs }) {
  const [enabled, setEnabled] = useState<NotificationPrefs>(initial);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  // Saved as soon as a switch changes; put back if the save fails.
  function change(id: keyof NotificationPrefs, value: boolean) {
    const previous = enabled;
    const next = { ...enabled, [id]: value };
    setEnabled(next);
    startTransition(async () => {
      const result = await saveNotifications(next);
      if (result.ok) {
        setStatus({ text: "Saved.", error: false });
      } else {
        setEnabled(previous);
        setStatus({ text: result.error, error: true });
      }
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className={sectionTitle}>Notifications</h2>
        <StatusLine status={status} />
      </div>
      <ul className="mt-3 divide-y divide-line">
        {notificationOptions.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-[0.9375rem] text-ink">{o.label}</p>
              <p className="text-xs text-gray-500">{o.hint}</p>
            </div>
            <Toggle label={o.label} checked={enabled[o.id]} disabled={pending} onChange={(v) => change(o.id, v)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Security() {
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get("current") ?? "");
    const next = String(data.get("next") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    if (next.length < 10) {
      setStatus({ text: "The new password needs at least 10 characters.", error: true });
      return;
    }
    if (next !== confirm) {
      setStatus({ text: "The new passwords don't match.", error: true });
      return;
    }
    if (next === current) {
      setStatus({ text: "The new password must differ from the current one.", error: true });
      return;
    }
    startTransition(async () => {
      const result = await changePassword(current, next);
      if (result.ok) {
        form.reset();
        setStatus({ text: "Password changed. Use the new one next time you sign in.", error: false });
      } else {
        setStatus({ text: result.error, error: true });
      }
    });
  }

  return (
    <Card>
      <h2 className={sectionTitle}>Security</h2>
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-[#f5f6f5] px-4 py-3.5">
        <KeyRound className="size-6 shrink-0 text-brand" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] text-ink">Password sign-in</p>
          <p className="text-xs text-gray-500">At least 10 characters. Changing it is recorded in the activity log.</p>
        </div>
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
          minLength={10}
          maxLength={72}
          autoComplete="new-password"
          aria-label="New password"
          placeholder="New password"
          className={inputClass}
        />
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          aria-label="Confirm new password"
          placeholder="Confirm new password"
          className={inputClass}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-line bg-brand-soft px-4 py-2 text-[0.9375rem] text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-70"
          >
            {pending ? "Updating…" : "Update Password"}
          </button>
          <StatusLine status={status} />
        </div>
      </form>
    </Card>
  );
}

export function SettingsPanel({ profile }: { profile: Profile }) {
  return (
    <>
      <ProfileCard profile={profile} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Notifications initial={profile.notifications} />
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
