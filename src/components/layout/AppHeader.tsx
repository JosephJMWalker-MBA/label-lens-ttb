import Link from "next/link";

import { ProductMark } from "@/components/brand/ProductMark";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { AuthStatusNav } from "@/components/auth/AuthStatusNav";

/**
 * The one global header shared by every route. It carries the product mark, a
 * link back to the intent hub, navigation to the two capabilities that actually
 * exist, and the appearance/accessibility settings surface.
 *
 * It never displays a status, score, or readiness indicator: the header is
 * chrome, and chrome asserts nothing about a label.
 */
export function AppHeader({ current }: { current: "home" | "create" | "review" | "learn" }) {
  return (
    <header className="border-b border-border/70 bg-card/40">
      {/* Wraps rather than overflows: on a narrow viewport the navigation and
          settings drop to a second row. Nothing is hidden at small widths — a
          phone is a real place to review a label, so every control stays
          reachable. The page body must never scroll horizontally. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <Link
          href="/"
          aria-label="Label Lens — go to the start"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ProductMark className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm font-semibold uppercase tracking-wide">Label Lens</span>
        </Link>

        {/* The navigation group wraps internally as it grows. Each route added
            widens this row, and the page body must never scroll horizontally —
            a phone is a real place to use this. */}
        <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-2">
          <nav aria-label="Sections" className="flex flex-wrap items-center gap-1">
            <HeaderLink href="/create" active={current === "create"}>
              Create
            </HeaderLink>
            <HeaderLink href="/review" active={current === "review"}>
              Review
            </HeaderLink>
            <HeaderLink href="/learn" active={current === "learn"}>
              Learn
            </HeaderLink>
            <AuthStatusNav />
          </nav>
          <AppearanceSettings />
        </div>
      </div>
    </header>
  );
}

function HeaderLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:font-medium aria-[current=page]:text-foreground"
    >
      {children}
    </Link>
  );
}
