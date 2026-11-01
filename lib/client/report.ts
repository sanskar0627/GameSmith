/**
 * Sends a browser-side crash to /api/errors (which reports it, see
 * lib/server/report.ts). Errors with a digest already happened on the
 * server and were reported there, so only the digest is sent.
 */
export function reportClientError(error: Error & { digest?: string }, where: string) {
  try {
    const body = JSON.stringify({
      where,
      digest: error.digest,
      name: error.digest ? undefined : error.name,
      message: error.digest ? undefined : String(error.message).slice(0, 500),
      stack: error.digest ? undefined : String(error.stack ?? "").slice(0, 4000),
      path: location.pathname,
    });
    void fetch("/api/errors", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    /* never throw from an error boundary */
  }
}
