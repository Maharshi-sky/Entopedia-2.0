import type { Metadata } from "next";
import { PestVision } from "@/components/pest-vision/PestVision";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Pest Vision · Entopedia",
};

// The header lives in PestVision because the view tabs sit beside the title.
export default async function PestVisionPage() {
  const pests = await api.pests();
  return <PestVision pests={pests} />;
}
