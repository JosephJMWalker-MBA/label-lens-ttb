import { SkipLink } from "@/components/a11y/SkipLink";
import { AppHeader } from "@/components/layout/AppHeader";
import { IntentHub } from "@/features/home/IntentHub";

import { AppProviders } from "./AppProviders";

/**
 * The intent hub: the product's front door.
 *
 * It asks what the visitor wants to do before assuming they arrived with a
 * finished label. The pre-check introduction is deliberately not auto-opened
 * here — it explains the review workflow, and this page is not that workflow. It
 * stays replayable from the appearance settings, and it still greets a
 * first-time visitor on /review.
 */
export default function HomePage() {
  return (
    <AppProviders>
      <SkipLink />
      <AppHeader current="home" />
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-14">
        <IntentHub />
      </main>
    </AppProviders>
  );
}
