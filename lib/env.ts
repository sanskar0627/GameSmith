import "server-only";

import { z } from "zod";

import { DEV_DATABASE_URL } from "@/lib/db/dev-url";

/**
 * Server environment, validated on first use (not at import time, so
 * `next build` works without production secrets present).
 *
 * Outside production, a missing DATABASE_URL falls back to the local
 * compose database with a warning. In production it is a hard error.
 */
const schema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is not set. Add it to .env.local (see .env.example)." })
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must be a postgres:// URL"),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const input: Record<string, string | undefined> = { ...process.env };
  if (!input.DATABASE_URL && input.NODE_ENV !== "production") {
    input.DATABASE_URL = DEV_DATABASE_URL;
    console.warn(
      "[env] DATABASE_URL is not set; using the local compose database. Add DATABASE_URL to .env.local to silence this.",
    );
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
