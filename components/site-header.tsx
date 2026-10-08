import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Wordmark } from "@/components/brand/wordmark";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Public header (landing, marketing). The signed-in app gets its own shell.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-8">
        <Link href="/" aria-label="GameSmith home" className="rounded-sm">
          <Wordmark height={15} />
        </Link>
        <nav className="flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton>
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton>
              <Button variant="ember" size="sm">
                Start forging
              </Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/games" className={buttonVariants({ variant: "ember", size: "sm" })}>
              Open GameSmith
            </Link>
            <UserButton />
          </Show>
        </nav>
      </div>
    </header>
  );
}
