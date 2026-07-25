import { SkipLink } from "@/components/a11y/SkipLink";
import { AppHeader } from "@/components/layout/AppHeader";
import { IntentHub } from "@/features/home/IntentHub";

import { AppProviders } from "./AppProviders";

/**
 * The intent hub: the product's front door.
 *
 * It asks what the visitor wants to do before assuming they arrived with a
 * finished label. The product-level introduction greets a first-time visitor
 * here to explain seller evidence, machine observations, internal human review,
 * and the preparation boundary.
 */
export default function HomePage() {
  return (
    <AppProviders introOnFirstVisit>
      <SkipLink />
      <AppHeader current="home" />
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-14">
        <IntentHub />
      </main>
    </AppProviders>
  );
}
