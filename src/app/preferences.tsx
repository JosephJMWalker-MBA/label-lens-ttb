"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Local-only appearance and accessibility preferences: theme, font size, and a
 * reduced-motion override. Nothing is sent to a server or a third-party service;
 * the choice is persisted in localStorage and applied as attributes on the root
 * element so plain CSS drives the actual appearance.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type FontScale = "small" | "default" | "large";
export type MotionChoice = "system" | "reduce";

export interface Preferences {
  theme: ThemeChoice;
  fontScale: FontScale;
  motion: MotionChoice;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  fontScale: "default",
  motion: "system",
};

export const PREFERENCES_STORAGE_KEY = "label-lens.preferences.v1";

interface PreferencesContextValue extends Preferences {
  setTheme: (theme: ThemeChoice) => void;
  setFontScale: (scale: FontScale) => void;
  setMotion: (motion: MotionChoice) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readStored(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme: coerce(parsed.theme, ["light", "dark", "system"], "system"),
      fontScale: coerce(parsed.fontScale, ["small", "default", "large"], "default"),
      motion: coerce(parsed.motion, ["system", "reduce"], "system"),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function coerce<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** The resolved theme actually rendered (never "system"). */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/** Apply preferences to the root element as attributes read by CSS. */
export function applyPreferences(prefs: Preferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolveTheme(prefs.theme));
  root.setAttribute("data-font-scale", prefs.fontScale);
  if (prefs.motion === "reduce") root.setAttribute("data-motion", "reduce");
  else root.removeAttribute("data-motion");
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  // Load persisted preferences on mount (client only).
  useEffect(() => {
    setPrefs(readStored());
  }, []);

  // Persist and apply whenever preferences change.
  useEffect(() => {
    applyPreferences(prefs);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
      } catch {
        // storage may be unavailable (private mode); appearance still applies
      }
    }
  }, [prefs]);

  // Re-resolve the theme when the OS scheme changes and the choice is "system".
  useEffect(() => {
    if (prefs.theme !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPreferences(prefs);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...prefs,
      setTheme: (theme) => setPrefs((p) => ({ ...p, theme })),
      setFontScale: (fontScale) => setPrefs((p) => ({ ...p, fontScale })),
      setMotion: (motion) => setPrefs((p) => ({ ...p, motion })),
      reset: () => setPrefs(DEFAULT_PREFERENCES),
    }),
    [prefs],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

/**
 * Access preferences. Outside a provider it returns inert defaults so components
 * (and isolated tests) render without crashing.
 */
export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (ctx) return ctx;
  const noop = () => {};
  return {
    ...DEFAULT_PREFERENCES,
    setTheme: noop,
    setFontScale: noop,
    setMotion: noop,
    reset: noop,
  };
}

/** Whether reduced motion is currently active (OS setting or local override). */
export function useReducedMotionActive(): boolean {
  const { motion } = usePreferences();
  const [osReduce, setOsReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduce(mq.matches);
    const onChange = () => setOsReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return motion === "reduce" || osReduce;
}
