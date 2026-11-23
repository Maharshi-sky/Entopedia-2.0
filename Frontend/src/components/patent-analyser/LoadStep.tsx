"use client";

import { useRef, useState, type DragEvent } from "react";
import { CheckCircle2, CloudUpload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { parseDelimited, toSheet, type Sheet } from "./sheet";
import { primaryButton, secondaryButton } from "./styles";

const TEXT_TYPES = [".csv", ".tsv", ".txt"];
const EXCEL_TYPES = [".xlsx", ".xls"];

const MAX_EXCEL_BYTES = 20 * 1024 * 1024;

const pad = (n: number) => String(n).padStart(2, "0");

/** One Excel cell as text: dates as YYYY-MM-DD, everything else as written. */
function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  return String(value).trim();
}

// Reads the first sheet of an .xlsx file in the browser (the file never leaves the machine).
// The reader is loaded only when an Excel file is chosen.
async function parseExcelFile(file: File): Promise<Sheet> {
  if (file.name.toLowerCase().endsWith(".xls")) {
    throw new Error("Old .xls files can't be read here. Open it in Excel and save it as .xlsx or CSV.");
  }
  if (file.size > MAX_EXCEL_BYTES) {
    throw new Error("That Excel file is over 20 MB. Save the sheet you need as CSV and load that instead.");
  }
  const { readSheet } = await import("read-excel-file/browser");
  let data: unknown[][];
  try {
    data = await readSheet(file);
  } catch {
    throw new Error("That Excel file couldn't be read. Check it opens in Excel, or save it as CSV.");
  }
  const rows = data.map((r) => r.map(cellText)).filter((r) => r.some((c) => c));
  if (rows.length < 2) {
    throw new Error("The first sheet needs a header row and at least one data row.");
  }
  // Same header detection and padding as CSV (skips a preamble line, pads short rows).
  return toSheet(file.name, rows);
}

type Source = { name: string; size: number | null } | null;

export function LoadStep({
  source,
  rows,
  restored,
  onLoad,
  onForgetReads,
  onOpenSaved,
}: {
  /** What is loaded now (kept by the analyser, so it shows again after switching tabs); null = nothing yet. */
  source: Source;
  rows: number;
  /** Reads brought back from an earlier session with this same sheet. */
  restored: { count: number; savedAt: string } | null;
  onLoad: (sheet: Sheet, source: Source) => void;
  onForgetReads: () => void;
  /** Goes to the Saved tab. */
  onOpenSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const loadedFileName = source?.name ?? null;
  const fileSize = source?.size ?? null;

  async function loadFile(file: File | undefined) {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    if (!TEXT_TYPES.includes(ext) && !EXCEL_TYPES.includes(ext)) {
      setError("Use an .xlsx, .csv or .tsv file.");
      return;
    }

    try {
      if (EXCEL_TYPES.includes(ext)) {
        onLoad(await parseExcelFile(file), { name: file.name, size: file.size });
      } else {
        onLoad(parseDelimited(await file.text(), file.name), { name: file.name, size: file.size });
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  }

  function loadPasted() {
    if (!pasted.trim()) {
      setPasteError("Paste some rows first, with the headers on the first line.");
      return;
    }
    try {
      onLoad(parseDelimited(pasted, "Pasted rows"), { name: "Pasted rows", size: null });
      setPasteError(null);
      setPasted("");
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : "Those rows couldn't be read.");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files[0]);
  }

  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-ink">Load the sheet</h2>
        <p className="mt-1 text-xs text-gray-600">
          Takes .xlsx, .csv, .tsv or pasted rows. Column names differ
          between exports, so map them once and the mapping holds for the
          session.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`mt-3 flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-brand bg-brand-soft" : "border-gray-200 bg-white"
          }`}
        >
          {loadedFileName ? (
            <div className="flex flex-col items-center space-y-2">
              <div className="flex items-center gap-1.5 text-base font-semibold text-green-600">
                <CheckCircle2 className="size-4" /> Patent sheet loaded
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-900">
                {loadedFileName} · {rows} records{fileSize ? ` · ${(fileSize / 1024).toFixed(1)} KB` : ""}
              </div>
              <p className="text-xs text-gray-500 max-w-md">
                Your dataset is active. You can now check Charts and Heat maps, or proceed to Read.
              </p>
            </div>
          ) : (
            <>
              <CloudUpload className="size-6 text-brand" strokeWidth={1.75} />
              <p className="mt-3 text-[1.0625rem] font-semibold text-ink">
                Drop the patent sheet here
              </p>
              <p className="mt-1 text-xs text-gray-500">or choose it from your machine</p>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={[...EXCEL_TYPES, ...TEXT_TYPES].join(",")}
            className="hidden"
            onChange={(e) => {
              loadFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={primaryButton}
            >
              {loadedFileName ? "Choose another file" : "Choose file"}
            </button>
            <button type="button" onClick={onOpenSaved} className={secondaryButton}>
              Load Saved Data
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-5 text-xs text-red-600">
              {error}
            </p>
          ) : !loadedFileName && (
            <p className="mt-5 max-w-xl text-[0.8125rem] text-gray-500">
              The file is read in this browser. Nothing is sent anywhere
              until you press Read.
            </p>
          )}
        </div>
      </section>

      {restored && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900"
        >
          <span>
            This sheet was read before: {restored.count} AI reads from{" "}
            {new Date(restored.savedAt).toLocaleString()} are back, with the brief and setup they were made
            with. Continue on Read.
          </span>
          <button type="button" onClick={onForgetReads} className="font-semibold underline">
            Start fresh
          </button>
        </p>
      )}

      <section>
        <h2 className="mt-6 text-base font-semibold text-ink">Paste rows instead</h2>
        <Card className="mt-3">
          <label
            htmlFor="pasted-rows"
            className="text-[0.8125rem] font-bold tracking-wider text-gray-600 uppercase"
          >
            Tab or comma separated, first row is headers
          </label>
          <textarea
            id="pasted-rows"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={4}
            placeholder={"Publication Number\tTitle\tAbstract\tAssignee\tPriority Date"}
            className="mt-2 w-full resize-y rounded-lg border border-line px-3 py-2.5 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-gray-400 focus:border-brand"
          />
          <button
            type="button"
            onClick={loadPasted}
            className={`mt-3 ${secondaryButton}`}
          >
            Load pasted rows
          </button>
          {pasteError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {pasteError}
            </p>
          )}
        </Card>
      </section>
    </>
  );
}