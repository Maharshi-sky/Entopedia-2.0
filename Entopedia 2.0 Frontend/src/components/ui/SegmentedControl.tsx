"use client";

import { useState } from "react";

type Props = {
  options: string[];
  label: string;
  defaultValue?: string;
  // Pass value + onChange to control it from a parent; otherwise it manages itself.
  value?: string;
  onChange?: (value: string) => void;
  variant?: "outline" | "muted";
};

export function SegmentedControl({
  options,
  label,
  defaultValue = options[0],
  value: controlled,
  onChange,
  variant = "outline",
}: Props) {
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ?? internal;

  function select(option: string) {
    setInternal(option);
    onChange?.(option);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`scrollbar-none inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg p-1 ${
        variant === "outline" ? "border border-line bg-white" : "bg-[#f1f3f2]"
      }`}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => select(option)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-brand text-white" : "text-gray-600 hover:text-ink"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
