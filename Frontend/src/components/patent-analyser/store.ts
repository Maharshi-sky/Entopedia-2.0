"use client";

import { clientApi } from "@/lib/client-api";
import type { PatentRecord, RecordReadResult } from "./analysis";
import type { ColumnKey, ColumnMap } from "./columns";
import type { HeatAxes } from "./HeatmapStep";
import { emptySheet, type Sheet } from "./sheet";
import { forgetReads, forgetSaved, loadReads, loadSavedSheet, saveReads, saveSheet, sheetFingerprint } from "./saved-reads";

// The analyser's working state, kept outside the page component so it survives switching steps and
// moving to another module and back: a read in progress keeps going and its results land here.
// Reads are also saved in this browser under a fingerprint of the sheet (see saved-reads.ts), so loading
// the same file again after a reload brings them back.

export const steps = ["Load", "Set up", "Read", "Charts", "Heat maps", "Structure", "Read the set", "Export", "Saved"] as const;
export type Step = (typeof steps)[number];

/** What a read was judged against. Results made with a different setup are stale. */
export type ReadContext = { brief: string; categories: string[]; attributes: string[] };

type ReadRun = {
  running: boolean;
  stopping: boolean;
  done: number;
  total: number;
  /** Records the model gave no usable answer for, even after one retry. */
  failed: number;
  status: string | null;
  error: string | null;
};

type SetAnswer = { loading: boolean; output: string | null; meta: string | null; error: string | null };

type State = {
  step: Step;
  sheet: Sheet;
  /** The file (or pasted rows) the sheet came from; null = nothing loaded yet. */
  source: { name: string; size: number | null } | null;
  /** Fingerprint of the sheet, the key its reads are saved under. */
  sheetKey: string;
  /** Set when loading a sheet brought back reads saved earlier. */
  restored: { count: number; savedAt: string } | null;
  columnOverrides: Partial<ColumnMap>;
  categories: string[];
  attributes: string[];
  brief: string;
  aiReads: Record<number, RecordReadResult>;
  readContext: ReadContext | null;
  sliceOnly: boolean;
  run: ReadRun;
  heatAxes: HeatAxes;
  preset: SetAnswer & { name: string | null };
  ask: SetAnswer & { mode: string; question: string };
  /** Bumped whenever what is saved in this browser changes, so the Saved tab lists it again. */
  savedRev: number;
};

const IDLE_RUN: ReadRun = { running: false, stopping: false, done: 0, total: 0, failed: 0, status: null, error: null };
const EMPTY_ANSWER: SetAnswer = { loading: false, output: null, meta: null, error: null };

const INITIAL: State = {
  step: "Load",
  sheet: emptySheet,
  source: null,
  sheetKey: "",
  restored: null,
  columnOverrides: {},
  categories: [],
  attributes: [],
  brief: "",
  aiReads: {},
  readContext: null,
  sliceOnly: true,
  run: IDLE_RUN,
  heatAxes: { rows: "Filer", cols: "Technology" },
  preset: { ...EMPTY_ANSWER, name: null },
  ask: { ...EMPTY_ANSWER, mode: "Ask a question", question: "" },
  savedRev: 0,
};

