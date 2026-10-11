"use client";

import { THEME_STORAGE_KEY } from "./constants";

/**
 * Runs before paint: applies the saved theme so Night users never see a
 * flash of Paper. Keep in sync with resolveDark() in theme.ts.
 */
const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="night"||((t!=="paper")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

/**
 * The script executes from the server HTML. When React renders this tree in
 * the browser (for example while recovering from an error), it would warn
 * that scripts rendered on the client never run, so the client copy is
 * marked inert (`text/plain`). It must be a Client Component for that
 * check to run in the browser. Pattern from the Next.js guide "Preventing
 * flash before hydration".
 */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
