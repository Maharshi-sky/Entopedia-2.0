"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";

// "bar" is the full-width ask bar at the foot of a page; "panel" sits inside a card.
export function AskForm({
  onAsk,
  variant,
  placeholder = "Ask across patents, papers & products...",
}: {
  onAsk: (question: string) => void;
  variant: "panel" | "bar";
  placeholder?: string;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = value.trim();
    if (!question) return;
    onAsk(question);
    setValue("");
  }

  const bar = variant === "bar";
  return (
    <form
      onSubmit={handleSubmit}
      className={
        bar
          ? "flex items-center gap-2 rounded-xl border border-line bg-white p-1.5 pl-4"
          : "flex items-center gap-2"
      }
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Ask a question"
        placeholder={placeholder}
        className={`min-w-0 flex-1 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 ${
          bar
            ? "bg-transparent py-2"
            : "rounded-lg border border-line px-3 py-2.5 focus:border-brand"
        }`}
      />
      <button
        type="submit"
        className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90"
      >
        {bar && <Send className="size-4" strokeWidth={1.75} />}
        Ask
      </button>
    </form>
  );
}
