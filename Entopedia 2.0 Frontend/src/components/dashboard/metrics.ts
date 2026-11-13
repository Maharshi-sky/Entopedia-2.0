import { Activity, FileText, Radio, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Metric } from "@/data/dashboard";

export type { Metric };

// The data names each metric's icon; this maps the names to icons.
export const metricIcons: Record<Metric["icon"], LucideIcon> = {
  alert: TriangleAlert,
  claims: FileText,
  news: Radio,
  launches: Activity,
};
