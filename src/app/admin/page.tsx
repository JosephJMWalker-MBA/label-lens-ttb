import Link from "next/link";

import { PortalHeader } from "@/components/layout/PortalHeader";
import { requireRolePage } from "@/server/auth/guards";
import { PORTAL_DISCLAIMER } from "@/lib/product-language";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireRolePage(["admin"]);

  return (
    <>
      <PortalHeader user={user} />
      <main id="main-content" className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Internal demo administrator
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Signed in as {user.name?.trim() || user.email}.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/agent"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open agent queue
          </Link>
        </div>

        <section className="mt-10 rounded-md border border-border/70 p-4">
          <h2 className="text-lg font-semibold tracking-tight">Account provisioning</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Demonstration accounts are provisioned server-side from environment variables, never
            through a public sign-up. An operator runs the idempotent bootstrap command against the
            deployment:
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
            npm run auth:bootstrap
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Credentials live only in the deployment environment. This page never displays or accepts
            passwords.
          </p>
        </section>

        <p className="mt-12 border-t border-border/70 pt-4 text-xs text-muted-foreground">
          {PORTAL_DISCLAIMER}
        </p>
      </main>
    </>
  );
}
