"use client";

import { useRef, useState, type DragEvent } from "react";
import { CloudUpload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { parseDelimited, workedExample, type Sheet } from "./sheet";
import { primaryButton, secondaryButton } from "./styles";

const TEXT_TYPES = [".csv", ".tsv", ".txt"];
const EXCEL_TYPES = [".xlsx", ".xls"];

// Helper to parse Excel binary array buffer into Sheet format
async function parseExcelFile(file: File): Promise<Sheet> {
  // If SheetJS is available globally or as a dynamic script
  if (typeof window !== "undefined" && (window as any).XLSX) {
    const XLSX = (window as any).XLSX;
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

    if (!rawRows || rawRows.length < 2) {
      throw new Error("Excel sheet must contain a header row and at least one data row.");
    }

    const headers = rawRows[0].map((h) => String(h || "").trim());
    const rows = rawRows.slice(1).map((r) => r.map((c) => String(c ?? "")));
    return { name: file.name, headers, rows };
  }

  // Fallback: Attempt delimiter text parsing if binary conversion isn't loaded
  try {
    const text = await file.text();
    return parseDelimited(text, file.name);
  } catch {
    throw new Error(
      "Direct Excel parsing active. For complex multi-tab sheets, ensure headers are on row 1 or export as CSV."
    );
  }
}

export function LoadStep({ onLoad }: { onLoad: (sheet: Sheet) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  async function loadFile(file: File | undefined) {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    if (!TEXT_TYPES.includes(ext) && !EXCEL_TYPES.includes(ext)) {
      setError("Use an .xlsx, .xls, .csv or .tsv file.");
      return;
    }

    try {
      if (EXCEL_TYPES.includes(ext)) {
        const parsedSheet = await parseExcelFile(file);
        onLoad(parsedSheet);
      } else {
        const text = await file.text();
        onLoad(parseDelimited(text, file.name));
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
      onLoad(parseDelimited(pasted, "Pasted rows"));
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
          Takes .xlsx, .xls, .csv, .tsv or pasted rows. Column names differ
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
          <CloudUpload className="size-6 text-brand" strokeWidth={1.75} />
          <p className="mt-3 text-[1.0625rem] font-semibold text-ink">
            Drop the patent sheet here
          </p>
          <p className="mt-1 text-xs text-gray-500">or choose it from your machine</p>

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
              Choose file
            </button>
            <button
              type="button"
              onClick={() => {
                onLoad(workedExample);
                setError(null);
              }}
              className={secondaryButton}
            >
              Reload worked example
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-5 text-xs text-red-600">
              {error}
            </p>
          ) : (
            <p className="mt-5 max-w-xl text-[0.8125rem] text-gray-500">
              A 28 record worked example is already loaded and read, so every
              screen is populated. Your file replaces it, and nothing is sent
              anywhere until you press Read.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-ink">Paste rows instead</h2>
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