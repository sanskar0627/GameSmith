"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/system/error-state";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // TODO(observability): report to Sentry.
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <ErrorState digest={error.digest} retry={retry} />
    </main>
  );
}
