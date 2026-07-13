"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * First-use onboarding state. Whether the introduction has been seen is stored
 * locally only — no account, no uploaded content, no server call. Provides a way
 * to replay the introduction on demand and to close it so a ready result is
 * never delayed or obscured.
 */

export const ONBOARDING_STORAGE_KEY = "label-lens.onboarding.seen.v1";

interface OnboardingContextValue {
  isOpen: boolean;
  hasSeen: boolean;
  /**
   * True only while the onboarding is open because this is a genuine first visit
   * (never seen before). A replay opened from settings is not a first visit, so
   * the productive workspace does not auto-run the verified sample again.
   */
  firstVisit: boolean;
  /** Replay the introduction from the settings surface. */
  openIntro: () => void;
  /** Dismiss (skip or finish) and remember that it has been seen. */
  close: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [hasSeen, setHasSeen] = useState(true); // assume seen until storage confirms otherwise
  const [isOpen, setIsOpen] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
    } catch {
      seen = false;
    }
    setHasSeen(seen);
    setIsOpen(!seen);
    setFirstVisit(!seen);
  }, []);

  const persistSeen = useCallback(() => {
    setHasSeen(true);
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } catch {
      // storage unavailable; onboarding will simply reappear next load
    }
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      isOpen,
      hasSeen,
      firstVisit,
      openIntro: () => {
        setFirstVisit(false); // a replay is not a first visit; do not re-run the sample
        setIsOpen(true);
      },
      close: () => {
        setIsOpen(false);
        setFirstVisit(false);
        persistSeen();
      },
    }),
    [isOpen, hasSeen, firstVisit, persistSeen],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

/** Outside a provider, returns inert defaults so isolated components/tests render. */
export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (ctx) return ctx;
  return {
    isOpen: false,
    hasSeen: true,
    firstVisit: false,
    openIntro: () => {},
    close: () => {},
  };
}
