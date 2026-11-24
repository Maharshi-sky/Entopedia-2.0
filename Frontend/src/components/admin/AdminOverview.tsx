"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Pencil, Power, RotateCcw, Trash2, UserPlus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import { accessLevels, roles, type AccessLevel, type AppModule, type RemovedUser, type User } from "@/data/admin";
import type { AdminPageData } from "@/lib/admin-data";
import { createUser, removeUser, restoreUser, saveUser, setUserActive } from "@/lib/admin-actions";

// Users, their access and recent activity, all from the database. Edits are saved through the API
// (which records them in the activity log), then the page reloads its data.

const th = "px-4 py-3 text-left text-[0.875rem] font-semibold text-ink";
const td = "px-4 py-3";
const pill = "inline-block rounded px-2.5 py-1 text-[0.8125rem] font-medium whitespace-nowrap";
const iconButton =
  "grid size-8 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink disabled:opacity-50";
const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand";
const fieldLabel = "mb-1.5 block text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase";
const sectionLabel = "text-[0.8125rem] font-semibold tracking-wider text-gray-600 uppercase";

const roleLabel = (role: string) => roles.find((r) => r.value === role)?.label ?? role;
const accessLabel = (access: AccessLevel | null) => accessLevels.find((a) => a.value === access)?.label ?? "No access";

function moduleSummary(slugs: string[], modules: AppModule[]) {
  if (slugs.length === 0) return "None";
  if (modules.length > 0 && slugs.length >= modules.length) return "All modules";
  return slugs.map((s) => modules.find((m) => m.slug === s)?.name ?? s).join(", ");
}

