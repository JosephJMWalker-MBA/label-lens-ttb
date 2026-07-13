"use client";

import { ShieldQuestion } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Persistent secondary "Reviewer demo" action (Issue #56).
 *
 * A single purple accent action, anchored bottom-left so it stays clearly
 * separate from the primary seller workflow. It opens an honest preview of the
 * future reviewer surface — the queue of completed, evidence-mapped submissions a
 * TTB operator would receive — WITHOUT implementing that queue, any real login,
 * or any TTB integration. The copy states plainly that this is a demonstration.
 *
 * Bounded on purpose: this introduces no authentication, no persistence, no
 * operator data, and no regulatory authority. It teaches where the public flow
 * leads; it does not build the receiving side.
 */

/** What the future reviewer queue will show. Descriptive preview only. */
const QUEUE_PREVIEW: { status: string; note: string }[] = [
  { status: "READY FOR REVIEW", note: "Seller submitted a complete, traceable evidence package." },
  {
    status: "NEEDS SELLER CORRECTION",
    note: "A disagreement or exception is awaiting the seller.",
  },
  { status: "INCOMPLETE EVIDENCE", note: "Required evidence has not been mapped yet." },
];

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ReviewerDemoEntry() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Move focus into the dialog on open; restore it to the trigger on close.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => headingRef.current?.focus());
    } else {
      triggerRef.current?.focus?.();
    }
  }, [open]);

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

  return (
    <div className="fixed bottom-4 left-4 z-[60] print:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-reviewer px-4 py-2 text-sm font-medium text-reviewer-foreground shadow-lg transition-colors hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ShieldQuestion aria-hidden="true" className="h-4 w-4" />
        Reviewer demo
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/40 p-4"
          onKeyDown={onKeyDown}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xl"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reviewer demo · preview only
            </p>
            <h2
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 text-xl font-semibold focus-visible:outline-none"
            >
              What the reviewer receives
            </h2>
            <p id={descId} className="mt-2 text-sm text-foreground">
              The public flow prepares a complete, traceable evidence package. A reviewer surface
              would receive those packages for human review — it is not an OCR result dashboard.
              This is a demonstration of that direction.
            </p>

            <ul className="mt-4 flex flex-col gap-2">
              {QUEUE_PREVIEW.map((item) => (
                <li key={item.status} className="rounded-md border border-border p-3 text-sm">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.status}
                  </span>
                  <p className="mt-1">{item.note}</p>
                </li>
              ))}
            </ul>

            <p className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              This is a demonstration only. It is <strong>not</strong> a sign-in, does not
              authenticate anyone, exposes no operator or applicant data, and implies no live TTB
              integration. No queue is functional here.
            </p>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
