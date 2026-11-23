"use client";

import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import { useInView } from "@/lib/useInView";

// Chart animations inside a card stay paused until the card scrolls into view.
export function Card({
  children,
  className = "",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  // Drops the default padding for cards with edge-to-edge sections.
  flush?: boolean;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section
      ref={ref}
      data-reveal
      data-inview={inView || undefined}
      className={`rounded-xl border border-line bg-white ${flush ? "" : "p-5"} ${className}`}
    >
      {children}
    </section>
  );
}

export function IconButton({
  icon: Icon,
  label,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg border border-line text-ink transition-colors hover:bg-gray-50"
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
}
