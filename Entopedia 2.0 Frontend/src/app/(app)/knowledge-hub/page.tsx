import type { Metadata } from "next";
import { KnowledgeHub } from "@/components/knowledge/KnowledgeHub";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Knowledge Hub & R&D · Entopedia",
};

export default async function KnowledgeHubPage() {
  const [queue, savedAssets, suggestedQuestions] = await Promise.all([
    api.knowledgeQueue(),
    api.knowledgeAssets(),
    api.knowledgeQuestions(),
  ]);
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Knowledge Hub &amp; R&amp;D</h1>
        <p className="mt-1 text-sm text-gray-500">
          Central intelligence repository and automated innovation workflows
        </p>
      </div>
      <KnowledgeHub queue={queue} savedAssets={savedAssets} suggestedQuestions={suggestedQuestions} />
    </>
  );
}
