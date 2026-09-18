"use client";

import { useSyncExternalStore } from "react";

/**
 * Light / dark / system, in that order (JSV2S1160).
 *
 * Three states rather than two, because "follow the OS" is a real preference
 * and a two-way switch silently destroys it the first time it is touched.
 *
 * The choice is stamped on `<html data-theme>`, which `globals.css` reads.
 * System stamps nothing and lets the media query decide.
 */

const KEY = "jobscan-theme";
type Theme = "light" | "dark" | "system";

const NEXT: Record<Theme, Theme> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const LABEL: Record<Theme, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

const ICON: Record<Theme, string> = {
  system: "◐",
  light: "☀",
  dark: "☾",
};

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/*
 * The stored theme is external state, not React state, so it is read through
 * `useSyncExternalStore` rather than copied into `useState` inside an effect.
 * That keeps the server render ("system", the only thing the server can know)
 * and the client render reconciled by React itself, instead of by a
 * setState-on-mount that would cascade a second render on every page.
 */
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Private browsing, or storage disabled.
  }
  return "system";
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changing the theme counts as a change here too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // The theme still applies for this page; only the memory of it is lost.
  }
  applyTheme(theme);
  for (const listener of listeners) listener();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  return (
    <button
      type="button"
      onClick={() => write(NEXT[theme])}
      title={`Theme: ${LABEL[theme]} — click to change`}
      aria-label={`Theme: ${LABEL[theme]}`}
      className="flex items-center gap-1.5 rounded-md border border-line-strong px-2 py-1 text-[11px] text-muted hover:bg-surface-muted hover:text-foreground"
    >
      <span>{ICON[theme]}</span>
      <span>{LABEL[theme]}</span>
    </button>
  );
}

/**
 * Applied before first paint, so a dark-theme user never sees a white flash.
 *
 * Inline and synchronous by necessity: anything deferred runs after the browser
 * has already painted the default, which is the flash this exists to prevent.
 */
export const THEME_SCRIPT = `
(function(){try{
  var t = localStorage.getItem(${JSON.stringify(KEY)});
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
}catch(e){}})();
`;
