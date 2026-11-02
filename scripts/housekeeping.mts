/**
 * One housekeeping pass by hand (the worker runs this every minute):
 *   npm run housekeeping
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { runHousekeeping } = await import("@/lib/server/housekeeping");
const { db } = await import("@/lib/db");
console.log(JSON.stringify(await runHousekeeping()));
await db().$client.end();
process.exit(0);
