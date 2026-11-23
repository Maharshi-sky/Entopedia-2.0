import type { Sheet } from "./sheet";

// Which column of the sheet holds each field the analyser needs. Exports name their columns differently
// (Google Patents "id" and "priority date", Lens "Display Key" and "Earliest Priority Date", Derwent
// "Publication Number"), so each header is scored per field and the best one wins; the reader can then
// change any choice on Set up. -1 = the sheet has no such column.

export const COLUMN_FIELDS = [
  { key: "number", label: "Publication number", hint: "e.g. US-11234567-B2 or WO2021123456" },
  { key: "title", label: "Title", hint: "the patent's title" },
  { key: "abstract", label: "Abstract", hint: "optional; helps the AI read" },
  { key: "filer", label: "Assignee / applicant", hint: "who filed it" },
  { key: "date", label: "Priority / filing date", hint: "the year is taken from it" },
  { key: "jurisdiction", label: "Jurisdiction / country", hint: "optional; else taken from the number" },
] as const;

export type ColumnKey = (typeof COLUMN_FIELDS)[number]["key"];
export type ColumnMap = Record<ColumnKey, number>;

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const has = (h: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(h));

/** Score of a header for a field: 0 = not this field; higher = more certainly this field. */
const SCORERS: Record<ColumnKey, (h: string) => number> = {
  number(h) {
    if (has(h, "date", "year", "application", "priority", "family", "kind", "citation", "citations", "count", "cited", "url", "link")) return 0;
    const exact: Record<string, number> = {
      "publication number": 100, "publication no": 98, "pub number": 96, "pub no": 95, "patent number": 94,
      "patent no": 92, "display key": 90, "document number": 88, "doc number": 86, "publication": 80,
      "patent": 70, "id": 60, "number": 55, "publication id": 85,
    };
    if (h in exact) return exact[h];
    if (has(h, "publication") && has(h, "number", "no")) return 84;
    if (has(h, "patent") && has(h, "number", "no")) return 82;
    if (has(h, "number", "no")) return 40;
    return 0;
  },
  title(h) {
    if (h === "title") return 100;
    if (h === "invention title" || h === "title english" || h === "english title") return 90;
    if (has(h, "title") && !has(h, "sub", "subtitle")) return 70;
    return 0;
  },
  abstract(h) {
    if (h === "abstract") return 100;
    if (has(h, "abstract")) return 85;
    if (has(h, "summary")) return 60;
    return 0;
  },
  filer(h) {
    if (has(h, "inventor", "inventors", "address", "country", "count", "type")) return 0;
    const exact: Record<string, number> = {
      assignee: 100, assignees: 99, applicant: 98, applicants: 98, "current assignee": 97, "original assignee": 95,
      "assignee applicant": 99, "applicant assignee": 99, owner: 90, owners: 90, filer: 88,
    };
    if (h in exact) return exact[h];
    if (has(h, "assignee", "assignees")) return 85;
    if (has(h, "applicant", "applicants")) return 80;
    if (has(h, "owner", "owners", "filer")) return 65;
    return 0;
  },
  date(h) {
    if (h === "earliest priority date") return 100;
    if (h === "priority date") return 96;
    if (has(h, "priority") && has(h, "date")) return 92;
    if (h === "filing date" || h === "application date" || h === "filing creation date") return 80;
    if (has(h, "filing", "application", "filed") && has(h, "date")) return 75;
    if (h === "publication date") return 55;
    if (has(h, "grant") && has(h, "date")) return 45;
    if (has(h, "date")) return 40;
    if (has(h, "priority") && has(h, "year")) return 38;
    if (has(h, "year")) return 30;
    return 0;
  },
  jurisdiction(h) {
    const exact: Record<string, number> = {
      jurisdiction: 100, country: 95, "country code": 95, office: 90, authority: 90, "publication country": 92,
      "publication authority": 92, "patent office": 90,
    };
    if (h in exact) return exact[h];
    if (has(h, "jurisdiction")) return 85;
    if (has(h, "country") && !has(h, "applicant", "inventor", "assignee", "priority")) return 55;
    return 0;
  },
};

/** The best column for each field; no column serves two fields (a stronger match keeps it). */
export function detectColumns(headers: string[]): ColumnMap {
  const normalised = headers.map(norm);
  const candidates: { key: ColumnKey; col: number; score: number }[] = [];
  for (const { key } of COLUMN_FIELDS) {
    normalised.forEach((h, col) => {
      const score = SCORERS[key](h);
      if (score > 0) candidates.push({ key, col, score });
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.col - b.col);
  const map = Object.fromEntries(COLUMN_FIELDS.map((f) => [f.key, -1])) as ColumnMap;
  const used = new Set<number>();
  for (const c of candidates) {
    if (map[c.key] !== -1 || used.has(c.col)) continue;
    map[c.key] = c.col;
    used.add(c.col);
  }
  return map;
}

/** Detected columns with the reader's own choices on top (a choice outside the sheet is ignored). */
export function resolveColumns(sheet: Sheet, overrides: Partial<ColumnMap>): ColumnMap {
  const detected = detectColumns(sheet.headers);
  const out = { ...detected };
  for (const { key } of COLUMN_FIELDS) {
    const choice = overrides[key];
    if (typeof choice === "number" && choice >= -1 && choice < sheet.headers.length) out[key] = choice;
  }
  return out;
}

/** The cell of a field in a row ("" when the sheet has no such column). */
export function cellOf(row: string[], col: number): string {
  return col === -1 ? "" : (row[col] ?? "").trim();
}
