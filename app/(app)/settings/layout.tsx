import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 pt-8 pb-16 sm:px-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12">
        <aside className="md:sticky md:top-20 md:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