/** "20 Nov, 14:05", in the viewer's time zone (so rendered on the client). */
function When({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-gray-400">Never</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span className="text-gray-400">—</span>;
  return (
    <time dateTime={iso} suppressHydrationWarning className="whitespace-nowrap">
      {d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);

const cancelButton =
  "rounded-lg border border-line bg-white px-4 py-2 text-[0.9375rem] font-semibold text-ink transition-colors hover:bg-gray-50";
const primaryButton =
  "flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-70";

/** Overlay, header, scrolling body and footer shared by the Admin page's dialogs. Escape closes it. */
function Dialog({
  id,
  title,
  subtitle,
  badge,
  size = "sm:max-w-xl",
  onSubmit,
  onClose,
  footer,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  size?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Keep the page behind the dialog from scrolling.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div aria-hidden onClick={onClose} className="chart-fade absolute inset-0 bg-black/40" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onSubmit={onSubmit}
        className={`chart-pop relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${size}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            {badge}
            <div>
              <h2 id={id} className="text-lg font-semibold text-ink">
                {title}
              </h2>
              {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-line bg-[#fafbfa] px-5 py-3">{footer}</div>
      </form>
    </div>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </p>
  );
}

function RoleSelect({ id, value, onChange }: { id: string; value: string; onChange: (role: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        Role
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Access level radios and the module checklist, used when adding and when editing a user. */
function AccessFields({
  modules,
  access,
  onAccess,
  selected,
  onSelected,
}: {
  modules: AppModule[];
  access: AccessLevel;
  onAccess: (access: AccessLevel) => void;
  selected: string[];
  onSelected: (update: (list: string[]) => string[]) => void;
}) {
  const allOn = modules.length > 0 && modules.every((m) => selected.includes(m.slug));
  return (
    <>
      <fieldset>
        <legend className={fieldLabel}>Access level</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {accessLevels.map(({ value, label, hint }) => {
            const on = access === value;
            return (
              <label
                key={value}
                className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  on ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="access"
                  value={value}
                  checked={on}
                  onChange={() => onAccess(value)}
                  className="mt-0.5 size-4 shrink-0 accent-brand"
                />
                <span>
                  <span className="block text-[0.9375rem] font-semibold text-ink">{label}</span>
                  <span className="block text-[0.8125rem] text-gray-500">{hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <div className="flex items-center justify-between gap-3">
          <legend className={fieldLabel}>Module access</legend>
          <button
            type="button"
            onClick={() => onSelected(() => (allOn ? [] : modules.map((m) => m.slug)))}
            className="mb-1.5 text-[0.8125rem] font-semibold text-brand hover:underline"
          >
            {allOn ? "Clear all" : "Select all"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1 rounded-lg border border-line p-2 sm:grid-cols-2">
          {modules.map((m) => (
            <label
              key={m.slug}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[0.9375rem] text-ink hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(m.slug)}
                onChange={() => onSelected((l) => (l.includes(m.slug) ? l.filter((x) => x !== m.slug) : [...l, m.slug]))}
                className="size-4 shrink-0 accent-brand"
              />
              {m.name}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[0.8125rem] text-gray-500">
          {selected.length} of {modules.length} modules.
        </p>
      </fieldset>
    </>
  );
}

function EditUserDialog({
  user,
  modules,
  onSaved,
  onClose,
}: {
  user: User;
  modules: AppModule[];
  onSaved: (name: string) => void;
  onClose: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [access, setAccess] = useState<AccessLevel>(user.access ?? "full");
  const [selected, setSelected] = useState<string[]>(user.modules);
  const [active, setActive] = useState(user.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => firstField.current?.focus(), []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    setError(null);
    startTransition(async () => {
      const result = await saveUser(user.id, { name, role, active, access, modules: selected });
      if (result.ok) onSaved(name);
      else setError(result.error);
    });
  }

  return (
    <Dialog
      id="edit-user-title"
      title={`Edit ${user.name}`}
      subtitle={user.email}
      badge={
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-[0.9375rem] font-semibold text-white">
          {initials(user.name)}
        </span>
      }
      onSubmit={handleSubmit}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="edit-name" className={fieldLabel}>
            Name
          </label>
          <input ref={firstField} id="edit-name" name="name" required defaultValue={user.name} className={inputClass} />
        </div>
        <RoleSelect id="edit-role" value={role} onChange={setRole} />
        <div>
          <span className={fieldLabel}>Status</span>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-[0.9375rem] text-ink"
          >
            {active ? "Active" : "Inactive"}
            <span className={`relative h-6 w-11 rounded-full transition-colors ${active ? "bg-brand" : "bg-gray-300"}`}>
              <span
                className={`absolute top-1 left-1 size-4 rounded-full bg-white shadow transition-transform ${
                  active ? "translate-x-5" : ""
                }`}
              />
            </span>
          </button>
        </div>
      </div>
      <AccessFields modules={modules} access={access} onAccess={setAccess} selected={selected} onSelected={setSelected} />
      <ErrorNote error={error} />
    </Dialog>
  );
}

/** A 16-character password from an alphabet without look-alikes (0/O, 1/l/I), for the admin to pass on. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function AddUserDialog({
  modules,
  onSaved,
  onClose,
}: {
  modules: AppModule[];
  onSaved: (name: string, email: string) => void;
  onClose: () => void;
}) {
  const [role, setRole] = useState<string>("marketing");
  const [access, setAccess] = useState<AccessLevel>("full");
  const [selected, setSelected] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => firstField.current?.focus(), []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    setError(null);
    startTransition(async () => {
      const result = await createUser({ name, email, password, role, access, modules: selected });
      if (result.ok) onSaved(name, email);
      else setError(result.error);
    });
  }

  return (
    <Dialog
      id="add-user-title"
      title="Add user"
      subtitle="They sign in with this email and password, and can change the password in Settings."
      badge={
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
          <UserPlus className="size-5" strokeWidth={1.75} />
        </span>
      }
      onSubmit={handleSubmit}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? "Adding…" : "Add user"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="add-name" className={fieldLabel}>
            Name
          </label>
          <input ref={firstField} id="add-name" name="name" required maxLength={255} className={inputClass} />
        </div>
        <div>
          <label htmlFor="add-email" className={fieldLabel}>
            Email
          </label>
          <input id="add-email" name="email" type="email" required maxLength={255} autoComplete="off" className={inputClass} />
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="add-password" className={fieldLabel}>
              Password
            </label>
            <button
              type="button"
              onClick={() => {
                setPassword(generatePassword());
                setShowPassword(true);
              }}
              className="mb-1.5 text-[0.8125rem] font-semibold text-brand hover:underline"
            >
              Generate
            </button>
          </div>
          <div className="relative">
            <input
              id="add-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={10}
              maxLength={72}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-10 font-mono`}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded text-gray-400 hover:text-ink"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="mt-1 text-[0.8125rem] text-gray-500">At least 10 characters. Share it with the user yourself.</p>
        </div>
        <RoleSelect id="add-role" value={role} onChange={setRole} />
      </div>
      <AccessFields modules={modules} access={access} onAccess={setAccess} selected={selected} onSelected={setSelected} />
      <ErrorNote error={error} />
    </Dialog>
  );
}

function RemoveUserDialog({ user, onDone, onClose }: { user: User; onDone: () => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await removeUser(user.id);
      if (result.ok) onDone();
      else setError(result.error);
    });
  }

  return (
    <Dialog
      id="remove-user-title"
      title={`Remove ${user.name}?`}
      subtitle={user.email}
      size="sm:max-w-md"
      onSubmit={handleSubmit}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelButton}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-70"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {pending ? "Removing…" : "Remove user"}
          </button>
        </>
      }
    >
      <p className="text-[0.9375rem] text-gray-600">
        They will be signed out and can&apos;t sign in, and they leave the user list. Their history and data are kept,
        and you can restore them from <span className="font-semibold text-ink">Removed users</span> below.
      </p>
      <ErrorNote error={error} />
    </Dialog>
  );
}

