import type { NextConfig } from "next";

/** Headers for the app's own pages. Published builds (/b/*) set their own. */
const appHeaders = [
  // Only the app frames itself (the showcase demo on /play); never other sites.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  logging: {
    // Next logs every Server Function call with its arguments in development.
    // saveKeyAction receives a raw API key, so keep these out of the terminal.
    serverFunctions: false,
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/((?!b/).*)", headers: appHeaders }];
  },
};

export default nextConfig;
