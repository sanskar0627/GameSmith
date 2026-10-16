import type { Metadata } from "next";
import { GeneralSettings } from "@/components/settings/general-settings";

export const metadata: Metadata = { title: "Settings · GameSmith" };

export default function SettingsPage() {
  return <GeneralSettings />;
}
