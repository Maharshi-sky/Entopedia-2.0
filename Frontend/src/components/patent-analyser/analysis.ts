import { toCsv } from "@/lib/csv";
import { cellOf, type ColumnMap } from "./columns";
import type { Sheet } from "./sheet";

export { downloadCsv, toCsv } from "@/lib/csv";

export const baseFields = [
  "Filer",
  "Technology",
  "Jurisdiction",
  "Organisation",
  "Priority year",
] as const;
export type BaseField = (typeof baseFields)[number];

/** Export column for an attribute: "Active ingredient" → attr_active_ingredient. */
export function attributeColumn(name: string) {
  return `attr_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

// Names a record already uses. An attribute called one of these would hide the real field on charts
// and heat maps, so Set up refuses them.
const RESERVED = new Set(
  [...baseFields, "id", "number", "title", "abstract", "relevance", "relevanceReason", "summary", "attributes"].map(
    (f) => f.toLowerCase(),
  ),
);

/** Why an attribute name can't be added next to `existing`, or null when it can. */
export function attributeNameProblem(name: string, existing: string[]): string | null {
  if (RESERVED.has(name.trim().toLowerCase())) {
    return `"${name}" is already a built-in field (${[...baseFields, "Relevance"].join(", ")}). Give the attribute a different name.`;
  }
  if (attributeColumn(name) === "attr_") return "Use at least one letter or number in the name.";
  const clash = existing.find((e) => attributeColumn(e) === attributeColumn(name));
  if (clash) return `"${name}" would share an export column with "${clash}". Use one of them, or a clearer name.`;
  return null;
}
export type Field = BaseField | string;

export type RecordReadResult = {
  id: number;
  number: string;
  relevance: "High" | "Medium" | "Low";
  relevance_reason: string;
  summary: string;
  category?: string;
  attributes: Record<string, string>;
};

export type PatentRecord = {
  id: number;
  number: string;
  title: string;
  abstract: string;
  Filer: string;
  Technology: string;
  Jurisdiction: string;
  Organisation: string;
  "Priority year": string;
  Relevance?: "High" | "Medium" | "Low";
  relevance?: "High" | "Medium" | "Low";
  relevanceReason?: string;
  summary?: string;
  attributes: Record<string, string>;
} & Record<string, unknown>;

export type Derived = {
  records: PatentRecord[];
  taxonomy: string[];
  taxonomySource: "setup" | "proposed" | "none";
};

const STOPWORDS = new Set(
  "a an and for from in of on or the to with without using via by at as its into".split(" "),
);
const MAX_PROPOSALS = 6;
// Patent boilerplate that pairs up often in titles ("method thereof", "preparation method") but is no technology.
const PROPOSAL_STOPWORDS = new Set(
  "method methods thereof preparation preparing prepared process processes use uses same novel new thereby wherein comprising containing improved".split(
    " ",
  ),
);

export function proposeCategories(sheet: Sheet, columns: ColumnMap): string[] {
  const col = columns.title;
  if (col === -1) return [];
  const counts = new Map<string, number>();
  for (const row of sheet.rows) {
    const words = (row[col] ?? "")
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !PROPOSAL_STOPWORDS.has(w));
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
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  CH: "Switzerland",
  AT: "Austria",
  BE: "Belgium",
  SE: "Sweden",
  DK: "Denmark",
  FI: "Finland",
  NO: "Norway",
  PL: "Poland",
  PT: "Portugal",
  RU: "Russia",
  TR: "Turkey",
  TW: "Taiwan",
  HK: "Hong Kong",
  SG: "Singapore",
  MY: "Malaysia",
  ID: "Indonesia",
  TH: "Thailand",
  VN: "Vietnam",
  PH: "Philippines",
  IL: "Israel",
  ZA: "South Africa",
  MX: "Mexico",
  AR: "Argentina",
  CO: "Colombia",
  CL: "Chile",
  NZ: "New Zealand",
  EA: "Eurasia (EAPO)",
  AP: "Africa (ARIPO)",
};

// Words that mark an organisation rather than a person, as Lens, Google and Derwent write applicants
// (often abbreviated and in capitals: "UNIV FLORIDA", "INST DISEASE CONTROL", "SUMITOMO CHEMICAL CO").
const ORGANISATION =
  /\b(co|corp|corporation|inc|incorporated|ltd|limited|llc|llp|lp|plc|gmbh|ag|sa|sas|srl|spa|s\.?p\.?a|bv|nv|kgaa|kk|kabushiki|kaisha|oy|ab|as|pty|pvt|company|companies|group|holdings?|enterprises?|industr\w*|ind|tech\w*|chem\w*|bio\w*|pharma\w*|lab\w*|products?|services?|sciences?|research|univ\w*|inst\w*|college|academy|school|council|foundation|ministry|government|department|dept|agency|secretary|agricultur\w*|cropscience)\b/i;

const looksLikeOrganisation = (name: string) => ORGANISATION.test(name);

/**
 * `filer` as written in the sheet, before cleanAssignee drops the "CO" / "LLC" that marks a company.
 * `hasInventors`: the sheet lists inventors (Lens, Google Patents), so a filer with no company word is a
 * person filing in their own name. Without that column a bare name is more likely a brand ("Bayer").
 */
function organisationType(filer: string, hasInventors: boolean) {
  if (!filer.trim()) return "Unknown";
  if (/universit|\buniv\b|institut|\binst\b|college|academy|school|council|csir|icmr|research cent/i.test(filer)) {
    return "Academic & research";
  }
  if (/ministry|government|department of|\bdept\b|agency|secretary|\bus agriculture\b|united states of america/i.test(filer)) {
    return "Government";
  }
  // No company word at all: a person filing in their own name ("BRITTELL ORVILLE D").
  return hasInventors && !looksLikeOrganisation(filer) ? "Individuals" : "Companies";
}

/**
 * The filer to chart when a cell lists several ("A;; B" in Lens, "A; B", "A | B"): the first organisation,
 * because Lens often lists the inventors before the company ("SURANYI ROBERT;; ...;; MCLAUGHLIN GORMLEY KING CO").
 * With no organisation in the list, the first name.
 */
export function mainFiler(cell: string) {
  const names = cell
    .split(/;;|;|\|/)
    .map((n) => n.trim())
    .filter(Boolean);
  return names.find(looksLikeOrganisation) ?? names[0] ?? "";
}

/** "US" / "us" / "United States" in a jurisdiction column, else the office prefix of the number. */
function jurisdictionOf(value: string, number: string) {
  const v = value.trim();
  if (v) {
    const code = v.toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? (OFFICES[code] ?? code) : v;
  }
  const prefix = number.toUpperCase().match(/^[A-Z]{2}/)?.[0];
  return prefix ? (OFFICES[prefix] ?? prefix) : "Unknown";
}

function technologyMatcher(category: string) {
  const words = category
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return (text: string) => words.length > 0 && words.every((w) => text.includes(w));
}

export function deriveRecords(
  sheet: Sheet,
  columns: ColumnMap,
  categories: string[],
  aiReads?: Record<number, RecordReadResult>,
): Derived {
  const proposed = categories.length ? [] : proposeCategories(sheet, columns);
  const taxonomy = categories.length ? categories : proposed;
  const matchers = taxonomy.map((c) => ({ category: c, test: technologyMatcher(c) }));

  const hasInventors = sheet.headers.some((h) => /inventor/i.test(h));

  const records: PatentRecord[] = sheet.rows.map((row, id) => {
    const number = cellOf(row, columns.number);
    const title = cellOf(row, columns.title) || "Untitled";
    const abstract = cellOf(row, columns.abstract);
    const text = `${title} ${abstract}`.toLowerCase();
    const rawFiler = mainFiler(cellOf(row, columns.filer));
    const filer = cleanAssignee(rawFiler) || "Unknown filer";
    const read = aiReads?.[id];

    const matchedTech =
      read?.category && read.category !== "Other"
        ? read.category
        : (matchers.find((m) => m.test(text))?.category ?? "Other");

    const attrs = read?.attributes ?? {};

    return {
      ...attrs, // first, so a stray attribute key can never replace a built-in field below
      id,
      number: number || `Row ${id + 2}`,
      title,
      abstract,
      Filer: filer,
      Technology: matchedTech,
      Jurisdiction: jurisdictionOf(cellOf(row, columns.jurisdiction), number),
      Organisation: organisationType(rawFiler, hasInventors),
      "Priority year": cellOf(row, columns.date).match(/(19|20)\d{2}/)?.[0] ?? "Unknown",
      ...(read?.relevance ? { Relevance: read.relevance, relevance: read.relevance } : {}),
      ...(read?.relevance_reason ? { relevanceReason: read.relevance_reason } : {}),
      ...(read?.summary ? { summary: read.summary } : {}),
      attributes: attrs,
    };
  });

  return {
    records,
    taxonomy,
    taxonomySource: categories.length ? "setup" : proposed.length ? "proposed" : "none",
  };
}

export type Group = { value: string; records: PatentRecord[] };

export function groupBy(records: PatentRecord[], field: Field): Group[] {
  const map = new Map<string, PatentRecord[]>();
  for (const r of records) {
    const val = String(r[field] ?? r.attributes?.[field] ?? "Not specified") || "Not specified";
    map.set(val, [...(map.get(val) ?? []), r]);
  }
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

export function crossTab(records: PatentRecord[], rowField: Field, colField: Field): CrossTab {
  const getVal = (r: PatentRecord, f: Field) =>
    String(r[f] ?? r.attributes?.[f] ?? "Not specified") || "Not specified";

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
    cells[index(rows, getVal(r, rowField))][index(cols, getVal(r, colField))].push(r);
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