"use client";

import { useState } from "react";
import { Database, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Sheet } from "./sheet";
import { primaryButton, secondaryButton } from "./styles";
import {
  attributeColumn,
  cleanAssignee,
  crossTab,
  crossTabCsv,
  downloadCsv,
  fileBase,
  mainFiler,
  toCsv,
  type Derived,
  type RecordReadResult,
} from "./analysis";
import type { HeatAxes } from "./HeatmapStep";
import { cellOf, type ColumnMap } from "./columns";
import { clientApi } from "@/lib/client-api";

const DB_BATCH_SIZE = 500;

export function ExportStep({
  sheet,
  columns,
  attributes,
  derived,
  aiReads = {},
  heatAxes,
}: {
  sheet: Sheet;
  /** Which column holds each field (chosen on Set up). */
  columns: ColumnMap;
  attributes: string[];
  derived: Derived | null;
  aiReads?: Record<number, RecordReadResult>;
  heatAxes: HeatAxes;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  const hasAiReads = Object.keys(aiReads).length > 0;
  const attributeColumns = attributes.map(attributeColumn);

  // PA-05: Enriched Summary CSV Export (appends assignee_clean, AI read columns, and extracted attributes)
  function exportCsv() {
    const assigneeCol = columns.filer;
    const aiCols = hasAiReads ? ["ai_relevance", "ai_relevance_reason", "ai_summary"] : [];
    const headers = [...sheet.headers, "assignee_clean", ...aiCols, ...attributeColumns];

    const csv = toCsv([
      headers,
      ...sheet.rows.map((row, rowIdx) => {
        const read = aiReads[rowIdx];
        return [
          ...sheet.headers.map((_, i) => row[i] ?? ""),
          assigneeCol === -1 ? "" : cleanAssignee(row[assigneeCol] ?? ""),
          ...(hasAiReads
            ? [read?.relevance ?? "", read?.relevance_reason ?? "", read?.summary ?? ""]
            : []),
          ...attributes.map((attr) => read?.attributes?.[attr] ?? ""),
        ];
      }),
    ]);

    downloadCsv(`${fileBase(sheet)}-summary.csv`, csv);
    setNotice(
      hasAiReads
        ? "Downloaded enriched summary report CSV with AI relevance, summaries, and extracted attributes."
        : "Downloaded summary report CSV with cleaned assignee names.",
    );
  }

  function exportHeatmap() {
    if (!derived) {
      setNotice("This sheet has no publication number or assignee column, so there's no heat map to export.");
      return;
    }
    const tab = crossTab(derived.records, heatAxes.rows, heatAxes.cols);
    downloadCsv(
      `${fileBase(sheet)}-heatmap-${heatAxes.rows}-x-${heatAxes.cols}.csv`.toLowerCase().replace(/\s+/g, "-"),
      crossTabCsv(tab, heatAxes.rows, heatAxes.cols),
    );
    setNotice(`Downloaded the ${heatAxes.rows} × ${heatAxes.cols} heat map — change the axes on Heat maps to export another.`);
  }

  // PA-06: Chunked batch save/upsert of parsed + AI-enriched patent records into Entopedia database
  async function saveToEntopedia() {
    if (!sheet || sheet.rows.length === 0) {
      setNotice("No patent rows available in this sheet to save.");
      return;
    }

    setSaving(true);
    setSavedStatus(null);

    try {
      // Only what the sheet (or an AI read) actually says: a missing value stays empty rather than being made
      // up. Rows without a publication number are skipped by the API and reported.
      const activeCol = sheet.headers.findIndex((h) => /active|compound|ingredient/i.test(h));
      const isoDate = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined);

      const payload = sheet.rows.map((r, i) => {
        const read = aiReads[i];
        const active =
          cellOf(r, activeCol) ||
          read?.attributes?.["Active Ingredient"] ||
          read?.attributes?.["active ingredient"] ||
          undefined;
        return {
          patentNumber: cellOf(r, columns.number),
          assignee: cleanAssignee(mainFiler(cellOf(r, columns.filer))) || undefined,
          title: cellOf(r, columns.title) || undefined,
          abstract: cellOf(r, columns.abstract) || undefined,
          filingDate: isoDate(cellOf(r, columns.date)),
          activeIngredient: active,
          summary: read?.summary,
          relevance: read?.relevance,
        };
      });

      let totalInserted = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;

      for (let i = 0; i < payload.length; i += DB_BATCH_SIZE) {
        const chunk = payload.slice(i, i + DB_BATCH_SIZE);
        const res = await clientApi<{ success: boolean; inserted: number; updated: number; skipped?: unknown[] }>(
          "/patent/upload-csv",
          {
            method: "POST",
            body: JSON.stringify({ patents: chunk }),
          },
        );
        totalInserted += res.inserted;
        totalUpdated += res.updated;
        totalSkipped += Array.isArray(res.skipped) ? res.skipped.length : 0;
      }

      setSavedStatus(
        `Saved to Entopedia: ${totalInserted} new patents inserted, ${totalUpdated} updated` +
          (totalSkipped
            ? `, ${totalSkipped} skipped (no publication number${columns.number === -1 ? ": pick that column on Set up" : ""}).`
            : "."),
      );
      setNotice("Records are now stored in the database and linked to patent landscape charts.");
    } catch (err) {
      console.warn("Save to database error:", err);
      setNotice("Failed to save to database. Ensure the backend server is running on port 4000.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-ink">Export &amp; Store</h2>
        <p className="mt-1 text-xs text-gray-600">
          Original columns untouched, everything the read produced appended
          beside them, so the file drops back into the workflow the team already
          has.
        </p>
      </section>

      <Card>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveToEntopedia}
            disabled={saving}
            className={`${primaryButton} flex items-center gap-1.5`}
          >
            <Database className="size-3.5" />
            {saving ? "Saving to Database..." : "Save to Entopedia"}
          </button>
          <button type="button" onClick={exportCsv} className={secondaryButton}>
            Download Summary Report .csv
          </button>
          <button type="button" onClick={exportHeatmap} className={secondaryButton}>
            Current heat map .csv
          </button>
          <button
            type="button"
            onClick={() =>
              setNotice("Excel export isn't available yet — use the CSV, which Excel opens directly.")
            }
            className={secondaryButton}
          >
            Enriched sheet .xlsx
          </button>
        </div>

        {savedStatus && (
          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            <span>{savedStatus}</span>
          </div>
        )}

        <p role="status" className="mt-3 text-[0.8125rem] text-gray-500">
          {notice ??
            "Added columns: assignee_clean, AI relevance & summary (when read), and one column per attribute. Ready for export and database syncing."}
        </p>
      </Card>

      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
        Export your summary CSV or click &ldquo;Save to Entopedia&rdquo; to sync records with the database before navigating away.
      </p>

      <details className="group border-t border-line pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink">
          Hosting note for whoever deploys this
        </summary>
        <div className="mt-2 space-y-1.5 text-xs text-gray-600">
          <p>
            The analyser parses sheets locally in the browser, sends batches through the backend to the AI model (Groq, set in the backend) for reading and synthesis, and upserts enriched records into Supabase when you click &ldquo;Save to Entopedia&rdquo;.
          </p>
        </div>
      </details>
    </>
  );
}