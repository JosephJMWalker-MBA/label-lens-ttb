"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { useOnboarding } from "./onboarding-context";

/**
 * A short, skippable, keyboard- and screen-reader-accessible first-use
 * introduction. It is a modal dialog (role="dialog", aria-modal) with a focus
 * trap and Escape-to-skip. It never blocks the primary upload beyond a single
 * dismissal, never stores uploaded content, and is closed by the workspace as
 * soon as a result is ready.
 */

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Upload a wine label",
    body: "Choose one PNG or JPEG of a wine label, or load the bundled sample. The image is processed for this check only and is not stored.",
  },
  {
    title: "Label Lens reads the artwork",
    body: "Local OCR reads brand and alcohol evidence directly from the label image.",
  },
  {
    title: "Application facts stay separate",
    body: "The brand and alcohol values you enter are your application facts. They are compared against the evidence, never mixed into what OCR read.",
  },
  {
    title: "Uncertainty is shown, not hidden",
    body: "When evidence is weak or competing, the result says so plainly instead of guessing a confident answer.",
  },
  {
    title: "Preparation and review only",
    body: "The result supports preparation and review. It is not TTB approval and issues no approve-or-reject decision.",
  },
];

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function OnboardingDialog() {
  const { isOpen, close } = useOnboarding();
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Reset to the first step and capture the element to restore focus to on close.
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      returnFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    }
  }, [isOpen]);

  // Move focus into the dialog when it opens; restore it when it closes.
  useEffect(() => {
    if (!isOpen) {
      returnFocusRef.current?.focus?.();
      return;
    }
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [isOpen]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [close],
  );

  if (!isOpen) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xl"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Introduction · Step {step + 1} of {STEPS.length}
        </p>
        <h2
          id="onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 text-xl font-semibold focus-visible:outline-none"
        >
          {current.title}
        </h2>
        <p id="onboarding-body" className="mt-2 text-sm text-foreground">
          {current.body}
        </p>

        <ol className="mt-4 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <li
              key={i}
              className={"h-1.5 flex-1 rounded-full " + (i <= step ? "bg-primary" : "bg-muted")}
            />
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={close}>
            Skip introduction
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Back
              </Button>
            ) : null}
            {isLast ? (
              <Button type="button" size="sm" onClick={close}>
                Start using Label Lens
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => setStep((s) => s + 1)}>
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
