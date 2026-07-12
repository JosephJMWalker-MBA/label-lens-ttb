# Accessibility, Onboarding, and Appearance — Manual Smoke Checklist

This checklist records the manual verification for the accessibility and
onboarding foundation (issues #52 and #53). It complements the automated tests;
automated checks do not certify WCAG conformance.

## What was verified automatically

Covered by the committed test suites (`npm test`, `npm run test:e2e`):

- system-theme default and explicit light/dark selection;
- theme, text-size, and reduced-motion persistence and reset;
- the flash-prevention script sets the theme attributes;
- onboarding shows only on first use, skips, replays, and yields to a running result;
- immediate honest processing status, duplicate-submit prevention, and busy state;
- focus moves to the result region on success and to the error alert on failure;
- settings surface is operable through roles and labels, and closes on Escape;
- downloads and disposition behavior are unchanged.

## Manual checklist

Run against the deployed demo or a local `npm run dev` build. Mark each item.

| Area | Check | Status |
| --- | --- | --- |
| Keyboard only | Tab through: skip link → settings → sample → upload → replace/clear → facts → run → disclosures → downloads → disposition, in a logical order with visible focus and no trap | Recommended |
| Screen reader (VoiceOver / NVDA) | Landmarks, headings, labels, disclosure open/closed state, and status/error live regions are announced | Recommended |
| Light theme | Background, cards, inputs, buttons, alerts, focus outlines, and PASS/WARN/FAIL/NEEDS_REVIEW/not_run badges are readable | Recommended |
| Dark theme | Same surfaces remain readable; no low-contrast text | Recommended |
| System theme | Switching the OS scheme flips the app theme with no explicit choice set | Recommended |
| 200% browser zoom | No horizontal scrolling; buttons, forms, tables, and result summary stay usable | Recommended |
| Text size Small / Large | Layout scales without clipping controls or the result summary | Recommended |
| Reduced motion | With OS reduced-motion on (or the local toggle), the spinner is hidden and transitions are removed; textual status still conveys progress | Recommended |
| Onboarding skip / replay | First load shows the intro; Skip returns to the workflow; “View introduction again” reopens it | Recommended |
| Long processing wait | Status appears immediately, the elapsed counter advances, and no fake percentage or ETA is shown during a long request | Recommended |
| Successful result | Completion is announced and focus lands on the result region | Recommended |
| Error path | A failed pre-check announces an alert and moves focus to it, with a clear recovery message | Recommended |
| Downloads | JSON and HTML downloads still produce the exact server files | Recommended |
| Disposition form | Recording a disposition still appends without altering machine findings | Recommended |

## Explicitly tested by the author in this change

- Automated: every item in the “verified automatically” list above passes in
  `npm test` and `npm run test:e2e`, including the dark-theme attribute and
  persistence checks in the Playwright browser.
- Not manually re-tested in this environment: live screen-reader passes
  (VoiceOver/NVDA), 200% zoom reflow, and the ~38-second live processing wait on
  the deployed instance. These remain **recommended** manual checks before
  release and are the reason full WCAG conformance is not claimed here.

## Scope note

Text-to-speech and dictation are intentionally out of scope for this foundation
and are deferred to a later accessibility slice. This change adds no extractor,
OCR, rule, or backend-performance behavior; the ~38-second first request is a
backend concern the onboarding does not mask — honest processing status is shown
throughout and a ready result is never delayed.
