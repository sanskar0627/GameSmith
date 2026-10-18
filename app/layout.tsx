import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import type { Viewport } from "next";
import { Geist, Geist_Mono, Geist_Pixel, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme/theme-script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial display face for headlines and poetic moments.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

// Pixel face for micro-labels, chips and numerals. Echoes the logo wordmark.
const geistPixel = Geist_Pixel({
  variable: "--font-geist-pixel",
  subsets: ["latin"],
});

const DESCRIPTION = "Describe a game in a sentence. GameSmith's agent designs it, builds it in real code, and hands you something to play.";

export const metadata: Metadata = {
  // TODO(deploy): set NEXT_PUBLIC_APP_URL so share images get absolute URLs.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "GameSmith: describe a world, we'll forge it", template: "%s · GameSmith" },
  description: DESCRIPTION,
  applicationName: "GameSmith",
  openGraph: { type: "website", siteName: "GameSmith", title: "GameSmith", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "GameSmith", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f4ea" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // ThemeScript sets the `dark` class before hydration.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${geistPixel.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        {/* First tab stop on every page. Targets the page's <main id="main">. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <ClerkProvider
          appearance={{ theme: shadcn }}
          localization={{
            signIn: {
              start: {
                title: "Sign in",
                subtitle: "Pick up where you left off.",
              },
            },
            signUp: {
              start: {
                title: "Create your account",
                subtitle: "Free to start. No game engine required.",
              },
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}