/**
 * A keyboard-only skip link. Visually hidden until focused, it lets keyboard and
 * screen-reader users jump past the header straight to the main content.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-md border border-border bg-background px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Skip to main content
    </a>
  );
}