function RemovedUsers({
  users,
  busy,
  onRestore,
}: {
  users: RemovedUser[];
  busy: string | null;
  onRestore: (user: RemovedUser) => void;
}) {
  if (users.length === 0) return null;
  return (
    <Card flush className="overflow-hidden">
      <details>
        <summary className="cursor-pointer px-4 py-3 select-none">
          <span className={sectionLabel}>Removed users ({users.length})</span>
          <span className="mt-1 block text-xs text-gray-500">Can&apos;t sign in. Restore brings them back with their old access.</span>
        </summary>
        <ul className="divide-y divide-line border-t border-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[0.9375rem]">
              <div className="min-w-0">
                <span className="font-semibold text-ink">{u.name}</span>
                <span className="block truncate text-[0.8125rem] text-gray-500">
                  {u.email} · {roleLabel(u.role)} · removed <When iso={u.removedAt} />
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRestore(u)}
                disabled={busy === u.id}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                {busy === u.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Restore
              </button>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

export function AdminOverview({ data }: { data: AdminPageData }) {
  const { kpis, users, removedUsers, moduleUsage, modules, activity } = data;
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const editingUser = users.find((u) => u.id === editing);
  const removingUser = users.find((u) => u.id === removing);
  // Stable, so each dialog's scroll-lock effect only runs when it opens.
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeRemove = useCallback(() => setRemoving(null), []);
  const closeAdd = useCallback(() => setAdding(false), []);

  function saved(name: string) {
    setEditing(null);
    setNotice({ tone: "ok", text: `Saved ${name}. The change is in the activity list below.` });
    router.refresh();
  }

  function added(name: string, email: string) {
    setAdding(false);
    setNotice({ tone: "ok", text: `Added ${name}. They can sign in as ${email} with the password you set.` });
    router.refresh();
  }

  function removed(user: User) {
    setRemoving(null);
    setNotice({ tone: "ok", text: `Removed ${user.name}. You can restore them from Removed users below.` });
    router.refresh();
  }

  function restore(user: RemovedUser) {
    setBusy(user.id);
    startTransition(async () => {
      const result = await restoreUser(user.id);
      setBusy(null);
      if (result.ok) {
        setNotice({ tone: "ok", text: `Restored ${user.name}. They can sign in again.` });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: result.error });
      }
    });
  }

  function toggleActive(user: User) {
    setBusy(user.id);
    startTransition(async () => {
      const result = await setUserActive(user.id, !user.active);
      setBusy(null);
      if (result.ok) {
        setNotice({ tone: "ok", text: `${user.name} is now ${user.active ? "inactive and can't sign in" : "active"}.` });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: result.error });
      }
    });
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <p className={sectionLabel}>{k.label}</p>
            <p className="mt-2 font-heading text-2xl font-semibold text-ink">
              <CountUp value={k.value} />
              {k.suffix}
            </p>
          </Card>
        ))}
      </div>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`flex items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-xs ${
            notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-line bg-white text-gray-600"
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="text-gray-400 hover:text-ink">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className={sectionLabel}>Users ({users.length})</h2>
            <p className="mt-1 text-xs text-gray-500">Add people, set their role and modules, or remove them.</p>
          </div>
          <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
            <UserPlus className="size-4" strokeWidth={2} />
            Add user
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-[0.9375rem]">
            <thead className="bg-[#E5E8E3]">
              <tr>
                {["User", "Role", "Access", "Modules", "Last active", "Status", "Actions"].map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No users in the database.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-[#fafbfa]">
                  <td className={td}>
                    <button
                      type="button"
                      onClick={() => setEditing(u.id)}
                      className="text-left font-semibold whitespace-nowrap text-ink hover:text-brand hover:underline"
                    >
                      {u.name}
                    </button>
                    <span className="block text-[0.8125rem] text-gray-500">{u.email}</span>
                  </td>
                  <td className={`${td} text-gray-600`}>{roleLabel(u.role)}</td>
                  <td className={td}>
                    <span className={`${pill} bg-[#EEF2EF] text-gray-700`}>{accessLabel(u.access)}</span>
                  </td>
                  <td className={`${td} max-w-xs text-gray-600`}>
                    <span className="line-clamp-2" title={moduleSummary(u.modules, modules)}>
                      {moduleSummary(u.modules, modules)}
                    </span>
                  </td>
                  <td className={`${td} text-[0.8125rem] text-gray-600`}>
                    <When iso={u.lastActive ?? u.lastLogin} />
                  </td>
                  <td className={td}>
                    <span className={`${pill} ${u.active ? "bg-[#d5efe9] text-[#0F766E]" : "bg-[#E0E5E1] text-gray-600"}`}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${u.name}`}
                        title="Edit user and access"
                        onClick={() => setEditing(u.id)}
                        className={iconButton}
                      >
                        <Pencil className="size-4" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        aria-label={u.active ? `Deactivate ${u.name}` : `Activate ${u.name}`}
                        title={u.active ? "Deactivate (can't sign in; history is kept)" : "Activate"}
                        onClick={() => toggleActive(u)}
                        disabled={busy === u.id}
                        className={`${iconButton} ${u.active ? "hover:text-red-600" : "hover:text-brand"}`}
                      >
                        {busy === u.id ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" strokeWidth={1.75} />}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${u.name}`}
                        title="Remove user (can be restored)"
                        onClick={() => setRemoving(u.id)}
                        className={`${iconButton} hover:text-red-600`}
                      >
                        <Trash2 className="size-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RemovedUsers users={removedUsers} busy={busy} onRestore={restore} />

      <Card>
        <h2 className={sectionLabel}>Module Usage (30d)</h2>
        <p className="mt-1 text-xs text-gray-500">Share of active users who opened each module.</p>
        {moduleUsage.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No module visits recorded in the last 30 days yet.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-3 md:grid-cols-2">
            {moduleUsage.map((m, i) => (
              <li key={m.module}>
                <div className="flex items-center justify-between gap-3 text-[0.875rem]">
                  <span className="text-ink">{m.module}</span>
                  <span className="text-gray-500 tabular-nums">
                    {m.users} {m.users === 1 ? "user" : "users"} · {m.visits} {m.visits === 1 ? "visit" : "visits"} ·{" "}
                    <span className="font-semibold text-ink">{m.pct}%</span>
                  </span>
                </div>
                {/* An SVG line so the bar can use the shared draw-on-reveal animation. */}
                <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="mt-1 block h-1 w-full rounded-full bg-gray-200" aria-hidden>
                  <line
                    x1="0"
                    y1="2"
                    x2={m.pct}
                    y2="2"
                    pathLength={1}
                    stroke="#4b5563"
                    strokeWidth="4"
                    className="chart-draw"
                    style={{ animationDelay: `${i * 80}ms` }}
                  />
                </svg>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card flush className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className={sectionLabel}>Recent activity</h2>
          <p className="mt-1 text-xs text-gray-500">Sign-ins, module visits, AI queries and admin changes, newest first.</p>
        </div>
        {activity.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">Nothing recorded yet.</p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[48rem] text-[0.875rem]">
              <thead className="sticky top-0 bg-[#E5E8E3]">
                <tr>
                  {["When", "User", "Action", "Details"].map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {activity.map((e) => (
                  <tr key={`${e.action}-${e.id}`} className="align-top">
                    <td className={`${td} text-gray-600`}>
                      <When iso={e.at} />
                    </td>
                    <td className={td}>
                      <span className="font-semibold whitespace-nowrap text-ink">{e.user}</span>
                    </td>
                    <td className={td}>
                      <span
                        className={`${pill} ${
                          e.action === "Failed sign-in" ? "bg-red-50 text-red-700" : "bg-[#EEF2EF] text-gray-700"
                        }`}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td className={`${td} text-gray-600`}>
                      {[e.module, e.detail].filter(Boolean).join(" · ")}
                      {e.ip && <span className="block text-[0.75rem] text-gray-400">IP {e.ip}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editingUser && (
        <EditUserDialog
          key={editingUser.id}
          user={editingUser}
          modules={modules}
          onSaved={saved}
          onClose={closeEdit}
        />
      )}
      {removingUser && (
        <RemoveUserDialog key={removingUser.id} user={removingUser} onDone={() => removed(removingUser)} onClose={closeRemove} />
      )}
      {adding && <AddUserDialog modules={modules} onSaved={added} onClose={closeAdd} />}
    </>
  );
}
