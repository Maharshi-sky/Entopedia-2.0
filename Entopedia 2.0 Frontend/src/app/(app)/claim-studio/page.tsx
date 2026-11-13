import type { Metadata } from "next";
import { ClaimStudio } from "@/components/claims/ClaimStudio";

export const metadata: Metadata = {
  title: "Claim Studio AI · Entopedia",
};

export default function ClaimStudioPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-[#1C1B18]">Claim Studio AI</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate, validate, and discover novel product claims powered by global
          intelligence
        </p>
      </div>
      <ClaimStudio />
    </>
  );
}
