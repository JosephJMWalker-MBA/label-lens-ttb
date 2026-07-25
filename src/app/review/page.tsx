import { SkipLink } from "@/components/a11y/SkipLink";
import { AppHeader } from "@/components/layout/AppHeader";
import { ReviewWorkspaceContainer } from "@/features/package-preparation/ReviewWorkspaceContainer";

import { AppProviders } from "../AppProviders";

/**
 * Seller package preparation is the primary review route. The established
 * single-image pre-check remains available at `/review/legacy`; its analyzer,
 * rules, schemas, evidence records, and export bytes are not modified here.
 */
export default function ReviewPage() {
  return (
    <AppProviders introOnFirstVisit>
      <SkipLink />
      <AppHeader current="review" />
      <div className="mx-auto flex max-w-[96rem] min-w-0 flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex min-w-0 flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Prepare a seller label package
          </h1>
          <p className="max-w-4xl text-lg text-foreground">
            Add the required front label, then explicitly upload or rule out the back and any
            additional panels. Preserve seller evidence before analysis, then review machine
            observations without overwriting either record.
          </p>
          <p className="max-w-4xl rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Drafts remain in this browser until you submit for internal review. Machine observations
            remain separate from seller evidence. Nothing is submitted to TTB, and no result is an
            approval or legal determination.
          </p>
          <p className="text-sm text-muted-foreground">
            Need the established one-image pre-check?{" "}
            <a className="underline underline-offset-4" href="/review/legacy">
              Open the Legacy single-image pre-check
            </a>
            .
          </p>
        </header>

        <main id="main-content" className="min-w-0">
          <ReviewWorkspaceContainer />
        </main>
      </div>
    </AppProviders>
  );
}
