"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./constants";

/**
 * Paper / Night / System theme. Stored per browser in localStorage and applied
 * as the `.dark` class on <html> before first paint (see ThemeScript), so
 * there is no flash. No dependency needed.
 */
export type ThemeChoice = "paper" | "night" | "system";

const EVENT = "gs-theme-change";

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "paper" || v === "night" ? v : "system";
  } catch {
    return "system";
  }
}

function resolveDark(choice: ThemeChoice) {
  return choice === "night" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyTheme(choice: ThemeChoice) {
  document.documentElement.classList.toggle("dark", resolveDark(choice));
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* private mode: still apply for this session */
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (read() === "system") applyTheme("system");
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  mq.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
    mq.removeEventListener("change", onSystem);
  };
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as ThemeChoice);
  return [theme, setTheme];
}
