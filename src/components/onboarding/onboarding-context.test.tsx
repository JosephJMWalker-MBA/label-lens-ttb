import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ONBOARDING_STORAGE_KEY, OnboardingProvider, useOnboarding } from "./onboarding-context";

function Probe() {
  const { isOpen, hasSeen, firstVisit, openIntro, close } = useOnboarding();
  return (
    <div>
      <span data-testid="isOpen">{String(isOpen)}</span>
      <span data-testid="hasSeen">{String(hasSeen)}</span>
      <span data-testid="firstVisit">{String(firstVisit)}</span>
      <button type="button" onClick={openIntro}>
        replay
      </button>
      <button type="button" onClick={close}>
        close
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <OnboardingProvider>
      <Probe />
    </OnboardingProvider>,
  );
}

const val = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => localStorage.clear());

describe("onboarding-context", () => {
  it("opens as a genuine first visit when never seen", () => {
    renderProbe();
    expect(val("isOpen")).toBe("true");
    expect(val("hasSeen")).toBe("false");
    expect(val("firstVisit")).toBe("true");
  });

  it("bypasses onboarding for a returning user", () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    renderProbe();
    expect(val("isOpen")).toBe("false");
    expect(val("firstVisit")).toBe("false");
  });

  it("close remembers completion and clears first-visit", () => {
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(val("isOpen")).toBe("false");
    expect(val("firstVisit")).toBe("false");
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
  });

  it("replay opens the workspace but is not a first visit (no sample auto-run)", () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "replay" }));
    expect(val("isOpen")).toBe("true");
    expect(val("firstVisit")).toBe("false");
  });
});
