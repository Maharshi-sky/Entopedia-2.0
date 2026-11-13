import { toCsv } from "@/lib/csv";
import type { Sheet } from "./sheet";

export { downloadCsv, toCsv } from "@/lib/csv";

// Everything here is worked out from the sheet's own columns, in the browser;
// none of it needs the reading model.

export const fields = [
  "Filer",
  "Technology",
  "Jurisdiction",
  "Organisation",
  "Priority year",
] as const;
export type Field = (typeof fields)[number];

export type PatentRecord = {
  id: number;
  number: string;
  title: string;
} & Record<Field, string>;

export type Derived = {
  records: PatentRecord[];
  taxonomy: string[];
  // Where the Technology buckets came from.
  taxonomySource: "setup" | "proposed" | "none";
};

const STOPWORDS = new Set(
  "a an and for from in of on or the to with without using via by at as its into".split(" "),
);
const MAX_PROPOSALS = 6;

// Suggests categories from the most repeated two-word phrases in the title column.
export function proposeCategories(sheet: Sheet): string[] {
  const col = findColumn(sheet, /title/i);
  if (col === -1) return [];
  const counts = new Map<string, number>();
  for (const row of sheet.rows) {
    const words = (row[col] ?? "")
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PROPOSALS)
    .map(([phrase]) => phrase.replace(/\b\w/g, (c) => c.toUpperCase()));
}

const COMPANY_SUFFIX =
  /[,.\s]+(ltd|limited|inc|incorporated|corp|corporation|co|company|llc|plc|gmbh|ag|sa|pvt|private)\.?$/i;

export function cleanAssignee(name: string) {
  let clean = name.trim().replace(/\s+/g, " ");
  while (COMPANY_SUFFIX.test(clean)) clean = clean.replace(COMPANY_SUFFIX, "");
  return clean;
}

const OFFICES: Record<string, string> = {
  WO: "WIPO (PCT)",
  EP: "Europe (EPO)",
  US: "United States",
  CN: "China",
  IN: "India",
  JP: "Japan",
  KR: "South Korea",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  BR: "Brazil",
  AU: "Australia",
  CA: "Canada",
};

function organisationType(filer: string) {
  if (/universit|institut|college|academy|school|council|csir|icmr|research cent/i.test(filer)) {
    return "Academic & research";
  }
  if (/ministry|government|department of|agency/i.test(filer)) return "Government";
  if (filer === "Unknown filer") return "Unknown";
  return "Companies";
}

function findColumn(sheet: Sheet, pattern: RegExp) {
  return sheet.headers.findIndex((h) => pattern.test(h));
}

function technologyMatcher(category: string) {
  const words = category
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return (text: string) => words.length > 0 && words.every((w) => text.includes(w));
}

export function deriveRecords(sheet: Sheet, categories: string[]): Derived {
  const numberCol = findColumn(sheet, /publication|patent|number/i);
  const titleCol = findColumn(sheet, /title/i);
  const abstractCol = findColumn(sheet, /abstract|summary/i);
  const filerCol = findColumn(sheet, /assignee|applicant|owner/i);
  const dateCol = findColumn(sheet, /priority|date|filed|year/i);

  const proposed = categories.length ? [] : proposeCategories(sheet);
  const taxonomy = categories.length ? categories : proposed;
  const matchers = taxonomy.map((c) => ({ category: c, test: technologyMatcher(c) }));

  const records = sheet.rows.map((row, id) => {
    const cell = (col: number) => (col === -1 ? "" : (row[col] ?? "").trim());
    const number = cell(numberCol);
    const text = `${cell(titleCol)} ${cell(abstractCol)}`.toLowerCase();
    const prefix = number.toUpperCase().match(/^[A-Z]{2}/)?.[0];
    const filer = cleanAssignee(cell(filerCol)) || "Unknown filer";
    return {
      id,
      number: number || `Row ${id + 2}`,
      title: cell(titleCol) || "Untitled",
      Filer: filer,
      Technology: matchers.find((m) => m.test(text))?.category ?? "Other",
      Jurisdiction: prefix ? (OFFICES[prefix] ?? prefix) : "Unknown",
      Organisation: organisationType(filer),
      "Priority year": cell(dateCol).match(/(19|20)\d{2}/)?.[0] ?? "Unknown",
    };
  });

  return {
    records,
    taxonomy,
    taxonomySource: categories.length ? "setup" : proposed.length ? "proposed" : "none",
  };
}

export type Group = { value: string; records: PatentRecord[] };

// Biggest first; years run in date order instead.
export function groupBy(records: PatentRecord[], field: Field): Group[] {
  const map = new Map<string, PatentRecord[]>();
  for (const r of records) map.set(r[field], [...(map.get(r[field]) ?? []), r]);
  const groups = [...map].map(([value, recs]) => ({ value, records: recs }));
  return field === "Priority year"
    ? groups.sort((a, b) => a.value.localeCompare(b.value))
    : groups.sort((a, b) => b.records.length - a.records.length);
}

export type CrossTab = {
  rows: string[];
  cols: string[];
  cells: PatentRecord[][][];
  max: number;
};

const AXIS_LIMIT = 12;

// Keeps the busiest AXIS_LIMIT values on each axis and folds the rest into "Other".
export function crossTab(records: PatentRecord[], rowField: Field, colField: Field): CrossTab {
  const axis = (field: Field) => {
    const values = groupBy(records, field).map((g) => g.value);
    if (values.length <= AXIS_LIMIT) return values;
    return [...values.slice(0, AXIS_LIMIT - 1), "Other"];
  };
  const rows = axis(rowField);
  const cols = axis(colField);
  const index = (values: string[], v: string) => {
    const i = values.indexOf(v);
    return i === -1 ? values.length - 1 : i;
  };
  const cells = rows.map(() => cols.map((): PatentRecord[] => []));
  for (const r of records) {
    cells[index(rows, r[rowField])][index(cols, r[colField])].push(r);
  }
  const max = Math.max(1, ...cells.flat().map((c) => c.length));
  return { rows, cols, cells, max };
}

export function share(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

export function crossTabCsv(tab: CrossTab, rowField: Field, colField: Field) {
  return toCsv([
    [`${rowField} \\ ${colField}`, ...tab.cols],
    ...tab.rows.map((row, r) => [row, ...tab.cells[r].map((c) => c.length)]),
  ]);
}

export function fileBase(sheet: Sheet) {
  return sheet.name.replace(/\.[^.]+$/, "").replace(/\s+/g, "-").toLowerCase();
}
