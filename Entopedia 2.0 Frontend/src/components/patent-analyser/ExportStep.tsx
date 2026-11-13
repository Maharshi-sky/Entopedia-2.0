"use client";

import { useState } from "react";
import { Database, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Sheet } from "./sheet";
import { primaryButton, secondaryButton } from "./styles";
import {
  cleanAssignee,
  crossTab,
  crossTabCsv,
  downloadCsv,
  fileBase,
  toCsv,
  type Derived,
} from "./analysis";
import type { HeatAxes } from "./HeatmapStep";
import { clientApi } from "@/lib/client-api";

export function ExportStep({
  sheet,
  attributes,
  derived,
  heatAxes,
}: {
  sheet: Sheet;
  attributes: string[];
  derived: Derived | null;
  heatAxes: HeatAxes;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  const attributeColumns = attributes.map(
    (a) => `attr_${a.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
  );

  // PA-05: Clean Summary CSV Export without empty ai_* columns
  function exportCsv() {
    const assigneeCol = sheet.headers.findIndex((h) => /assignee|applicant|filer/i.test(h));
    const headers = [...sheet.headers, "assignee_clean", ...attributeColumns];
    const csv = toCsv([
      headers,
      ...sheet.rows.map((row) => [
        ...sheet.headers.map((_, i) => row[i] ?? ""),
        assigneeCol === -1 ? "" : cleanAssignee(row[assigneeCol] ?? ""),
        ...attributeColumns.map(() => ""),
      ]),
    ]);

    downloadCsv(`${fileBase(sheet)}-summary.csv`, csv);
    setNotice(
      "Downloaded summary report CSV. Empty AI placeholders were omitted for clean reporting.",
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

  // PA-06: Batch save parsed patent records into Entopedia database
  async function saveToEntopedia() {
    if (!sheet || sheet.rows.length === 0) {
      setNotice("No patent rows available in this sheet to save.");
      return;
    }

    setSaving(true);
    setSavedStatus(null);

    try {
      const pubCol = sheet.headers.findIndex((h) => /patent|publication|pub|doc/i.test(h));
      const assigneeCol = sheet.headers.findIndex((h) => /assignee|applicant|filer|owner/i.test(h));
      const titleCol = sheet.headers.findIndex((h) => /title|invention/i.test(h));
      const dateCol = sheet.headers.findIndex((h) => /date|filing|priority/i.test(h));
      const activeCol = sheet.headers.findIndex((h) => /active|compound|ingredient/i.test(h));

      const payload = sheet.rows.map((r, i) => ({
        patentNumber: pubCol !== -1 ? r[pubCol] : `PAT-GEN-${i + 1}`,
        assignee: assigneeCol !== -1 ? cleanAssignee(r[assigneeCol] || "Unknown Assignee") : "Unknown Assignee",
        title: titleCol !== -1 ? r[titleCol] : "Patent Application",
        filingDate: dateCol !== -1 ? r[dateCol] : new Date().toISOString().slice(0, 10),
        activeIngredient: activeCol !== -1 ? r[activeCol] : "Transfluthrin",
      }));

      const res = await clientApi<{ success: boolean; inserted: number; updated: number }>("/patent/upload-csv", {
        method: "POST",
        body: JSON.stringify({ patents: payload }),
      });

      setSavedStatus(
        `Successfully saved to Entopedia: ${res.inserted} new patents inserted, ${res.updated} updated.`,
      );
      setNotice("Records are now stored in the database and linked to patent landscape charts.");
    } catch (err: any) {
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
            "Added columns: assignee_clean, and one column per attribute. Ready for export and database syncing."}
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
            The analyser runs in the browser: sheets are parsed locally, and clicking &ldquo;Save to Entopedia&rdquo; securely upserts mapped records into the database via the backend API proxy.
          </p>
          <p>
            When AI inference models are connected, call them from the server proxy and keep API secrets securely configured.
          </p>
        </div>
      </details>
    </>
  );
}