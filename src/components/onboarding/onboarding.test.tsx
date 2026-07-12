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

function Shell() {
  return (
    <OnboardingProvider>
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

describe("onboarding yields to the workflow", () => {
  it("closes automatically when a pre-check starts, so processing is never obscured", async () => {
    // A pending fetch keeps the workspace in the processing phase.
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(
      <OnboardingProvider>
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
