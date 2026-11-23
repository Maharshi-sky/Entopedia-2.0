import type { RecordReadResult } from "./analysis";
import type { ColumnMap } from "./columns";
import type { Sheet } from "./sheet";
import type { ReadContext } from "./store";

// Sheets and their reads saved in this browser, one entry per sheet, keyed by a fingerprint of the sheet's
// contents. Each entry has up to three parts:
//   meta:<key>   name, size and when it was last used (small; the Saved tab lists these)
//   sheet:<key>  the rows themselves, so the Saved tab can open the sheet without the file
//   <key>        the AI reads, with the brief and setup they were made with
// Loading the same export again also brings its reads back. Results are tied to row positions, so a sheet
// that differs by even one cell gets a different key. Only the most recent few sheets are kept, and storage
// that is full or blocked just means less is saved (a sheet too big to keep still keeps its reads).

export type SavedReads = {
  context: ReadContext;
  columnOverrides: Partial<ColumnMap>;
  reads: Record<number, RecordReadResult>;
  savedAt: string;
};

export type SavedSource = { name: string; size: number | null };

/** One row of the Saved tab. */
export type SavedEntry = {
  key: string;
  name: string;
  rows: number;
  columns: number;
  size: number | null;
  /** False when the rows were too big to keep: the file has to be loaded again. */
  hasSheet: boolean;
  readCount: number;
  brief: string;
  savedAt: string;
};

type SavedMeta = { name: string; rows: number; columns: number; size: number | null; hasSheet: boolean; savedAt: string };

const PREFIX = "entopedia:patent-reads:v1:";
const INDEX = `${PREFIX}index`;
const KEEP = 5;
/** Rows bigger than this (in characters) aren't worth clearing other sheets for: browsers allow about 5 MB. */
const EVICT_FOR_SHEET = 2_000_000;
const readsKey = (key: string) => PREFIX + key;
const sheetKey = (key: string) => `${PREFIX}sheet:${key}`;
const metaKey = (key: string) => `${PREFIX}meta:${key}`;

/** Two FNV-1a hashes over headers and cells, plus the size: cheap and stable across reloads. */
export function sheetFingerprint(sheet: Sheet): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  const feed = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
    }
    a = Math.imul(a ^ 0x1f, 0x01000193); // cell separator
  };
  sheet.headers.forEach(feed);
  for (const row of sheet.rows) row.forEach(feed);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${sheet.rows.length}x${sheet.headers.length}-${hex(a)}${hex(b)}`;
}

function readJson<T>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readIndex(): string[] {
  const raw = readJson<unknown>(INDEX);
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
}

function writeIndex(keys: string[]) {
  try {
    localStorage.setItem(INDEX, JSON.stringify(keys));
  } catch {
    // storage unavailable
  }
}

function remove(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // storage unavailable
  }
}

function forgetEntry(key: string) {
  remove(readsKey(key));
  remove(sheetKey(key));
  remove(metaKey(key));
}

/**
 * Writes one part of an entry and moves the entry to the front of the index. The oldest entries beyond
 * KEEP are dropped, and more of them if the browser says storage is full. False if it still didn't fit.
 */
function put(key: string, storageKey: string, value: string, { evict = true } = {}): boolean {
  let keys = [key, ...readIndex().filter((k) => k !== key)];
  for (const old of keys.slice(KEEP)) forgetEntry(old);
  keys = keys.slice(0, KEEP);
  for (;;) {
    try {
      localStorage.setItem(storageKey, value);
      writeIndex(keys);
      return true;
    } catch {
      // Too big to keep, or storage blocked; `evict: false` keeps the other entries rather than risk them.
      if (!evict || keys.length <= 1) return false;
      forgetEntry(keys.pop()!);
    }
  }
}

function touchMeta(key: string, patch: Partial<SavedMeta>) {
  const meta = readJson<SavedMeta>(metaKey(key));
  if (!meta && !patch.name) return;
  put(key, metaKey(key), JSON.stringify({ ...meta, ...patch, savedAt: new Date().toISOString() }));
}

/** Keeps a loaded sheet (rows included, when they fit) so the Saved tab can open it again. */
export function saveSheet(key: string, sheet: Sheet, source: SavedSource) {
  const stored = readJson<{ sheet: Sheet }>(sheetKey(key)) !== null; // same fingerprint, same rows
  const value = stored ? "" : JSON.stringify({ sheet, source });
  const hasSheet = stored || put(key, sheetKey(key), value, { evict: value.length < EVICT_FOR_SHEET });
  touchMeta(key, {
    name: source.name,
    rows: sheet.rows.length,
    columns: sheet.headers.length,
    size: source.size,
    hasSheet,
  });
}

/** The sheet saved under this key, or null when only its reads were kept. */
export function loadSavedSheet(key: string): { sheet: Sheet; source: SavedSource } | null {
  const saved = readJson<{ sheet: Sheet; source: SavedSource }>(sheetKey(key));
  if (!saved?.sheet || !Array.isArray(saved.sheet.headers) || !Array.isArray(saved.sheet.rows)) return null;
  return { sheet: saved.sheet, source: saved.source ?? { name: saved.sheet.name, size: null } };
}

export function loadReads(key: string): SavedReads | null {
  const saved = readJson<SavedReads>(readsKey(key));
  if (!saved?.reads || !saved.context || typeof saved.context.brief !== "string") return null;
  return {
    ...saved,
    context: {
      brief: saved.context.brief,
      categories: Array.isArray(saved.context.categories) ? saved.context.categories : [],
      attributes: Array.isArray(saved.context.attributes) ? saved.context.attributes : [],
    },
    columnOverrides: saved.columnOverrides ?? {},
  };
}

export function saveReads(key: string, data: Omit<SavedReads, "savedAt">) {
  put(key, readsKey(key), JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  touchMeta(key, {});
}

/** Drops a sheet's reads but keeps the sheet itself in the Saved list. */
export function forgetReads(key: string) {
  remove(readsKey(key));
  touchMeta(key, {});
}

/** Drops everything saved for a sheet. */
export function forgetSaved(key: string) {
  forgetEntry(key);
  writeIndex(readIndex().filter((k) => k !== key));
}

/** Everything saved, most recently used first. */
export function listSaved(): SavedEntry[] {
  const out: SavedEntry[] = [];
  for (const key of readIndex()) {
    const meta = readJson<SavedMeta>(metaKey(key));
    const reads = loadReads(key);
    if (!meta && !reads) continue;
    out.push({
      key,
      name: meta?.name ?? "Sheet loaded before this list existed",
      rows: meta?.rows ?? (Number(key.split("x")[0]) || 0),
      columns: meta?.columns ?? 0,
      size: meta?.size ?? null,
      hasSheet: meta?.hasSheet ?? false,
      readCount: reads ? Object.keys(reads.reads).length : 0,
      brief: reads?.context.brief ?? "",
      savedAt: meta?.savedAt ?? reads?.savedAt ?? "",
    });
  }
  return out;
}
