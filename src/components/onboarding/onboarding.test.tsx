import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrecheckWorkspace } from "@/features/precheck/PrecheckWorkspace";

import { OnboardingDialog } from "./OnboardingDialog";
import { ONBOARDING_STORAGE_KEY, OnboardingProvider, useOnboarding } from "./onboarding-context";

function Replay() {
  const { openIntro } = useOnboarding();
  return (
    <button type="button" onClick={openIntro}>
      View introduction again
    </button>
  );
}

/**
 * The workflow route's provider tree: the introduction describes the pre-check,
 * so that route opts a first-time visitor into it. The intent hub deliberately
 * does not — see "auto-open is opt-in" below.
 */
function Shell() {
  return (
    <OnboardingProvider autoOpenOnFirstVisit>
      <Replay />
      <OnboardingDialog />
    </OnboardingProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("first-use onboarding", () => {
  it("shows the introduction only for a first-time user", () => {
    render(<Shell />);
    expect(screen.getByRole("dialog", { name: /upload a wine label/i })).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();
  });

  it("does not show the introduction once it has been seen", () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    render(<Shell />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("skips, remembers completion, and can be replayed", () => {
    render(<Shell />);
    fireEvent.click(screen.getByRole("button", { name: /skip introduction/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /view introduction again/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("advances through steps and finishes", () => {
    render(<Shell />);
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    }
    expect(screen.getByText(/step 5 of 5/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /start using label lens/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape (treated as skip)", () => {
    render(<Shell />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exposes a labelled modal dialog with an accessible heading", () => {
    render(<Shell />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: /upload a wine label/i })).toBeInTheDocument();
  });
});

describe("auto-open is opt-in", () => {
  it("does not greet a first-time visitor on a route that did not ask for it", () => {
    // The intent hub mounts the provider so "view introduction again" stays a
    // real control, but the introduction describes the pre-check workflow and
    // must never be forced in front of someone who has not chosen it.
    render(
      <OnboardingProvider>
        <Replay />
        <OnboardingDialog />
      </OnboardingProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still replays on demand where it does not auto-open", () => {
    render(
      <OnboardingProvider>
        <Replay />
        <OnboardingDialog />
      </OnboardingProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /view introduction again/i }));
    expect(screen.getByRole("dialog", { name: /upload a wine label/i })).toBeInTheDocument();
  });
});

describe("onboarding yields to the workflow", () => {
  it("closes automatically when a pre-check starts, so processing is never obscured", async () => {
    // A pending fetch keeps the workspace in the processing phase.
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(
      <OnboardingProvider autoOpenOnFirstVisit>
        <OnboardingDialog />
        <PrecheckWorkspace />
      </OnboardingProvider>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const file = new File([new Uint8Array([1, 2, 3])], "label.jpeg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/select one label image/i), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText(/application brand name/i), { target: { value: "M" } });
    fireEvent.change(screen.getByLabelText(/application alcohol value/i), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));

    // The intro yields; honest processing status is shown instead.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/analyzing label evidence/i)).toBeInTheDocument();
  });
});
