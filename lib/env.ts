import "server-only";

import { z } from "zod";

/**
 * Server environment, validated on first use (not at import time, so
 * `next build` works without production secrets present).
 */
const schema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is not set. Copy .env.example to .env.local." })
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must be a postgres:// URL"),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
