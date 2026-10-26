import type { Metadata } from "next";
import { ApiKeysSettings, type ProviderRow } from "@/components/settings/api-keys-settings";
import { PROVIDERS } from "@/lib/ai/models";
import { platformKey } from "@/lib/server/ai/access";
import { listProviderKeys } from "@/lib/server/keys";
import { ensureUser } from "@/lib/server/users";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const user = await ensureUser();
  const keys = new Map((await listProviderKeys(user.id)).map((k) => [k.provider, k]));
  // Only summaries and booleans cross to the browser, never key material.
  const rows: ProviderRow[] = PROVIDERS.map((provider) => ({
    provider,
    key: keys.get(provider) ?? null,
    platform: !!platformKey(provider),
  }));
  return <ApiKeysSettings rows={rows} />;
}
