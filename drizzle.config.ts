import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

import { DEV_DATABASE_URL } from "./lib/db/dev-url";

// Load .env.local (and friends) the same way Next.js does.
loadEnvConfig(process.cwd());

let url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is not set.");
  }
  url = DEV_DATABASE_URL;
  console.warn(`[drizzle] DATABASE_URL is not set; using the local compose database (${url.replace(/:[^:@/]+@/, ":***@")}).`);
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
