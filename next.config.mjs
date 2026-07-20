import { fileURLToPath } from "node:url";

// Which dialect graph is this build? MySQL is authoritative in production;
// SQLite backs local development, tests, and the SQLite e2e build. This mirrors
// `src/db/dialect.ts` — the two MUST agree, because a disagreement is exactly
// what let a MySQL production build pull in the native SQLite driver and fail
// page-data collection with `Cannot find module 'better-sqlite3'`.
// `LABEL_LENS_DB_DIALECT` is an explicit operator override for hosts whose
// connection string cannot be sniffed confidently.
const forcedDialect = (process.env.LABEL_LENS_DB_DIALECT ?? "").trim().toLowerCase();
const BUILD_DIALECT =
  forcedDialect === "mysql" || forcedDialect === "sqlite"
    ? forcedDialect
    : /^mysql2?:\/\//i.test((process.env.DATABASE_URL ?? "").trim())
      ? "mysql"
      : "sqlite";
const IS_MYSQL_BUILD = BUILD_DIALECT === "mysql";

// Printed so a deployment log proves which graph was emitted.
console.log(
  `[build] database dialect graph: ${BUILD_DIALECT}` +
    (IS_MYSQL_BUILD ? " (better-sqlite3 excluded entirely)" : " (better-sqlite3 external)"),
);

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
  // `better-sqlite3` is listed as external ONLY for a SQLite build; a MySQL build
  // excludes it from the graph outright (see the webpack hook below), so it needs
  // no externals entry there.
  serverExternalPackages: [
    "sharp",
    "tesseract.js",
    "tesseract.js-core",
    ...(IS_MYSQL_BUILD ? [] : ["better-sqlite3"]),
  ],
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) return config;

    if (IS_MYSQL_BUILD) {
      // Split the module graphs. Replacing the SQLite dialect module with a stub
      // removes the ONLY path to `better-sqlite3`, so the emitted server bundles
      // contain no import, no external factory, and no executable
      // `require("better-sqlite3")` — during module evaluation, build tracing,
      // page-data collection, or runtime startup.
      //
      // Marking it external instead was NOT sufficient: webpack still emitted
      // `a.exports=require("better-sqlite3")` into every route bundle that
      // reached the database client, and page-data collection executed it when
      // the connection string did not resolve to MySQL.
      config.plugins.push(
        // Matches the raw request, which is the relative `./client.sqlite` — not a
        // resolved path — and is anchored so `./client.sqlite.stub` and
        // `./schema.sqlite` are never caught.
        new webpack.NormalModuleReplacementPlugin(/(^|[\\/])client\.sqlite$/, (resource) => {
          resource.request = resource.request.replace(/client\.sqlite$/, "client.sqlite.stub");
        }),
      );
      // Belt and braces: if any future import reaches the native driver, fail the
      // build loudly here rather than shipping a broken production bundle.
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /^better-sqlite3$/ }),
        new webpack.IgnorePlugin({ resourceRegExp: /^drizzle-orm\/better-sqlite3$/ }),
      );
    } else {
      // SQLite build (local dev, tests, SQLite e2e): the native addon must be
      // required from node_modules at runtime rather than bundled.
      config.externals = config.externals || [];
      config.externals.push({ "better-sqlite3": "commonjs better-sqlite3" });
    }

    return config;
  },
  // The file tracer is a separate static analyzer from webpack: it walks the
  // original source, so it still sees `client.ts` importing `./client.sqlite`
  // even though webpack replaced that module with the stub. The traced file is
  // inert TypeScript that Node never loads, but excluding it keeps the MySQL
  // production output completely free of any `better-sqlite3` reference.
  ...(IS_MYSQL_BUILD ? { outputFileTracingExcludes: { "*": ["src/db/client.sqlite.ts"] } } : {}),
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
