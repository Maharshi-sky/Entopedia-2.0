"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Sheet } from "./sheet";
import { proposeCategories } from "./analysis";

function ChipList({
  label,
  placeholder,
  items,
  onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    if (!items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      onChange([...items, value]);
    }
    setDraft("");
  }

  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="mt-4">
      <label
        htmlFor={id}
        className="text-[0.8125rem] font-bold tracking-wider text-gray-600 uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-line px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand"
      />
      <div className="mt-2 flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-line px-3 py-2">
        {items.length === 0 ? (
          <span className="text-xs text-gray-500">nothing added yet</span>
        ) : (
          items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-brand-soft py-0.5 pr-1 pl-2 text-xs text-brand"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="rounded p-0.5 hover:bg-brand/10"
              >
                <X className="size-3" />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export function SetupStep({
  sheet,
  categories,
  onCategoriesChange,
  attributes,
  onAttributesChange,
}: {
  sheet: Sheet;
  categories: string[];
  onCategoriesChange: (items: string[]) => void;
  attributes: string[];
  onAttributesChange: (items: string[]) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  function propose() {
    const proposals = proposeCategories(sheet);
    const fresh = proposals.filter(
      (p) => !categories.some((c) => c.toLowerCase() === p.toLowerCase()),
    );
    if (fresh.length) onCategoriesChange([...categories, ...fresh]);
    setNotice(
      proposals.length === 0
        ? "Couldn't find a Title column with repeated phrases to propose from."
        : fresh.length === 0
          ? "Every proposal is already in the list."
          : `Added ${fresh.length} from ${sheet.name} — edit them before locking.`,
    );
  }

  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-ink">Set up the read</h2>
        <p className="mt-1 text-xs text-gray-600">
          These two lists decide what the heat maps can be built from. Every
          category becomes a possible axis and every attribute becomes another.
        </p>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-[1.0625rem] font-semibold text-ink">
            Technology taxonomy
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            One bucket per record. Propose from your own sheet, then edit before
            locking.
          </p>
          <ChipList
            label="Add a category"
            placeholder="Type a category and press enter"
            items={categories}
            onChange={onCategoriesChange}
          />
          <button
            type="button"
            onClick={propose}
            className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-[0.8125rem] font-bold tracking-wider text-white uppercase transition-colors hover:bg-brand/90"
          >
            Propose from my sheet
          </button>
          {notice && <p className="mt-2 text-xs text-gray-500">{notice}</p>}
        </Card>

        <Card>
          <h3 className="text-[1.0625rem] font-semibold text-ink">
            Attributes to extract
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Each one becomes a heat map axis as well as a column in the export.
            Two attributes crossed against each other is where most white space
            shows up.
          </p>
          <ChipList
            label="Add an attribute"
            placeholder="e.g. sweetener system, application matrix"
            items={attributes}
            onChange={onAttributesChange}
          />
          <p className="mt-3 text-xs text-gray-500">
            Keep attribute values short and repeatable. Free text that never
            repeats cannot be cross-tabulated, so ask for the class rather than
            the description.
          </p>
        </Card>
      </div>
    </>
  );
}
