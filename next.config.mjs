import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    ],
  },
};

export default nextConfig;
