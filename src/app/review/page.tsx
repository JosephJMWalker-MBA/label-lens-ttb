import { SkipLink } from "@/components/a11y/SkipLink";
import { AppHeader } from "@/components/layout/AppHeader";
import { PrecheckWorkspace } from "@/features/precheck/PrecheckWorkspace";

import { AppProviders } from "../AppProviders";

/**
 * The pre-check workflow, relocated here from `/` so the front door can ask what
 * a visitor wants to do instead of assuming they brought a finished label.
 *
 * This is a routing and presentation move only. `PrecheckWorkspace` and
 * everything beneath it — upload, declared facts, extraction, deterministic
 * checks, evidence panels, human confirmations, dispositions, downloads, append
 * freshness, and the advisory language — are unchanged.
 *
 * This is the route that owns the first-use introduction, because the
 * introduction describes this workflow.
 */
export default function ReviewPage() {
  return (
    <AppProviders introOnFirstVisit>
      <SkipLink />
      <AppHeader current="review" />
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-14">
        <header className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Label Lens TTB</h1>
          <p className="text-lg text-foreground">Prescreen a wine label before formal review.</p>
          <p className="text-muted-foreground">
            Upload one label to extract brand and alcohol evidence, identify items that need review,
            and create a traceable report.
          </p>
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            This tool supports preparation and review. It does not approve or reject a label, and it
            is not a TTB approval or legal determination.
          </p>
        </header>

        <main id="main-content">
          <PrecheckWorkspace />
        </main>
      </div>
    </AppProviders>
  );
}
