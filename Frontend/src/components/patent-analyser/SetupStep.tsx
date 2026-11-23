"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Sheet } from "./sheet";
import { attributeNameProblem, proposeCategories } from "./analysis";
import { COLUMN_FIELDS, type ColumnKey, type ColumnMap } from "./columns";

function ChipList({
  label,
  placeholder,
  items,
  onChange,
  validate,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  /** Returns why a value can't be added, or null. */
  validate?: (value: string, items: string[]) => string | null;
}) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    if (!items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      const why = validate?.(value, items) ?? null;
      setProblem(why);
      if (why) return; // keep the draft so it can be renamed
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
        onChange={(e) => {
          setDraft(e.target.value);
          setProblem(null);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-line px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand"
      />
      {problem && (
        <p role="alert" className="mt-1.5 text-xs text-red-600">
          {problem}
        </p>
      )}
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

/** Which sheet column holds each field: detected from the headers, changeable here. */
function ColumnsCard({
  sheet,
  columns,
  detected,
  onChange,
}: {
  sheet: Sheet;
  columns: ColumnMap;
  detected: ColumnMap;
  onChange: (key: ColumnKey, col: number) => void;
}) {
  const sample = sheet.rows[0] ?? [];
  const missingKey = columns.number === -1 || columns.filer === -1;
  return (
    <Card>
      <h3 className="text-[1.0625rem] font-semibold text-ink">Columns</h3>
      <p className="mt-1 text-xs text-gray-500">
        Found from the headers of {sheet.name}. If a field picked the wrong column, choose the right one; every
        step uses these.
      </p>
      {missingKey && (
        <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No {columns.number === -1 ? "publication number" : "assignee"} column was recognised. Pick it below, or charts
          and heat maps can&apos;t be built.
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="text-[0.75rem] font-bold tracking-wider text-gray-500 uppercase">
            <tr className="border-b border-line">
              <th className="py-2 pr-3">Field</th>
              <th className="py-2 pr-3">Column in the sheet</th>
              <th className="py-2">First row</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {COLUMN_FIELDS.map((f) => {
              const col = columns[f.key];
              const auto = col === detected[f.key];
              return (
                <tr key={f.key} className="align-middle">
                  <td className="py-2 pr-3">
                    <span className="block font-semibold text-ink">{f.label}</span>
                    <span className="text-[0.6875rem] text-gray-500">{f.hint}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <select
                        aria-label={`Column for ${f.label}`}
                        value={col}
                        onChange={(e) => onChange(f.key, Number(e.target.value))}
                        className="w-56 rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-brand"
                      >
                        <option value={-1}>— not in this sheet —</option>
                        {sheet.headers.map((h, i) => (
                          <option key={`${h}-${i}`} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[0.625rem] font-bold uppercase ${
                          auto ? "bg-gray-100 text-gray-500" : "bg-brand-soft text-brand"
                        }`}
                      >
                        {auto ? "Auto" : "Changed"}
                      </span>
                    </span>
                  </td>
                  <td className="max-w-64 truncate py-2 text-gray-600" title={col === -1 ? "" : sample[col]}>
                    {col === -1 ? <span className="text-gray-400">—</span> : sample[col] || <span className="text-gray-400">(empty)</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function SetupStep({
  sheet,
  columns,
  detectedColumns,
  onColumnChange,
  categories,
  onCategoriesChange,
  attributes,
  onAttributesChange,
}: {
  sheet: Sheet;
  columns: ColumnMap;
  detectedColumns: ColumnMap;
  onColumnChange: (key: ColumnKey, col: number) => void;
  categories: string[];
  onCategoriesChange: (items: string[]) => void;
  attributes: string[];
  onAttributesChange: (items: string[]) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  function propose() {
    const proposals = proposeCategories(sheet, columns);
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

      <ColumnsCard sheet={sheet} columns={columns} detected={detectedColumns} onChange={onColumnChange} />

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
            validate={attributeNameProblem}
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
