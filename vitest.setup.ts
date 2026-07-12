import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// jsdom does not implement object URL APIs; provide inert stubs for components
// that create image previews from uploaded files.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
}

// jsdom does not implement matchMedia; default to "no preference" (light scheme,
// motion allowed). Individual tests override `window.matchMedia` to exercise
// system-dark or reduced-motion behavior.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Keep local preferences and onboarding state from leaking across tests.
afterEach(() => {
  try {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-font-scale");
    document.documentElement.removeAttribute("data-motion");
  } catch {
    // no storage in this environment
  }
});
