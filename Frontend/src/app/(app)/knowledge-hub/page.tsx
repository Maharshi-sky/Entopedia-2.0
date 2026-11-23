import type { Metadata } from "next";
import { KnowledgeHub } from "@/components/knowledge/KnowledgeHub";

export const metadata: Metadata = {
  title: "Knowledge Hub & R&D · Entopedia",
};

// The documents are read in the browser with the user's own session (see KnowledgeHub).
export default function KnowledgeHubPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Knowledge Hub &amp; R&amp;D</h1>
        <p className="mt-1 text-sm text-gray-500">
          Central intelligence repository and automated innovation workflows
        </p>
      </div>
      <KnowledgeHub />
    </>
  );
}
