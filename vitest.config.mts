import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";
import { defineConfig } from "vitest/config";

// Loads .env.test / .env.test.local (Next.js rules: .env.local is skipped in test).
nextEnv.loadEnvConfig(process.cwd());

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://gamesmith:gamesmith@localhost:5432/gamesmith_test";
// Visible to globalSetup (main process) as well as to the test workers below.
process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` throws outside React Server Components; tests run in plain Node.
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    globalSetup: ["./tests/support/global-setup.ts"],
    setupFiles: ["./tests/support/setup.ts"],
    // Tests share one database, so run files one at a time.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      TEST_DATABASE_URL,
      // Test-only keyring (two versions, so rotation is exercised). Not a secret.
      KEY_ENCRYPTION_KEYS: `2:${Buffer.alloc(32, 2).toString("base64")},1:${Buffer.alloc(32, 1).toString("base64")}`,
      // Platform keys are opted into per test with vi.stubEnv.
      PLATFORM_ANTHROPIC_API_KEY: "",
      PLATFORM_OPENAI_API_KEY: "",
      PLATFORM_OPENROUTER_API_KEY: "",
      PLATFORM_FAL_KEY: "",
      // Polar: fake product ids and a real-format webhook secret for signed test deliveries.
      POLAR_ACCESS_TOKEN: "",
      POLAR_WEBHOOK_SECRET: `whsec_${Buffer.alloc(24, 7).toString("base64")}`,
      POLAR_PRODUCT_FORGE: "prod_forge",
      POLAR_PRODUCT_STUDIO: "prod_studio",
      POLAR_PRODUCT_PACK_5K: "prod_pack_5k",
      POLAR_PRODUCT_PACK_25K: "prod_pack_25k",
    },
  },
});
