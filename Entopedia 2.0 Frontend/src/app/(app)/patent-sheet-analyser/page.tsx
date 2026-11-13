import type { Metadata } from "next";
import { PatentAnalyser } from "@/components/patent-analyser/PatentAnalyser";

export const metadata: Metadata = {
  title: "Patent Sheet Analyser · Entopedia",
};

export default function PatentSheetAnalyserPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Patent Sheet Analyser</h1>
        <p className="mt-1 text-sm text-gray-500">
          Works on the sheet you upload and nothing else. No search, no patent
          database, no feed.
        </p>
      </div>
      <PatentAnalyser />
    </>
  );
}
