import { auth } from "@clerk/nextjs/server";

/**
 * Server-side auth helpers. Use these at the top of every protected
 * page, route handler and server action. They are the security boundary;
 * `proxy.ts` is not.
 */

export type AuthContext = {
  userId: string;
  orgId: string | null;
};

/** For pages and layouts: redirects signed-out users to sign-in. */
export async function requireUser(): Promise<AuthContext> {
  const { userId, orgId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }
  return { userId, orgId: orgId ?? null };
}

/** Thrown by `requireApiUser` so route handlers can map it to a 401. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** For route handlers and server actions: throws instead of redirecting. */
export async function requireApiUser(): Promise<AuthContext> {
  const { userId, orgId } = await auth();
  if (!userId) {
    throw new UnauthorizedError();
  }
  return { userId, orgId: orgId ?? null };
}
