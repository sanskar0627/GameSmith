import "server-only";

import { isUsableKey, type ProviderKeySummary } from "@/lib/ai/keys";
import { getModel, MODELS, type ModelAccess, type ModelOption, type ModelSpec, type ProviderId } from "@/lib/ai/models";
import { db, type Executor } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { listProviderKeys, readProviderKey } from "@/lib/server/keys";

/**
 * Who pays for a model call. The rule (docs/architecture.md 2.4):
 * 1. The user's own enabled key for that provider: BYOK, 0 sparks.
 * 2. Otherwise platform keys and sparks, only for catalog models marked
 *    `credits` and only when the platform key for that provider is set.
 * 3. Otherwise the model is locked until the user adds a key.
 */

export function platformKey(provider: ProviderId): string | undefined {
  const env = serverEnv();
  switch (provider) {
    case "anthropic":
      return env.PLATFORM_ANTHROPIC_API_KEY;
    case "openai":
      return env.PLATFORM_OPENAI_API_KEY;
    case "openrouter":
      return env.PLATFORM_OPENROUTER_API_KEY;
    case "fal":
      return env.PLATFORM_FAL_KEY;
  }
}

/** Pure decision, shared by the picker and the run resolver. */
export function decideAccess(
  spec: ModelSpec,
  savedKey: ProviderKeySummary | undefined,
  platformAvailable: boolean,
): ModelAccess {
  if (isUsableKey(savedKey)) return { kind: "byok" };
  if (spec.credits && platformAvailable) return { kind: "credits" };
  return { kind: "locked", reason: spec.credits ? "platform-unavailable" : "needs-key" };
}

export async function listModelOptions(userId: string, database: Executor = db()): Promise<ModelOption[]> {
  const keys = new Map((await listProviderKeys(userId, database)).map((k) => [k.provider, k]));
  return MODELS.map((spec) => ({
    id: spec.id,
    provider: spec.provider,
    label: spec.label,
    blurb: spec.blurb,
    access: decideAccess(spec, keys.get(spec.provider), !!platformKey(spec.provider)),
  }));
}

export type RunCredentials =
  | { mode: "byok"; spec: ModelSpec; apiKey: string }
  | { mode: "credits"; spec: ModelSpec; apiKey: string }
  | { mode: "locked"; spec: ModelSpec; reason: "needs-key" | "platform-unavailable" }
  | { mode: "unknown-model" };

/**
 * Credentials for one agent run (used by the worker, Phase 9). The user's key
 * is decrypted here and handed straight to lib/ai/providers.ts.
 */
export async function resolveRunCredentials(
  userId: string,
  modelId: string,
  database: Executor = db(),
): Promise<RunCredentials> {
  const spec = getModel(modelId);
  if (!spec) return { mode: "unknown-model" };

  const own = await readProviderKey(userId, spec.provider, database);
  if (own) return { mode: "byok", spec, apiKey: own };

  const platform = platformKey(spec.provider);
  if (spec.credits && platform) return { mode: "credits", spec, apiKey: platform };
  return { mode: "locked", spec, reason: spec.credits ? "platform-unavailable" : "needs-key" };
}
