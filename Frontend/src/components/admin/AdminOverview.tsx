"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Power, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import { accessLevels, roles, type AccessLevel, type AppModule, type User } from "@/data/admin";
import type { AdminPageData } from "@/lib/admin-data";
import { saveUser, setUserActive } from "@/lib/admin-actions";

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
  const [access, setAccess] = useState<AccessLevel>(user.access ?? "standard");
  const [selected, setSelected] = useState<string[]>(user.modules);
  const [active, setActive] = useState(user.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
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

  const allOn = modules.length > 0 && modules.every((m) => selected.includes(m.slug));

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
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div aria-hidden onClick={onClose} className="chart-fade absolute inset-0 bg-black/40" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
        onSubmit={handleSubmit}
        className="chart-pop relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-[0.9375rem] font-semibold text-white">
              {user.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)}
            </span>
            <div>
              <h2 id="edit-user-title" className="text-lg font-semibold text-ink">
                Edit {user.name}
              </h2>
              <p className="text-xs text-gray-500">{user.email}</p>
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="edit-name" className={fieldLabel}>
                Name
              </label>
              <input ref={firstField} id="edit-name" name="name" required defaultValue={user.name} className={inputClass} />
            </div>
            <div>
              <label htmlFor="edit-role" className={fieldLabel}>
                Role
              </label>
              <select id="edit-role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
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

          <fieldset>
            <legend className={fieldLabel}>Access level</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                      onChange={() => setAccess(value)}
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
                onClick={() => setSelected(allOn ? [] : modules.map((m) => m.slug))}
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
                    onChange={() =>
                      setSelected((l) => (l.includes(m.slug) ? l.filter((x) => x !== m.slug) : [...l, m.slug]))
                    }
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

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-[#fafbfa] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-white px-4 py-2 text-[0.9375rem] font-semibold text-ink transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-70"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdminOverview({ data }: { data: AdminPageData }) {
  const { kpis, users, moduleUsage, modules, activity } = data;
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const editingUser = users.find((u) => u.id === editing);
  // Stable, so the dialog's focus/scroll-lock effect only runs when it opens.
  const closeEdit = useCallback(() => setEditing(null), []);

  function saved(name: string) {
    setEditing(null);
    setNotice({ tone: "ok", text: `Saved ${name}. The change is in the activity list below.` });
    router.refresh();
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
    </>
  );
}
