"use client";

import { useEffect, type ReactNode } from "react";

import { nowMs, recordShellReadyMs } from "@/components/onboarding/precheck-timing";
import { OnboardingProvider } from "@/components/onboarding/onboarding-context";
import { OnboardingWorkspace } from "@/components/onboarding/OnboardingWorkspace";
import { ReviewerDemoEntry } from "@/components/reviewer/ReviewerDemoEntry";

import { PreferencesProvider } from "./preferences";

/**
 * Client provider shell: appearance/accessibility preferences and first-use
 * onboarding. Rendered inside the page (not only the layout) so the page and its
 * tests share one provider tree.
 *
 * The productive onboarding workspace overlays any page content and is replayed
 * from the settings surface. The persistent purple Reviewer demo action is a
 * secondary destination kept clearly separate from the primary seller workflow.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Record navigation/hydration → meaningful shell once, as a bounded, observed
  // measurement (no server transmission, no performance claim).
  useEffect(() => {
    recordShellReadyMs(nowMs());
  }, []);

  return (
    <PreferencesProvider>
      <OnboardingProvider>
        {children}
        <OnboardingWorkspace />
        <ReviewerDemoEntry />
      </OnboardingProvider>
    </PreferencesProvider>
  );
}
