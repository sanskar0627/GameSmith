import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/auth-shell";
import { authAppearance } from "@/components/auth/clerk-appearance";

export const metadata: Metadata = { title: "Create account · GameSmith" };

export default function SignUpPage() {
  return (
    <AuthShell variant="sign-up">
      <SignUp appearance={authAppearance} fallbackRedirectUrl="/games" />
    </AuthShell>
  );
}
