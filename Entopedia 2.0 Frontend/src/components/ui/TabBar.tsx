"use client";

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1.5"
    >
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={t === value}
          onClick={() => onChange(t)}
          className={`shrink-0 rounded-lg px-4 py-2 text-[0.9375rem] transition-colors ${
            t === value
              ? "bg-brand font-semibold text-white"
              : "text-gray-600 hover:text-ink"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
