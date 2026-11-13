"use client";

import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import type { Active, Registration } from "@/data/regulatory";
import { ActivesWatch } from "./ActivesWatch";
import { RegistrationMonitor } from "./RegistrationMonitor";

const tabs = ["Actives Watch", "Registration Monitor"] as const;

export function RegulatoryWorkspace({
  actives,
  registrations,
}: {
  actives: Active[];
  registrations: Registration[];
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Actives Watch");

  return (
    <>
      <TabBar tabs={tabs} value={tab} onChange={setTab} label="Regulatory views" />
      {tab === "Actives Watch" ? (
        <ActivesWatch actives={actives} />
      ) : (
        <RegistrationMonitor filings={registrations} />
      )}
    </>
  );
}
