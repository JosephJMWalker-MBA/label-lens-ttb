import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PREFERENCES_STORAGE_KEY,
  PreferencesProvider,
  applyPreferences,
  resolveTheme,
  usePreferences,
} from "./preferences";
import { ThemeInitScript } from "./theme-init";

function mockMatchMedia(darkMatches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("dark") ? darkMatches : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function Harness() {
  const p = usePreferences();
  return (
    <div>
      <span data-testid="theme">{p.theme}</span>
      <span data-testid="font">{p.fontScale}</span>
      <span data-testid="motion">{p.motion}</span>
      <button onClick={() => p.setTheme("dark")}>set dark</button>
      <button onClick={() => p.setTheme("light")}>set light</button>
      <button onClick={() => p.setFontScale("large")}>set large</button>
      <button onClick={() => p.setMotion("reduce")}>set reduce</button>
      <button onClick={() => p.reset()}>reset</button>
    </div>
  );
}

// A safe default matchMedia for every test; individual tests override it.
beforeEach(() => mockMatchMedia(false));
afterEach(() => vi.restoreAllMocks());

describe("preferences: theme", () => {
  it("defaults to the system theme and resolves it to the OS scheme", () => {
    mockMatchMedia(true); // OS prefers dark
    render(
      <PreferencesProvider>
        <Harness />
      </PreferencesProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applies and persists an explicit light and dark choice", () => {
    mockMatchMedia(false);
    render(
      <PreferencesProvider>
        <Harness />
      </PreferencesProvider>,
    );
    fireEvent.click(screen.getByText("set dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!).theme).toBe("dark");

    fireEvent.click(screen.getByText("set light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!).theme).toBe("light");
  });

  it("restores a persisted choice on a fresh mount", () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ theme: "dark" }));
    render(
      <PreferencesProvider>
        <Harness />
      </PreferencesProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("resolveTheme honors explicit choices without matchMedia", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});

describe("preferences: font size", () => {
  it("persists a font-size choice and resets to default", () => {
    render(
      <PreferencesProvider>
        <Harness />
      </PreferencesProvider>,
    );
    fireEvent.click(screen.getByText("set large"));
    expect(screen.getByTestId("font")).toHaveTextContent("large");
    expect(document.documentElement.getAttribute("data-font-scale")).toBe("large");

    fireEvent.click(screen.getByText("reset"));
    expect(screen.getByTestId("font")).toHaveTextContent("default");
    expect(document.documentElement.getAttribute("data-font-scale")).toBe("default");
  });
});

describe("preferences: reduced motion", () => {
  it("sets and clears the reduced-motion attribute", () => {
    render(
      <PreferencesProvider>
        <Harness />
      </PreferencesProvider>,
    );
    fireEvent.click(screen.getByText("set reduce"));
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
    fireEvent.click(screen.getByText("reset"));
    expect(document.documentElement.getAttribute("data-motion")).toBeNull();
  });
});

describe("applyPreferences + flash-prevention script", () => {
  it("applyPreferences writes the resolved attributes", () => {
    mockMatchMedia(false);
    applyPreferences({ theme: "dark", fontScale: "small", motion: "reduce" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-font-scale")).toBe("small");
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
  });

  it("emits a flash-prevention script that reads the same storage key and sets data-theme", () => {
    const { container } = render(<ThemeInitScript />);
    const script = container.querySelector("script")!;
    expect(script.innerHTML).toContain(PREFERENCES_STORAGE_KEY);
    expect(script.innerHTML).toContain("data-theme");
    expect(script.innerHTML).toContain("data-font-scale");
    expect(script.innerHTML).toContain("data-motion");
  });
});
