import type { Metadata } from "next";
import { DeliverableGenerator } from "@/components/deliverables/DeliverableGenerator";

export const metadata: Metadata = {
  title: "Deliverable Generator · Entopedia",
};

export default function DeliverablesPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Deliverable Generator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select a template, preview the auto-populated output and export to PPT or PDF
        </p>
      </div>
      <DeliverableGenerator />
    </>
  );
}
