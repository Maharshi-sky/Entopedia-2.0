import type { Metadata } from "next";
import { Suspense } from "react";
import { LockedNotice } from "@/components/dashboard/LockedNotice";

export const metadata: Metadata = {
  title: "No access · Entopedia",
};

// Where the proxy sends a user who opens a module they have no access to.
export default function LockedPage() {
  return (
    <Suspense fallback={null}>
      <LockedNotice />
    </Suspense>
  );
}
