"use client";

import type { ReactNode } from "react";

import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { OnboardingProvider } from "@/components/onboarding/onboarding-context";

import { PreferencesProvider } from "./preferences";

/**
 * Client provider shell: appearance/accessibility preferences and first-use
 * onboarding. Rendered inside each page (not only the layout) so a page and its
 * tests share one provider tree. The onboarding dialog lives here so it can
 * overlay any page content and be replayed from the settings surface.
 *
 * `introOnFirstVisit` is set on entry routes (/ and /review) that offer the
 * product workflow described by the introduction. Elsewhere the dialog stays
 * mounted and replayable — so "view introduction again" is never a dead
 * control — but it is not forced in front of a first-time visitor.
 */
export function AppProviders({
  children,
  introOnFirstVisit = false,
}: {
  children: ReactNode;
  introOnFirstVisit?: boolean;
}) {
  return (
    <PreferencesProvider>
      <OnboardingProvider autoOpenOnFirstVisit={introOnFirstVisit}>
        {children}
        <OnboardingDialog />
      </OnboardingProvider>
    </PreferencesProvider>
  );
}
