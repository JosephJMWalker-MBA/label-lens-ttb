import "@testing-library/jest-dom/vitest";

// jsdom does not implement object URL APIs; provide inert stubs for components
// that create image previews from uploaded files.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
}
