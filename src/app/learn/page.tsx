import { SkipLink } from "@/components/a11y/SkipLink";
import { AppHeader } from "@/components/layout/AppHeader";
import { RequirementsExplorer } from "@/features/learn/RequirementsExplorer";
import { buildRuleGuide } from "@/features/learn/rule-guide";

import { AppProviders } from "../AppProviders";

/**
 * The Requirements Explorer.
 *
 * Every check, its cited source, and what the system cannot determine — derived
 * on the server from the committed rule registry, so the page cannot drift from
 * the rules that actually run. No law is fetched, scraped, reproduced, or
 * interpreted here.
 */
export default function LearnPage() {
  const guide = buildRuleGuide();

  return (
    <AppProviders>
      <SkipLink />
      <AppHeader current="learn" />
      <main id="main-content" className="mx-auto max-w-3xl px-6 py-14">
        <RequirementsExplorer guide={guide} />
      </main>
    </AppProviders>
  );
}
