import Link from "next/link";
import { Show, SignUpButton } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/** The page's forge action: sign up when signed out, open the app when signed in. */
export function AuthCta({ size = "lg" }: { size?: "default" | "lg" }) {
  return (
    <>
      <Show when="signed-out">
        <SignUpButton>
          <Button variant="ember" size={size}>
            Start forging <ArrowRight data-icon="inline-end" />
          </Button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link href="/games" className={buttonVariants({ variant: "ember", size })}>
          Open GameSmith <ArrowRight data-icon="inline-end" />
        </Link>
      </Show>
    </>
  );
}
