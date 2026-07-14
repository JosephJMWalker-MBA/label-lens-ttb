/**
 * The Label Lens product mark: a print registration mark (a circle crossed by
 * horizontal and vertical rules) with a lens pupil at its centre.
 *
 * It deliberately replaces the previous shield-and-checkmark glyph. A shield
 * carrying a checkmark reads as certification — "this has been approved by an
 * authority" — and this product issues no approval, clearance, or government
 * decision. A registration mark is a press-proof alignment symbol: it means
 * "this artwork is being prepared and inspected", which is what the tool does.
 *
 * Never replace this with a shield, seal, badge, crest, or checkmark.
 */
export function ProductMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
    >
      {/* Registration circle. */}
      <circle cx="12" cy="12" r="8" />
      {/* Registration cross-hairs, broken at the circle so the mark reads as
          an alignment target rather than an enclosed badge. */}
      <path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" />
      {/* Lens pupil. */}
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
