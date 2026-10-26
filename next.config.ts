import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // Next logs every Server Function call with its arguments in development.
    // saveKeyAction receives a raw API key, so keep these out of the terminal.
    serverFunctions: false,
  },
};

export default nextConfig;
