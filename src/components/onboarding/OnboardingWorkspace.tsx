"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResultView } from "@/features/precheck/ResultView";

import { useOnboarding } from "./onboarding-context";
import { useSampleWarmup, type SampleWarmupState } from "./useSampleWarmup";

/**
 * Productive cold-start onboarding.
 *
 * The unavoidable first-visit initialization interval is spent running the real
 * verified sample once through `/api/precheck` (warming the server) while the
 * user reads the actual Label Lens workflow. The completed sample result is
 * revealed the moment it exists — never held back for tutorial copy — and
 * "Upload your label" is the obvious next step.
 *
 * Honest status: two channels are kept deliberately separate.
 * - The STATUS log shows only states the client can prove. The API does not
 *   stream internal OCR stages, so we never invent candidate-filtering, rule, or
 *   report-assembly transitions while the request is pending.
 * - The WORKFLOW list is static teaching content, clearly labelled as such.
 */

/** Static teaching content — the real workflow, not live server state. */
const WORKFLOW_STEPS: { title: string; body: string }[] = [
  {
    title: "Upload the label artwork",
    body: "Choose one PNG or JPEG. It is processed for this check only and is never stored.",
  },
  {
    title: "Label Lens reads the artwork",
    body: "Local OCR reads the brand and alcohol evidence directly from the image.",
  },
  {
    title: "Your application facts stay separate",
    body: "The brand and alcohol values you enter are compared against the evidence — never mixed into what OCR read.",
  },
  {
    title: "Uncertainty is shown, not hidden",
    body: "When evidence is weak or competing, the result says so plainly instead of guessing a confident answer.",
  },
  {
    title: "Export a traceable report",
    body: "Download a checksum-verified JSON export and a readable report. This supports review; it is not a TTB approval.",
  },
];

/** Client-provable status vocabulary. No fabricated internal OCR detail. */
const STATUS_TEXT = {
  shell: "APPLICATION SHELL READY",
  requested: "VERIFIED SAMPLE REQUESTED",
  analyzing: "SAMPLE ANALYSIS IN PROGRESS",
  ready: "SAMPLE READY",
  failed: "SAMPLE FAILED",
  handoff: "READY FOR YOUR LABEL",
} as const;

type MilestoneKey = keyof typeof STATUS_TEXT;

interface LogEntry {
  key: MilestoneKey;
  text: string;
  at: string;
}

/** Which milestones the client can honestly claim, given the run state. */
function reachedMilestones(state: SampleWarmupState): MilestoneKey[] {
  const reached: MilestoneKey[] = ["shell"];
  if (state === "requested" || state === "analyzing" || state === "ready" || state === "failed") {
    reached.push("requested");
  }
  if (state === "analyzing" || state === "ready" || state === "failed") {
    reached.push("analyzing");
  }
  if (state === "ready") reached.push("ready", "handoff");
  if (state === "failed") reached.push("failed");
  return reached;
}

