import { THEME_STORAGE_KEY } from "./constants";

/**
 * Runs before paint: applies the saved theme so Night users never see a
 * flash of Paper. Keep in sync with resolveDark() in theme.ts.
 */
const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="night"||((t!=="paper")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
