import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createFal } from "@ai-sdk/fal";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

import type { ModelSpec } from "./models";

/**
 * Builds AI SDK model instances for one run. The key is always passed
 * explicitly (BYOK or platform, decided by lib/server/ai/access.ts); provider
 * factories are never created without one, so nothing falls back to keys
 * found in the environment.
 */

export function chatModel(spec: ModelSpec, apiKey: string): LanguageModel {
  if (!apiKey) throw new Error("chatModel needs an API key");
  switch (spec.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(spec.apiId);
    case "openai":
      return createOpenAI({ apiKey })(spec.apiId);
    case "openrouter":
      return createOpenRouter({ apiKey, compatibility: "strict" }).chat(spec.apiId, {
        // Ask OpenRouter to report the real cost of each call (billing, Phase 6).
        usage: { include: true },
      });
  }
}

/** Fal image model for game art (agent tool, Phase 10). */
export function assetImageModel(modelId: string, apiKey: string) {
  if (!apiKey) throw new Error("assetImageModel needs an API key");
  return createFal({ apiKey }).image(modelId);
}
