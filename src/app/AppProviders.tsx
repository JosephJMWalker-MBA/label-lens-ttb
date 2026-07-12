"use client";

import type { ReactNode } from "react";

import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { OnboardingProvider } from "@/components/onboarding/onboarding-context";

import { PreferencesProvider } from "./preferences";

/**
 * Client provider shell: appearance/accessibility preferences and first-use
 * onboarding. Rendered inside the page (not only the layout) so the page and its
 * tests share one provider tree. The onboarding dialog lives here so it can
 * overlay any page content and be replayed from the settings surface.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <OnboardingProvider>
        {children}
        <OnboardingDialog />
      </OnboardingProvider>
    </PreferencesProvider>
  );
}
