import type { Metadata } from "next";
import { ClaimsEvidence } from "@/components/claims/ClaimsEvidence";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Claims Evidence · Entopedia",
};

export default async function ClaimsEvidencePage() {
  const claims = await api.claimsEvidence();
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Claims Evidence</h1>
        <p className="mt-1 text-sm text-gray-500">
          Claim × Pest × Format × Market substantiation matrix with reverse
          traceability
        </p>
      </div>
      <ClaimsEvidence claims={claims} />
    </>
  );
}
