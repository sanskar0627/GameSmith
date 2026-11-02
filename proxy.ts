import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { publishedHostFrom } from "@/lib/published-origin";

/**
 * Attaches Clerk auth state to every request. It does NOT block routes.
 *
 * Authorization lives at the resource: every protected page, route handler
 * and server action calls a helper from `lib/auth.ts` (and, once games exist,
 * checks ownership of the specific game). Path matching here can drift from
 * how Next.js actually routes requests, so it is never the security boundary.
 *
 * The one split made here is by host: the content origin (published games,
 * untrusted code) only serves /b/*, without Clerk, and the app never serves
 * /b/*. app/b/.../route.ts checks the host again itself.
 */
const clerk = clerkMiddleware();
const contentHost = publishedHostFrom(process.env);

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const isBuildPath = request.nextUrl.pathname.startsWith("/b/");
  if (contentHost && request.headers.get("host") === contentHost) {
    return isBuildPath ? NextResponse.next() : notFound();
  }
  if (isBuildPath) return notFound();
  return clerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes and published builds
    "/(api|trpc)(.*)",
    "/b/(.*)",
  ],
};
