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
  // `better-sqlite3` is a native addon used only by the local/dev SQLite path;
  // keeping it external means the MySQL production server output never bundles or
  // requires it, so a build/deploy where it is absent still succeeds.
  serverExternalPackages: ["sharp", "tesseract.js", "tesseract.js-core", "better-sqlite3"],
  // `serverExternalPackages` marks the driver external at runtime, but webpack
  // still tries to *resolve* the lazy `require("better-sqlite3")` at build time.
  // Emit it as a plain runtime require so a MySQL production build succeeds even
  // when the optional native driver is not installed. It is only ever required on
  // the SQLite code path (local/dev), which never runs in a MySQL deployment.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({ "better-sqlite3": "commonjs better-sqlite3" });
    }
    return config;
  },
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
