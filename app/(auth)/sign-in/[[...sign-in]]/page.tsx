import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/auth-shell";
import { authAppearance } from "@/components/auth/clerk-appearance";

export const metadata: Metadata = { title: "Sign in · GameSmith" };

export default function SignInPage() {
  return (
    <AuthShell variant="sign-in">
      <SignIn appearance={authAppearance} fallbackRedirectUrl="/games" />
    </AuthShell>
  );
}
