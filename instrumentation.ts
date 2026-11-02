import type { Instrumentation } from "next";

/**
 * Server-side error hook (Next.js instrumentation): every uncaught error in
 * a page, route handler or server action is reported once, with the route
 * but none of the request's data.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/server/report");
  await reportError(error, {
    where: "request",
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    kind: context.routeType,
    digest: (error as { digest?: string }).digest,
  });
};
