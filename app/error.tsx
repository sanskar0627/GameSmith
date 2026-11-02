"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client/report";
import { ErrorState } from "@/components/system/error-state";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, "root");
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <ErrorState digest={error.digest} retry={retry} />
    </main>
  );
}
