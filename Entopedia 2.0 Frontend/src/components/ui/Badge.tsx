import type { ReactNode } from "react";

const tones = {
  red: "border-red-200 bg-red-50 text-red-600",
  orange: "border-[#E4572E]/30 bg-[#E4572E33] text-[#E4572E]",
  gray: "border-[#E0E5E1] bg-[#EEF2EF] text-gray-600",
  green: "border-[#0F766E33] bg-[#0F766E0D] text-[#0F766E]",
  amber: "border-amber-200 bg-amber-50 text-amber-600",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-600",
  purple: "border-purple-200 bg-purple-50 text-purple-600",
  solid: "border-orange-500 bg-orange-500 text-white",
};

export type BadgeTone = keyof typeof tones;

export function Badge({
  tone,
  children,
  size = "md",
  pill = false,
}: {
  tone: BadgeTone;
  children: ReactNode;
  size?: "sm" | "md";
  // Rounder corners, for places where the badge sits on its own (e.g. news cards).
  pill?: boolean;
}) {
  return (
    <span
      className={`inline-block border font-bold tracking-wide uppercase ${
        pill ? "rounded-lg" : "rounded"
      } ${
        size === "sm"
          ? "px-1 py-px text-[0.6875rem]"
          : "px-1.5 py-0.5 text-[0.75rem]"
      } ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
