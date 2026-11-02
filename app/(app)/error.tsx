"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client/report";
import { ErrorState } from "@/components/system/error-state";

/** Errors inside the app keep the sidebar: only the page area is replaced. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, "app");
  }, [error]);
  return <ErrorState digest={error.digest} retry={retry} homeHref="/games" />;
}
