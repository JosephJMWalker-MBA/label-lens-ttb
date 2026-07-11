import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained standalone server so the production output (server,
  // traced node_modules, and vendored OCR assets) can be copied to another
  // directory and started with `node server.js`. OCR asset paths are resolved at
  // runtime against this relocated root, not the build-machine checkout.
  output: "standalone",
  // Pin the workspace root to this repo so an unrelated lockfile elsewhere on the
  // machine cannot be inferred as the root during tracing.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  // Keep the Node-only OCR/image packages external so they are required from
  // node_modules at runtime rather than bundled into the server output.
  serverExternalPackages: ["sharp", "tesseract.js", "tesseract.js-core"],
  // Ensure the vendored OCR language data and the bundled demo fixture are
  // packaged with the pre-check route so it runs reproducibly after build.
  outputFileTracingIncludes: {
    "/api/precheck": [
      "./src/pipeline/extractor/assets/**",
      "./tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
      // The Tesseract WASM core binaries and the Node worker script are loaded
      // dynamically at runtime, so static tracing misses them. Include them
      // explicitly so a relocated/standalone build carries the full local OCR
      // runtime and never needs a network fetch.
      "./node_modules/tesseract.js-core/*.wasm",
      "./node_modules/tesseract.js-core/*.wasm.js",
      "./node_modules/tesseract.js/src/worker-script/**",
    ],
  },
};

export default nextConfig;
