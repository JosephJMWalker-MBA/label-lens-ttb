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
    title: "Upload label panels and record seller evidence",
    body: "Add artwork for front, back, and additional panels. Record your declared facts and mark evidence locations directly on your label artwork.",
  },
  {
    title: "Machine reads artwork independently",
    body: "OCR and visual analysis inspect panel artwork for brand and alcohol evidence. Machine observations preserve uncertainty and never overwrite seller evidence.",
  },
  {
    title: "Submit to internal human review queue",
    body: "When ready, submit your package record, seller evidence, artwork images, and machine observations to the internal review queue, where human reviewers remain authoritative.",
  },
  {
    title: "Preparation tool only — no TTB submission",
    body: "Label Lens supports preparation and internal review only. Nothing is submitted to TTB. Label Lens does not issue government or legal determinations and does not approve or reject labels.",
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
