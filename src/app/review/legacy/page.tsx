import { SkipLink } from "@/components/a11y/SkipLink";
import { AppHeader } from "@/components/layout/AppHeader";
import { PrecheckWorkspace } from "@/features/precheck/PrecheckWorkspace";

import { AppProviders } from "../../AppProviders";

/** Compatibility route for the unchanged single-image pre-check workflow. */
export default function LegacyReviewPage() {
  return (
    <AppProviders introOnFirstVisit>
      <SkipLink />
      <AppHeader current="review" />
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
        <header className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Label Lens TTB</h1>
          <p className="text-lg text-foreground">Prescreen a wine label before formal review.</p>
          <p className="text-muted-foreground">
            This compatibility workflow keeps the existing analyzer, deterministic findings, human
            confirmations, and pre-check exports unchanged.
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
