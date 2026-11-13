import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings · Entopedia",
};

export default function SettingsPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your profile, notifications, and security
        </p>
      </div>
      <SettingsPanel />
    </>
  );
}
