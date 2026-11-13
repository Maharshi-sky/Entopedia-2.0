"use client";

import { useMemo, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { LoadStep } from "./LoadStep";
import { SetupStep } from "./SetupStep";
import { ReadStep } from "./ReadStep";
import { ChartsStep } from "./ChartsStep";
import { HeatmapStep, type HeatAxes } from "./HeatmapStep";
import { StructureStep } from "./StructureStep";
import { ReadSetStep } from "./ReadSetStep";
import { ExportStep } from "./ExportStep";
import { EmptyStep } from "./EmptyStep";
import { deriveRecords } from "./analysis";
import { workedExample } from "./sheet";

const steps = [
  "Load",
  "Set up",
  "Read",
  "Charts",
  "Heat maps",
  "Structure",
  "Read the set",
  "Export",
] as const;
type Step = (typeof steps)[number];

const resultIntros = {
  Charts: "Where the innovation is",
  "Heat maps": "Where the white space is",
  Structure: "How the set fits together",
};

export function PatentAnalyser() {
  const [step, setStep] = useState<Step>("Load");
  // The loaded sheet and the set-up lists are shared by every step.
  const [sheet, setSheet] = useState(workedExample);
  const [categories, setCategories] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<string[]>([]);
  // Kept here so Export can download whichever heat map is on screen.
  const [heatAxes, setHeatAxes] = useState<HeatAxes>({ rows: "Filer", cols: "Technology" });

  const derived = useMemo(() => deriveRecords(sheet, categories), [sheet, categories]);
  // Without a publication number or assignee column there's nothing to chart.
  const usable = derived.records.some(
    (r) => r.Filer !== "Unknown filer" || r.Jurisdiction !== "Unknown",
  );

  function results(view: keyof typeof resultIntros) {
    if (!usable) {
      return (
        <EmptyStep
          title={resultIntros[view]}
          description="Charts, heat maps and structure are built from the sheet's publication number, assignee, title and priority date columns."
          message={`Couldn't find a publication number or assignee column in ${sheet.name}. Load a sheet that has them, or rename the headers.`}
        />
      );
    }
    if (view === "Charts") return <ChartsStep sheet={sheet} derived={derived} />;
    if (view === "Heat maps") {
      return (
        <HeatmapStep sheet={sheet} derived={derived} axes={heatAxes} onAxesChange={setHeatAxes} />
      );
    }
    return <StructureStep derived={derived} />;
  }

  return (
    <>
      <TabBar tabs={steps} value={step} onChange={setStep} label="Analyser steps" />
      {step === "Load" ? (
        <LoadStep onLoad={setSheet} />
      ) : step === "Set up" ? (
        <SetupStep
          sheet={sheet}
          categories={categories}
          onCategoriesChange={setCategories}
          attributes={attributes}
          onAttributesChange={setAttributes}
        />
      ) : step === "Read" ? (
        <ReadStep sheet={sheet} />
      ) : step === "Read the set" ? (
        <ReadSetStep />
      ) : step === "Export" ? (
        <ExportStep
          sheet={sheet}
          attributes={attributes}
          derived={usable ? derived : null}
          heatAxes={heatAxes}
        />
      ) : (
        results(step)
      )}
    </>
  );
}
