import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Attaches Clerk auth state to every request. It does NOT block routes.
 *
 * Authorization lives at the resource: every protected page, route handler
 * and server action calls a helper from `lib/auth.ts` (and, once games exist,
 * checks ownership of the specific game). Path matching here can drift from
 * how Next.js actually routes requests, so it is never the security boundary.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
