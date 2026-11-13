"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import { allModules, type Access, type AdminKpi, type ModuleUsage, type User } from "@/data/admin";

// Same table look as Actives Watch: no column lines, normal-case headers,
// borderless pills.
const th = "px-4 py-3 text-left text-[0.875rem] font-semibold text-ink";
const td = "px-4 py-3";
const pill = "inline-block rounded px-2.5 py-1 text-[0.8125rem] font-medium whitespace-nowrap";
const iconButton =
  "grid size-8 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink";
const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand";
const fieldLabel = "mb-1.5 block text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase";

const accessLevels: { level: Access; hint: string }[] = [
  { level: "Full", hint: "Use every enabled module, including generating and exporting." },
  { level: "Standard", hint: "Use the modules ticked below; no admin settings." },
  { level: "Read-only", hint: "View the ticked modules; can't edit, generate or export." },
  { level: "Admin (sys)", hint: "Manage users, access and audit logs." },
];

const moduleSummary = (modules: string[]) =>
  modules.length === allModules.length ? "All modules" : modules.join(", ") || "None";

const sectionLabel =
  "text-[0.8125rem] font-semibold tracking-wider text-gray-600 uppercase";

function EditUserDialog({
  user,
  onSave,
  onClose,
}: {
  user: User;
  onSave: (user: User) => void;
  onClose: () => void;
}) {
  const [access, setAccess] = useState<Access>(user.access);
  const [modules, setModules] = useState<string[]>(user.modules);
  const [active, setActive] = useState(user.active);
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

  const allOn = modules.length === allModules.length;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({
      ...user,
      role: String(data.get("role") ?? "").trim() || user.role,
      access,
      modules,
      active,
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
                .join("")}
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
            <div>
              <label htmlFor="edit-role" className={fieldLabel}>
                Role
              </label>
              <input ref={firstField} id="edit-role" name="role" defaultValue={user.role} className={inputClass} />
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {accessLevels.map(({ level, hint }) => {
                const on = access === level;
                return (
                  <label
                    key={level}
                    className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      on ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="access"
                      value={level}
                      checked={on}
                      onChange={() => setAccess(level)}
                      className="mt-0.5 size-4 shrink-0 accent-brand"
                    />
                    <span>
                      <span className="block text-[0.9375rem] font-semibold text-ink">{level}</span>
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
                onClick={() => setModules(allOn ? [] : allModules)}
                className="mb-1.5 text-[0.8125rem] font-semibold text-brand hover:underline"
              >
                {allOn ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1 rounded-lg border border-line p-2 sm:grid-cols-2">
              {allModules.map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[0.9375rem] text-ink hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={modules.includes(m)}
                    onChange={() =>
                      setModules((l) => (l.includes(m) ? l.filter((x) => x !== m) : allModules.filter((x) => x === m || l.includes(x))))
                    }
                    className="size-4 shrink-0 accent-brand"
                  />
                  {m}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[0.8125rem] text-gray-500">
              {modules.length} of {allModules.length} modules. Modules left unticked show as locked for this user.
            </p>
          </fieldset>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-[#fafbfa] px-5 py-3">
          <span className="text-[0.8125rem] text-gray-500">Saved on this page only for now.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line bg-white px-4 py-2 text-[0.9375rem] font-semibold text-ink transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-2 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90"
            >
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function AdminOverview({
  kpis,
  users: initialUsers,
  moduleUsage,
}: {
  kpis: AdminKpi[];
  users: User[];
  moduleUsage: ModuleUsage[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [editing, setEditing] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ user: User; index: number } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const editingUser = users.find((u) => u.name === editing);
  // Stable, so the dialog's focus/scroll-lock effect only runs when it opens.
  const closeEdit = useCallback(() => setEditing(null), []);

  function save(updated: User) {
    setUsers((prev) => prev.map((u) => (u.name === updated.name ? updated : u)));
    setEditing(null);
    setSaved(updated.name);
  }

  function remove(name: string) {
    const index = users.findIndex((u) => u.name === name);
    setRemoved({ user: users[index], index });
    setUsers((prev) => prev.filter((u) => u.name !== name));
  }

  function undoRemove() {
    if (!removed) return;
    setUsers((prev) => [...prev.slice(0, removed.index), removed.user, ...prev.slice(removed.index)]);
    setRemoved(null);
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

      {(removed || saved) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-xs text-gray-600">
          {removed ? (
            <span>
              Removed <span className="font-semibold text-ink">{removed.user.name}</span> from this list (only on
              this page — nothing is saved yet).
            </span>
          ) : (
            <span>
              Updated <span className="font-semibold text-ink">{saved}</span> on this page. Changes aren&apos;t saved
              to an account system yet.
            </span>
          )}
          <span className="flex gap-3">
            {removed && (
              <button type="button" onClick={undoRemove} className="font-semibold text-brand hover:underline">
                Undo
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                setRemoved(null);
                setSaved(null);
              }}
              className="text-gray-400 hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-[0.9375rem]">
            <thead className="bg-[#E5E8E3]">
              <tr>
                {["User", "Role", "Access", "Modules", "Status", "Actions"].map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No users left in this list.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.name} className="transition-colors hover:bg-[#fafbfa]">
                  <td className={td}>
                    <button
                      type="button"
                      onClick={() => setEditing(u.name)}
                      className="text-left font-semibold whitespace-nowrap text-ink hover:text-brand hover:underline"
                    >
                      {u.name}
                    </button>
                  </td>
                  <td className={`${td} text-gray-600`}>{u.role}</td>
                  <td className={td}>
                    <span className={`${pill} bg-[#EEF2EF] text-gray-700`}>{u.access}</span>
                  </td>
                  <td className={`${td} max-w-xs text-gray-600`}>
                    <span className="line-clamp-2" title={moduleSummary(u.modules)}>
                      {moduleSummary(u.modules)}
                    </span>
                  </td>
                  <td className={td}>
                    <span
                      className={`${pill} ${
                        u.active ? "bg-[#d5efe9] text-[#0F766E]" : "bg-[#E0E5E1] text-gray-600"
                      }`}
                    >
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <button type="button" aria-label={`Edit ${u.name}`} title="Edit user and access" onClick={() => setEditing(u.name)} className={iconButton}>
                        <Pencil className="size-4" strokeWidth={1.75} />
                      </button>
                      <button type="button" aria-label={`Remove ${u.name}`} title="Remove" onClick={() => remove(u.name)} className={`${iconButton} hover:text-red-600`}>
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

      <Card>
        <h2 className={sectionLabel}>Module Usage (30d)</h2>
        {/* Two columns of bars now that the card spans the full width. */}
        <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-3 md:grid-cols-2">
          {moduleUsage.map((m, i) => (
            <li key={m.module}>
              <div className="flex items-center justify-between gap-3 text-[0.875rem]">
                <span className="text-ink">{m.module}</span>
                <span className="font-semibold text-ink tabular-nums">{m.pct}%</span>
              </div>
              {/* An SVG line so the bar can use the shared draw-on-reveal animation. */}
              <svg
                viewBox="0 0 100 4"
                preserveAspectRatio="none"
                className="mt-1 block h-1 w-full rounded-full bg-gray-200"
                aria-hidden
              >
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
      </Card>

      {editingUser && (
        <EditUserDialog
          key={editingUser.name}
          user={editingUser}
          onSave={save}
          onClose={closeEdit}
        />
      )}
    </>
  );
}
