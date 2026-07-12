"use client";

import { Settings2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { usePreferences, type FontScale, type ThemeChoice } from "@/app/preferences";

/**
 * One compact, keyboard- and screen-reader-accessible settings surface for
 * appearance and accessibility preferences: theme, text size, reduced motion,
 * reset, and replaying the introduction. It is a button that toggles a labelled
 * panel of native radio groups and checkboxes (inherently operable), closing on
 * Escape or an outside click and returning focus to the trigger.
 */

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const FONT_OPTIONS: { value: FontScale; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
];

export function AppearanceSettings() {
  const prefs = usePreferences();
  const { openIntro } = useOnboarding();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const closePanel = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Move focus to the first control when the panel opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings2 aria-hidden="true" className="h-4 w-4" />
        Display settings
      </Button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Display and accessibility settings"
          className="absolute right-0 z-40 mt-2 w-72 rounded-md border border-border bg-card p-4 text-card-foreground shadow-lg"
          onKeyDown={(event) => {
            if (event.key === "Escape") closePanel(true);
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">Theme</legend>
            {THEME_OPTIONS.map((opt, i) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <input
                  ref={i === 0 ? firstFieldRef : undefined}
                  type="radio"
                  name="ll-theme"
                  value={opt.value}
                  checked={prefs.theme === opt.value}
                  onChange={() => prefs.setTheme(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </fieldset>

          <fieldset className="mt-4 flex flex-col gap-2">
            <legend className="text-sm font-semibold">Text size</legend>
            {FONT_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="ll-font-scale"
                  value={opt.value}
                  checked={prefs.fontScale === opt.value}
                  onChange={() => prefs.setFontScale(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </fieldset>

          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.motion === "reduce"}
                onChange={(event) => prefs.setMotion(event.target.checked ? "reduce" : "system")}
              />
              Reduce motion
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              When off, your system’s reduced-motion setting is respected.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                closePanel(false);
                openIntro();
              }}
            >
              View introduction again
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => prefs.reset()}>
              Reset preferences
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