function clockTime(): string {
  return new Date().toLocaleTimeString([], { hour12: false });
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function OnboardingWorkspace() {
  const { isOpen, firstVisit, close } = useOnboarding();
  const { state, response, error, coldMs, start } = useSampleWarmup(isOpen && firstVisit);

  const [log, setLog] = useState<LogEntry[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Append honest status milestones as they become provable, timestamped once
  // and deduplicated by key so Strict Mode / re-renders never double-log.
  useEffect(() => {
    if (!isOpen) return;
    setLog((prev) => {
      const seen = new Set(prev.map((e) => e.key));
      const additions = reachedMilestones(state)
        .filter((key) => !seen.has(key))
        .map((key) => ({ key, text: STATUS_TEXT[key], at: clockTime() }));
      return additions.length === 0 ? prev : [...prev, ...additions];
    });
  }, [isOpen, state]);

  // Reset the log for a fresh onboarding session (open transition).
  useEffect(() => {
    if (isOpen) setLog([]);
  }, [isOpen]);

  // Capture the element to restore focus to; move focus into the workspace on
  // open, and back out on close.
  useEffect(() => {
    if (!isOpen) {
      returnFocusRef.current?.focus?.();
      return;
    }
    returnFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [isOpen]);

  const onUploadYourLabel = useCallback(() => {
    close();
    // Close unmounts the overlay; focus the real file input on the next frame so
    // the primary workflow control receives focus (not the pre-open element).
    requestAnimationFrame(() => {
      const input = document.getElementById("label-image");
      if (input instanceof HTMLElement) input.focus();
    });
  }, [close]);

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

  const isReady = state === "ready" && response !== null;
  const isFailed = state === "failed";
  const isRunning = state === "requested" || state === "analyzing";

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-4 text-slate-100 sm:p-8"
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
        className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
      >
        {/* Left: identity, honest status log, and the workflow being taught. */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
              Label Lens TTB
            </p>
            <h2
              id="onboarding-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold focus-visible:outline-none"
            >
              Warming up on a verified sample
            </h2>
            <p id="onboarding-body" className="text-sm text-slate-300">
              While you read how Label Lens works, it is running the bundled verified M Cellars
              label through the same real pre-check an upload uses. Nothing shown here is a prepared
              result.
            </p>
          </div>

          {/* Honest status log — only client-provable states. */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-400">
              Status
            </p>
            <ol
              className="flex flex-col gap-0.5 rounded-md border border-slate-800 bg-black/40 p-3 font-mono text-xs text-slate-300"
              aria-live="polite"
              aria-busy={isRunning}
            >
              {log.map((entry) => (
                <li key={entry.key} className="flex gap-3">
                  <span className="text-slate-500">{entry.at}</span>
                  <span
                    className={
                      entry.key === "handoff"
                        ? "font-semibold text-violet-300"
                        : entry.key === "failed"
                          ? "font-semibold text-red-300"
                          : entry.key === "ready"
                            ? "text-emerald-300"
                            : ""
                    }
                  >
                    {entry.text}
                  </span>
                </li>
              ))}
            </ol>
            {coldMs !== null ? (
              <p className="mt-1 text-xs text-slate-500">
                Verified sample completed in {(coldMs / 1000).toFixed(1)}s. Your first upload should
                be faster now that the service is warm.
              </p>
            ) : null}
          </div>

          {/* Static teaching content, explicitly separated from live status. */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-400">
              The workflow you&rsquo;ll use
            </p>
            <ol className="flex flex-col gap-3">
              {WORKFLOW_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-700 text-[11px] text-slate-400"
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm">
                    <span className="font-medium text-slate-100">{s.title}.</span>{" "}
                    <span className="text-slate-300">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Right: the real sample result / run state, then the primary actions. */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            {isReady ? (
              <div className="rounded-md bg-card p-4 text-card-foreground">
                <p className="mb-3 text-sm font-medium">Verified sample result</p>
                {/* The live pipeline output — server-side sample has no local preview. */}
                <ResultView response={response} previewImage={null} />
              </div>
            ) : isFailed ? (
              <div
                role="alert"
                className="rounded-md border border-red-400/40 bg-red-500/10 p-4 text-sm"
              >
                <p className="font-semibold text-red-200">The verified sample could not complete</p>
                <p className="mt-1 text-slate-300">
                  {error ?? "The sample run failed."} You can still upload your own label — the
                  pre-check runs independently of this warm-up.
                </p>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800"
                    onClick={start}
                  >
                    Retry sample
                  </Button>
                </div>
              </div>
            ) : isRunning ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <span
                  aria-hidden="true"
                  className="processing-spinner inline-block h-6 w-6 rounded-full border-2 border-slate-600 border-t-slate-200"
                />
                <p className="text-sm text-slate-300">
                  Reading the verified sample through the real pre-check…
                </p>
                <p className="text-xs text-slate-500">
                  The result appears here the moment it is ready — it is not held back for this
                  walkthrough.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <p className="text-sm text-slate-300">
                  Run the bundled verified sample to see a real pre-check result.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800"
                  onClick={start}
                >
                  Run verified sample
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onUploadYourLabel}
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Upload your label
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Skip introduction
            </button>
          </div>
          <p className="text-xs text-slate-500">
            You can replay this introduction any time from Display settings.
          </p>
        </div>
      </div>
    </div>
  );
}