let state: State = INITIAL;
const listeners = new Set<() => void>();
/** Bumped whenever the sheet or its columns change, so answers to requests made before are dropped. */
let generation = 0;
let stopRequested = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function errorText(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  try {
    return (JSON.parse(raw) as { error?: string }).error ?? fallback;
  } catch {
    return raw || fallback;
  }
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
export const sameContext = (a: ReadContext, b: ReadContext) =>
  a.brief.trim() === b.brief.trim() && sameList(a.categories, b.categories) && sameList(a.attributes, b.attributes);

/** Everything made from the old sheet or columns is dropped, and a read in flight is abandoned. */
function resetReads(): Partial<State> {
  generation += 1;
  stopRequested = false;
  return {
    aiReads: {},
    readContext: null,
    run: IDLE_RUN,
    preset: { ...EMPTY_ANSWER, name: null },
    ask: { ...state.ask, ...EMPTY_ANSWER },
  };
}

/** " · about 4 min left", from the pace so far. */
function timeLeft(started: number, done: number, total: number) {
  if (done === 0 || done >= total) return "";
  const secs = ((Date.now() - started) / done) * (total - done) / 1000;
  return secs < 90 ? " · about a minute left" : ` · about ${Math.round(secs / 60)} min left`;
}

// Rows per model call. Small batches finish well inside the 5-minute limits of the API and the
// frontend proxy, even with a 7B model on a laptop.
const BATCH_SIZE = 5;

export const analyserStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => state,
  /** Same object on server and first client render, so hydration matches. */
  initial: INITIAL,

  setStep: (step: Step) => set({ step }),
  setCategories: (categories: string[]) => set({ categories }),
  setAttributes: (attributes: string[]) => set({ attributes }),
  setBrief: (brief: string) => set({ brief }),
  setSliceOnly: (sliceOnly: boolean) => set({ sliceOnly }),
  setHeatAxes: (heatAxes: HeatAxes) => set({ heatAxes }),
  setAskMode: (mode: string) => set({ ask: { ...state.ask, mode } }),
  setQuestion: (question: string) => set({ ask: { ...state.ask, question } }),

  loadSheet(sheet: Sheet, source: State["source"]) {
    const sheetKey = sheetFingerprint(sheet);
    if (source) saveSheet(sheetKey, sheet, source); // listed on the Saved tab from now on
    const saved = loadReads(sheetKey);
    set({ savedRev: state.savedRev + 1 });
    set({ sheet, source, sheetKey, columnOverrides: {}, restored: null, ...resetReads() });
    if (saved && Object.keys(saved.reads).length > 0) {
      // Same sheet as before: bring back its reads with the setup they were made with.
      set({
        columnOverrides: saved.columnOverrides,
        aiReads: saved.reads,
        readContext: saved.context,
        brief: saved.context.brief,
        categories: saved.context.categories,
        attributes: saved.context.attributes,
        restored: { count: Object.keys(saved.reads).length, savedAt: saved.savedAt },
      });
    }
  },

  /** Drop the reads saved for this sheet and start its reading over (the sheet stays saved). */
  forgetSavedReads() {
    forgetReads(state.sheetKey);
    set({ restored: null, savedRev: state.savedRev + 1, ...resetReads() });
  },

  /** Opens a sheet from the Saved tab, with its reads; false when only its reads were kept. */
  openSaved(key: string) {
    const saved = loadSavedSheet(key);
    if (!saved) return false;
    analyserStore.loadSheet(saved.sheet, saved.source);
    set({ step: Object.keys(state.aiReads).length > 0 ? "Read" : "Set up" });
    return true;
  },

  /** Removes a sheet and its reads from this browser. The sheet open now stays open. */
  deleteSaved(key: string) {
    forgetSaved(key);
    set({ savedRev: state.savedRev + 1, ...(key === state.sheetKey ? { restored: null } : {}) });
  },

  setColumn(key: ColumnKey, col: number) {
    // Reads were made from the old columns.
    set({ columnOverrides: { ...state.columnOverrides, [key]: col }, restored: null, ...resetReads() });
  },

  /**
   * Reads the given records. Results already made with the same brief and setup are kept (so a read can
   * be continued); a different brief or setup, or `fresh`, starts the results over.
   */
  async startRead(records: PatentRecord[], { fresh = false }: { fresh?: boolean } = {}) {
    if (state.run.running || !state.brief.trim() || records.length === 0) return;
    const gen = generation;
    stopRequested = false;
    const ctx: ReadContext = {
      brief: state.brief.trim(),
      categories: [...state.categories],
      attributes: [...state.attributes],
    };
    // Results judged against a different brief or setup can't sit beside the new ones.
    const keep = !fresh && state.readContext && sameContext(state.readContext, ctx);
    const total = records.length;
    set({
      aiReads: keep ? state.aiReads : {},
      readContext: ctx,
      restored: null,
      run: { ...IDLE_RUN, running: true, total, status: `Connecting to the local model for ${total} records…` },
    });

    let done = 0;
    let failed = 0;
    const started = Date.now();
    let model = "Ollama";
    try {
      for (let i = 0; i < total; i += BATCH_SIZE) {
        if (stopRequested) break;
        const chunk = records.slice(i, i + BATCH_SIZE).map((r) => ({
          id: r.id,
          number: r.number,
          title: r.title,
          abstract: r.abstract,
          assignee: r.Filer,
          date: r["Priority year"],
        }));
        const res = await clientApi<{ success: boolean; model: string; results: RecordReadResult[]; missing?: unknown[] }>(
          "/patent/read-records",
          { method: "POST", body: JSON.stringify({ ...ctx, records: chunk }) },
        );
        if (gen !== generation) return; // the sheet or columns changed meanwhile
        model = res.model || model;

        // The API has already matched each result to its row and checked its values.
        const asked = new Set(chunk.map((r) => r.id));
        const next = { ...state.aiReads };
        for (const item of Array.isArray(res.results) ? res.results : []) {
          if (asked.has(item.id)) next[item.id] = { ...item, attributes: item.attributes || {} };
        }
        done += chunk.length;
        failed += Array.isArray(res.missing) ? res.missing.length : 0;
        set({
          aiReads: next,
          run: { ...state.run, done, failed, status: `Read ${done} / ${total} records via ${model}${timeLeft(started, done, total)}…` },
        });
        saveReads(state.sheetKey, { context: ctx, columnOverrides: state.columnOverrides, reads: next });
        set({ savedRev: state.savedRev + 1 });
      }
      if (gen !== generation) return;
      set({
        run: {
          ...IDLE_RUN,
          done,
          total,
          failed,
          status:
            (stopRequested
              ? `Stopped after reading ${done} of ${total} records.`
              : `Completed reading ${done} records using ${model}. Results are now available in Heat maps, Read the set, and Export.`) +
            (failed ? ` ${failed} got no usable answer; Continue reading tries them again.` : ""),
        },
      });
    } catch (err) {
      if (gen !== generation) return;
      set({
        run: {
          ...IDLE_RUN,
          done,
          total,
          failed,
          error: `${errorText(err, "Failed to read records with the local model.")}${done ? ` The ${done} read before this are kept; Continue reading picks up from there.` : ""}`,
        },
      });
    }
  },

  stopRead() {
    if (!state.run.running) return;
    stopRequested = true;
    set({ run: { ...state.run, stopping: true, status: "Stopping after the current batch finishes…" } });
  },

  async runPreset(name: string, records: unknown[]) {
    const gen = generation;
    set({ preset: { ...EMPTY_ANSWER, name, loading: true } });
    try {
      const res = await clientApi<{ model: string; records_analyzed: number; truncated: boolean; answer: string }>(
        "/patent/read-set",
        { method: "POST", body: JSON.stringify({ mode: "preset", preset: name, brief: state.brief, records }) },
      );
      if (gen !== generation) return;
      set({
        preset: {
          name,
          loading: false,
          error: null,
          output: res.answer,
          meta: `Generated by ${res.model} over ${res.records_analyzed} records${res.truncated ? " (top 150 slice)" : ""}.`,
        },
      });
    } catch (err) {
      if (gen !== generation) return;
      set({ preset: { ...EMPTY_ANSWER, name, error: errorText(err, "Failed to generate whole-set read.") } });
    }
  },

  async ask(records: unknown[]) {
    const { mode, question } = state.ask;
    if (!question.trim()) return;
    const gen = generation;
    set({ ask: { ...state.ask, ...EMPTY_ANSWER, loading: true } });
    try {
      const res = await clientApi<{ model: string; records_analyzed: number; answer: string }>("/patent/read-set", {
        method: "POST",
        body: JSON.stringify({ mode: "ask", askMode: mode, question: question.trim(), brief: state.brief, records }),
      });
      if (gen !== generation) return;
      set({
        ask: {
          ...state.ask,
          loading: false,
          error: null,
          output: res.answer,
          meta: `Answered by ${res.model} across ${res.records_analyzed} records.`,
        },
      });
    } catch (err) {
      if (gen !== generation) return;
      set({ ask: { ...state.ask, ...EMPTY_ANSWER, error: errorText(err, "Failed to run question on patent set.") } });
    }
  },
};
