import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import type { Viewport } from "next";
import { Geist, Geist_Mono, Geist_Pixel, Instrument_Serif } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "GameSmith",
  description: "Describe a game. GameSmith forges it.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${geistPixel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
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