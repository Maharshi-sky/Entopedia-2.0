"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordVisit } from "@/lib/activity-actions";

/** Tells the API which module the user opened, once per page change (the API drops repeats within 5 minutes). */
export function VisitTracker() {
  const pathname = usePathname();
  useEffect(() => {
    void recordVisit(pathname);
  }, [pathname]);
  return null;
}
