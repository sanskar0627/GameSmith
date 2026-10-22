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
    },
  },
});
