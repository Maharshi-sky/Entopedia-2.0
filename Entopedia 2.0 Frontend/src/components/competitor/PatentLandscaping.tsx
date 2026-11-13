"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Patent } from "@/data/competitors";
import { PatentImport } from "./PatentImport";
import { PatentTable } from "./PatentTable";
import { SourceBox } from "./SourceBox";
import { clientApi } from "@/lib/client-api";

function LandscapeReport() {
  return (
    <Card className="flex flex-col self-start">
      <h2 className="flex items-center gap-2 text-xs font-semibold tracking-widest text-ink uppercase">
        <FileText className="size-3.5" strokeWidth={1.75} />
        Landscape Report
      </h2>

      <div className="mt-4 border-b border-line pb-3">
        <h3 className="text-xs font-semibold text-ink">Key finding</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
          Microencapsulation of meperfluthrin (WO2025/123456, Godrej) is the
          highest-maturity pending patent (score 82). Electrostatic delivery
          (Bayer) is a device-layer threat that multiplies any active.
        </p>
      </div>
      <div className="mt-3">
        <h3 className="text-xs font-semibold text-ink">White space</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
          No filed patents in Picaridin + Card format or Nootkatone + LV format
          — immediate opportunity.
        </p>
      </div>

      <SourceBox
        sources={["USPTO", "EPO", "IP India", "CIB&RC"]}
        confidence={89}
        status="Retrieved"
      />
    </Card>
  );
}

export function PatentLandscaping({ patents: initialPatents }: { patents?: Patent[] }) {
  const [patentList, setPatentList] = useState<Patent[]>(initialPatents || []);

  useEffect(() => {
    // Agar server props se patents nahi mile ya empty hain, tabhi backend se fetch karega
    if (!initialPatents || initialPatents.length === 0) {
      async function loadLivePatents() {
        try {
          const res = await clientApi<{ data: any[] }>("/patent");
          if (res.data && res.data.length > 0) {
            const mapped: Patent[] = res.data.map((p) => ({
              id: p.publication_number || p.id,
              number: p.publication_number || p.number || p.id,
              title: p.title,
              competitor: p.filer || "Unknown Assignee",
              assignee: p.filer || "Unknown Assignee",
              filingDate: p.filing_date ? new Date(p.filing_date).toISOString().slice(0, 10) : "2024-01-01",
              filed: p.filing_date ? new Date(p.filing_date).toISOString().slice(0, 10) : "2024-01-01",
              status: p.status || "Active",
              active: p.active ?? (p.status?.toLowerCase() === "active"),
              threatScore: p.threat_score || 70,
              technology: p.technology || "Unspecified",
              maturity: p.maturity ?? p.threat_score ?? 70,
              abstract: p.abstract || p.title,
              activeIngredients: p.active_ingredients || [],
              targetPests: p.target_pests || [],
            }));
            setPatentList(mapped);
          }
        } catch (err) {
          console.warn("Could not load live patents, falling back to local dataset:", err);
        }
      }
      loadLivePatents();
    }
  }, [initialPatents]);

  return (
    <>
      <p className="text-xs text-gray-600">
        Connected patent view — auto-linked to competitors, filings and
        products. For ad-hoc analysis of your own export, use{" "}
        <Link
          href="/patent-sheet-analyser"
          className="font-semibold text-brand underline underline-offset-2"
        >
          Patent Sheet Analyser
        </Link>
      </p>

      <PatentImport />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.9fr_1fr]">
        <PatentTable patents={patentList} />
        <LandscapeReport />
      </div>
    </>
  );
}