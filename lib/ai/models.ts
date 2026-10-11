/**
 * Model catalog. Safe to import from client components: no secrets here.
 *
 * Prices are list prices in micro-USD per million tokens (integers, so
 * billing math in Phase 6 never touches floats). Review them in every PR
 * that edits this file; sources are noted per provider.
 */

export const PROVIDERS = ["anthropic", "openai", "openrouter", "fal"] as const;
export type ProviderId = (typeof PROVIDERS)[number];
/** Providers that run the coding agent. Fal makes game assets, not chat. */
export type ChatProviderId = Exclude<ProviderId, "fal">;

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  role: "chat" | "assets";
  /** Where users create a key. */
  keysUrl: string;
};

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = {
  anthropic: { id: "anthropic", label: "Anthropic", role: "chat", keysUrl: "https://platform.claude.com/settings/keys" },
  openai: { id: "openai", label: "OpenAI", role: "chat", keysUrl: "https://platform.openai.com/api-keys" },
  openrouter: { id: "openrouter", label: "OpenRouter", role: "chat", keysUrl: "https://openrouter.ai/settings/keys" },
  fal: { id: "fal", label: "Fal", role: "assets", keysUrl: "https://fal.ai/dashboard/keys" },
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

/** $ per million tokens, as integer micro-USD. */
const usd = (dollars: number) => Math.round(dollars * 1_000_000);

export type ModelSpec = {
  /** Catalog id stored on games and runs: `<provider>/<provider model id>`. */
  id: string;
  provider: ChatProviderId;
  /** The id sent to the provider API. */
  apiId: string;
  label: string;
  blurb: string;
  contextWindow: number;
  maxOutput: number;
  /** micro-USD per million tokens. */
  price: { input: number; output: number };
  /** Higher prices once a prompt exceeds `above` input tokens. */
  longContext?: { above: number; input: number; output: number };
  vision: boolean;
  /** Offered on platform keys and paid with sparks. Otherwise BYOK only. */
  credits: boolean;
};

export const MODELS: readonly ModelSpec[] = [
  // Anthropic. Source: platform.claude.com/docs/en/models/overview and /about-claude/pricing (checked 2026-10-10).
  {
    id: "anthropic/claude-sonnet-5-5",
    provider: "anthropic",
    apiId: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    blurb: "Balanced. The default for building games.",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    price: { input: usd(2), output: usd(10) },
    vision: true,
    credits: true,
  },
  {
    id: "anthropic/claude-opus-5-5",
    provider: "anthropic",
    apiId: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    blurb: "Strongest reasoning for big, tricky games.",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    price: { input: usd(4), output: usd(20) },
    vision: true,
    credits: true,
  },
  {
    id: "anthropic/claude-haiku-5-5",
    provider: "anthropic",
    apiId: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    blurb: "Fast and cheap for small tweaks.",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    price: { input: usd(0.1), output: usd(0.5) },
    longContext: { above: 100_000, input: usd(0.5), output: usd(2.5) },
    vision: true,
    credits: true,
  },
  {
    id: "anthropic/claude-fable-5-1",
    provider: "anthropic",
    apiId: "claude-fable-5-1",
    label: "Claude Fable 5.1",
    blurb: "Top tier. Bring your own Anthropic key.",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    price: { input: usd(10), output: usd(50) },
    vision: true,
    credits: false,
  },
  // OpenAI. Source: developers.openai.com/api/docs/models and /pricing (checked 2026-10-10).
  // The long-context threshold (272K) is not on the pricing page; it is taken
  // from OpenAI's changelog as reported by third parties. Confirm before Phase 6.
  {
    id: "openai/gpt-6.1-sol",
    provider: "openai",
    apiId: "gpt-6.1-sol",
    label: "GPT-6.1 Sol",
    blurb: "OpenAI's balanced flagship.",
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    price: { input: usd(2), output: usd(10) },
    longContext: { above: 272_000, input: usd(4), output: usd(15) },
    vision: true,
    credits: true,
  },
  {
    id: "openai/gpt-6-luna",
    provider: "openai",
    apiId: "gpt-6-luna",
    label: "GPT-6 Luna",
    blurb: "Fast and cheap.",
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    price: { input: usd(0.1), output: usd(0.5) },
    longContext: { above: 272_000, input: usd(0.2), output: usd(0.75) },
    vision: true,
    credits: true,
  },
  {
    id: "openai/gpt-6-astra",
    provider: "openai",
    apiId: "gpt-6-astra",
    label: "GPT-6 Astra",
    blurb: "Top tier. Bring your own OpenAI key.",
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    price: { input: usd(10), output: usd(50) },
    longContext: { above: 272_000, input: usd(20), output: usd(75) },
    vision: true,
    credits: false,
  },
  // OpenRouter. Source: openrouter.ai/api/v1/models/<id>/endpoints (checked 2026-10-10).
  // Prices vary by upstream; these are the list prices. OpenRouter reports the
  // real cost per call, which Phase 6 settles against.
  {
    id: "openrouter/deepseek/deepseek-v4.1-flash",
    provider: "openrouter",
    apiId: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    blurb: "Open weights, very cheap. Via OpenRouter.",
    contextWindow: 1_048_576,
    maxOutput: 64_000,
    price: { input: usd(0.3), output: usd(1.2) },
    vision: false,
    credits: true,
  },
  {
    id: "openrouter/x-ai/grok-4.7",
    provider: "openrouter",
    apiId: "x-ai/grok-4.7",
    label: "Grok 4.7",
    blurb: "xAI's model. Via OpenRouter.",
    contextWindow: 500_000,
    maxOutput: 64_000,
    price: { input: usd(2), output: usd(6) },
    vision: false,
    credits: true,
  },
];

export const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-5-5";

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string | null | undefined): ModelSpec | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function isModelId(value: unknown): value is string {
  return typeof value === "string" && BY_ID.has(value);
}

/** A game's model, falling back to the default when unset or retired from the catalog. */
export function modelOrDefault(id: string | null | undefined): ModelSpec {
  return getModel(id) ?? BY_ID.get(DEFAULT_MODEL_ID)!;
}

/** How a model can be used by a given user right now. */
export type ModelAccess =
  | { kind: "byok" }
  | { kind: "credits" }
  | { kind: "locked"; reason: "needs-key" | "platform-unavailable" };

/** What the model picker needs. Serializable, computed on the server. */
export type ModelOption = {
  id: string;
  provider: ChatProviderId;
  label: string;
  blurb: string;
  access: ModelAccess;
};

/**
 * The model to preselect: `preferred` when the user can run it, otherwise
 * the default, otherwise the first usable option. Falls back to `preferred`
 * (or the default) when nothing is usable, so the picker still shows a choice.
 */
export function pickInitialModel(options: ModelOption[], preferred?: string | null): string {
  const usable = (id: string | null | undefined) =>
    options.find((o) => o.id === id && o.access.kind !== "locked")?.id;
  return (
    usable(preferred) ??
    usable(DEFAULT_MODEL_ID) ??
    options.find((o) => o.access.kind !== "locked")?.id ??
    getModel(preferred)?.id ??
    DEFAULT_MODEL_ID
  );
}
