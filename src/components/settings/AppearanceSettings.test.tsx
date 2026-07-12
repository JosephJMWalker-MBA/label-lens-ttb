import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PreferencesProvider } from "@/app/preferences";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import {
  ONBOARDING_STORAGE_KEY,
  OnboardingProvider,
} from "@/components/onboarding/onboarding-context";

import { AppearanceSettings } from "./AppearanceSettings";

function renderSettings() {
  // Mark onboarding seen so its dialog is not auto-open during these tests.
  localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  return render(
    <PreferencesProvider>
      <OnboardingProvider>
        <AppearanceSettings />
        <OnboardingDialog />
      </OnboardingProvider>
    </PreferencesProvider>,
  );
}

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /display settings/i }));
}

describe("AppearanceSettings surface", () => {
  it("is a labelled toggle that exposes its expanded state", () => {
    renderSettings();
    const trigger = screen.getByRole("button", { name: /display settings/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("dialog", { name: /display and accessibility settings/i }),
    ).toBeInTheDocument();
  });

  it("groups theme and text-size as keyboard-operable radios with meaningful labels", () => {
    renderSettings();
    openPanel();
    for (const name of [/light/i, /dark/i, /system/i, /small/i, /default/i, /large/i]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: /reduce motion/i })).toBeInTheDocument();
  });

  it("applies theme, text-size, and reduced-motion choices", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("radio", { name: /dark/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    fireEvent.click(screen.getByRole("radio", { name: /large/i }));
    expect(document.documentElement.getAttribute("data-font-scale")).toBe("large");
    fireEvent.click(screen.getByRole("checkbox", { name: /reduce motion/i }));
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
  });

  it("resets preferences to defaults", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("radio", { name: /dark/i }));
    fireEvent.click(screen.getByRole("radio", { name: /large/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset preferences/i }));
    expect(document.documentElement.getAttribute("data-font-scale")).toBe("default");
  });

  it("replays the introduction from the settings surface", async () => {
    renderSettings();
    expect(screen.queryByRole("dialog", { name: /upload a wine label/i })).toBeNull();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: /view introduction again/i }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /upload a wine label/i })).toBeInTheDocument(),
    );
  });

  it("closes the panel on Escape and returns focus to the trigger", () => {
    renderSettings();
    const trigger = screen.getByRole("button", { name: /display settings/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog", { name: /display and accessibility settings/i }), {
      key: "Escape",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
