"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/system/error-state";

/** Errors inside the app keep the sidebar: only the page area is replaced. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // TODO(observability): report to Sentry.
    console.error(error);
  }, [error]);
  return <ErrorState digest={error.digest} retry={retry} homeHref="/games" />;
}
