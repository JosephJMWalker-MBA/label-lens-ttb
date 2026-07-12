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
  /** Replay the introduction from the settings surface. */
  openIntro: () => void;
  /** Dismiss (skip or finish) and remember that it has been seen. */
  close: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [hasSeen, setHasSeen] = useState(true); // assume seen until storage confirms otherwise
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
    } catch {
      seen = false;
    }
    setHasSeen(seen);
    setIsOpen(!seen);
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
      openIntro: () => setIsOpen(true),
      close: () => {
        setIsOpen(false);
        persistSeen();
      },
    }),
    [isOpen, hasSeen, persistSeen],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

/** Outside a provider, returns inert defaults so isolated components/tests render. */
export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (ctx) return ctx;
  return { isOpen: false, hasSeen: true, openIntro: () => {}, close: () => {} };
}
