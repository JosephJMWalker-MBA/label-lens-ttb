import Link from "next/link";

import { ProductMark } from "@/components/brand/ProductMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { Role, SessionUser } from "@/server/auth/guards";

const NAV_BY_ROLE: Record<Role, { href: string; label: string }[]> = {
  seller: [
    { href: "/create", label: "Create" },
    { href: "/review", label: "Review" },
    { href: "/seller", label: "My submissions" },
  ],
  agent: [
    { href: "/agent", label: "Agent queue" },
    { href: "/learn", label: "Learn" },
  ],
  admin: [
    { href: "/admin", label: "Admin" },
    { href: "/agent", label: "Agent queue" },
    { href: "/learn", label: "Learn" },
  ],
};

/**
 * Header for authenticated portal pages. The role is server-resolved and passed
 * in (never derived in the browser), so the navigation and the signed-in
 * identity are authoritative.
 */
export function PortalHeader({ user }: { user: SessionUser }) {
  const links = NAV_BY_ROLE[user.role];
  return (
    <header className="border-b border-border/70 bg-card/40">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
        <Link
          href="/"
          aria-label="Label Lens — go to the start"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ProductMark className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm font-semibold uppercase tracking-wide">Label Lens</span>
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <nav aria-label="Sections" className="flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <span className="text-sm text-muted-foreground" data-testid="signed-in-user">
            {user.email}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
