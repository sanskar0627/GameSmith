import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { parseKeyring } from "@/lib/crypto/keyring";
import { DEV_DATABASE_URL } from "@/lib/db/dev-url";

/**
 * Server environment, validated on first use (not at import time, so
 * `next build` works without production secrets present).
 *
 * Outside production, a missing DATABASE_URL falls back to the local
 * compose database, and a missing KEY_ENCRYPTION_KEYS to a fixed dev key,
 * each with a warning. In production both are hard errors.
 *
 * Platform AI keys use PLATFORM_* names on purpose: the AI SDK reads
 * ANTHROPIC_API_KEY etc. implicitly when no key is passed, and a BYOK run
 * must never fall back to the platform's key by accident.
 */
const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is not set. Add it to .env.local (see .env.example)." })
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must be a postgres:// URL"),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
  KEY_ENCRYPTION_KEYS: z
    .string({ error: "KEY_ENCRYPTION_KEYS is not set. Generate one (see README) and add it to the environment." })
    .superRefine((v, ctx) => {
      try {
        parseKeyring(v);
      } catch (error) {
        ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid keyring" });
      }
    }),
  PLATFORM_ANTHROPIC_API_KEY: optionalSecret,
  PLATFORM_OPENAI_API_KEY: optionalSecret,
  PLATFORM_OPENROUTER_API_KEY: optionalSecret,
  PLATFORM_FAL_KEY: optionalSecret,
  // Payments (Polar). All optional: without them the billing page works but
  // checkout says payments aren't set up.
  POLAR_ACCESS_TOKEN: optionalSecret,
  POLAR_WEBHOOK_SECRET: optionalSecret,
  POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),
  POLAR_PRODUCT_FORGE: optionalSecret,
  POLAR_PRODUCT_STUDIO: optionalSecret,
  POLAR_PRODUCT_PACK_5K: optionalSecret,
  POLAR_PRODUCT_PACK_25K: optionalSecret,
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
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

  if (!input.KEY_ENCRYPTION_KEYS && input.NODE_ENV !== "production") {
    input.KEY_ENCRYPTION_KEYS = DEV_KEYRING;
    console.warn(
      "[env] KEY_ENCRYPTION_KEYS is not set; using a fixed development key. Saved API keys are NOT protected. Set it in .env.local.",
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

/** Deterministic, public, development-only keyring. Never accepted in production. */
const DEV_KEYRING = `0:${createHash("sha256").update("gamesmith-development-keyring").digest("base64")}`;
