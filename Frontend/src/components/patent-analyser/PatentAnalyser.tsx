"use client";

import { useMemo, useSyncExternalStore } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { LoadStep } from "./LoadStep";
import { SetupStep } from "./SetupStep";
import { ReadStep } from "./ReadStep";
import { ChartsStep } from "./ChartsStep";
import { HeatmapStep } from "./HeatmapStep";
import { StructureStep } from "./StructureStep";
import { ReadSetStep } from "./ReadSetStep";
import { ExportStep } from "./ExportStep";
import { EmptyStep } from "./EmptyStep";
import { SavedStep } from "./SavedStep";
import { StepNav } from "./StepNav";
import { deriveRecords } from "./analysis";
import { detectColumns, resolveColumns } from "./columns";
import { analyserStore as store, steps } from "./store";

const resultIntros = {
  Charts: "Where the innovation is",
  "Heat maps": "Where the white space is",
  Structure: "How the set fits together",
};

export function PatentAnalyser() {
  // Kept in a store outside this component, so steps, the loaded sheet and a read in progress
  // survive switching tabs or modules.
  const s = useSyncExternalStore(store.subscribe, store.get, () => store.initial);
  const { step, sheet, categories, attributes, aiReads } = s;
  const loaded = s.source !== null;

  const columns = useMemo(() => resolveColumns(sheet, s.columnOverrides), [sheet, s.columnOverrides]);
  const detected = useMemo(() => detectColumns(sheet.headers), [sheet]);
  const derived = useMemo(
    () => deriveRecords(sheet, columns, categories, aiReads),
    [sheet, columns, categories, aiReads],
  );

  const usable = derived.records.some(
    (r) => r.Filer !== "Unknown filer" || r.Jurisdiction !== "Unknown",
  );

  function results(view: keyof typeof resultIntros) {
    if (!usable) {
      return (
        <EmptyStep
          title={resultIntros[view]}
          description="Charts, heat maps and structure are built from the sheet's publication number, assignee, title and priority date columns."
          message={`Couldn't find a publication number or assignee column in ${sheet.name}. Pick them under Set up → Columns.`}
        />
      );
    }
    if (view === "Charts") return <ChartsStep sheet={sheet} derived={derived} />;
    if (view === "Heat maps") {
      return (
        <HeatmapStep
          sheet={sheet}
          derived={derived}
          attributes={attributes}
          hasReads={Object.keys(aiReads).length > 0}
          axes={s.heatAxes}
          onAxesChange={store.setHeatAxes}
        />
      );
    }
    return <StructureStep derived={derived} />;
  }

  // Next waits for what the following step needs; every other step can always move on.
  const nextBlocked = !loaded
    ? step === "Export" ? null : "Load a patent sheet first."
    : step === "Set up" && columns.title < 0 && columns.abstract < 0
      ? "Pick a Title or Abstract column first."
      : null;

  return (
    <>
      <TabBar tabs={steps} value={step} onChange={store.setStep} label="Analyser steps" />
      {step === "Load" ? (
        <LoadStep
          source={s.source}
          rows={sheet.rows.length}
          restored={s.restored}
          onLoad={store.loadSheet}
          onForgetReads={store.forgetSavedReads}
          onOpenSaved={() => store.setStep("Saved")}
        />
      ) : step === "Saved" ? (
        <SavedStep
          currentKey={loaded ? s.sheetKey : ""}
          savedRev={s.savedRev}
          onOpen={store.openSaved}
          onDelete={store.deleteSaved}
        />
      ) : !loaded ? (
        <EmptyStep
          title={step}
          description="Every step works on the patent sheet you load."
          message="No patent sheet is loaded yet. Go to Load and choose an .xlsx, .csv or .tsv export, or paste rows."
        />
      ) : step === "Set up" ? (
        <SetupStep
          sheet={sheet}
          columns={columns}
          detectedColumns={detected}
          onColumnChange={store.setColumn}
          categories={categories}
          onCategoriesChange={store.setCategories}
          attributes={attributes}
          onAttributesChange={store.setAttributes}
        />
      ) : step === "Read" ? (
        <ReadStep
          sheet={sheet}
          derived={derived}
          brief={s.brief}
          categories={categories}
          attributes={attributes}
          aiReads={aiReads}
          readContext={s.readContext}
          sliceOnly={s.sliceOnly}
          run={s.run}
        />
      ) : step === "Read the set" ? (
        <ReadSetStep derived={derived} preset={s.preset} ask={s.ask} />
      ) : step === "Export" ? (
        <ExportStep
          sheet={sheet}
          columns={columns}
          attributes={attributes}
          derived={usable ? derived : null}
          aiReads={aiReads}
          heatAxes={s.heatAxes}
        />
      ) : (
        results(step)
      )}
      <StepNav step={step} onChange={store.setStep} nextBlocked={nextBlocked} />
    </>
  );
}
