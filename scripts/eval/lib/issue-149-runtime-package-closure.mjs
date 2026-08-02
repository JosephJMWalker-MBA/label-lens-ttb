import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const REQUIRED_RUNTIME_PACKAGES = ["tesseract.js", "tesseract.js-core"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256File = (file) => sha256(readFileSync(file));

export class RuntimePackageClosureError extends Error {
  constructor(code, detail) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.code = code;
    this.detail = detail;
  }
}

export function canonicalizeRuntimePackageEntries(entries) {
  return JSON.stringify(
    entries
      .map((entry) => [entry.path, entry.byteLength, entry.sha256])
      .sort((left, right) => left[0].localeCompare(right[0])),
  );
}

export function runtimePackageManifest(name, directory) {
  if (!existsSync(directory)) throw new RuntimePackageClosureError("RUNTIME_PACKAGE_MISSING", name);
  const packageJson = path.join(directory, "package.json");
  if (!existsSync(packageJson)) {
    throw new RuntimePackageClosureError("RUNTIME_PACKAGE_MANIFEST_MISSING", name);
  }
  const manifest = JSON.parse(readFileSync(packageJson, "utf8"));
  const entries = [];
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const absolute = path.join(current, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute);
      } else if (stat.isFile()) {
        entries.push({
          path: path.relative(directory, absolute).split(path.sep).join("/"),
          byteLength: stat.size,
          sha256: sha256File(absolute).toLowerCase(),
        });
      }
    }
  };
  walk(directory);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return {
    name,
    version: manifest.version ?? null,
    fileCount: entries.length,
    byteLength: entries.reduce((sum, entry) => sum + entry.byteLength, 0),
    aggregateSha256: sha256(canonicalizeRuntimePackageEntries(entries)),
    entries,
  };
}

export function runtimePackageClosure(root, packages = REQUIRED_RUNTIME_PACKAGES) {
  return {
    schemaVersion: "issue-149-runtime-package-closure.v1",
    packages: packages.map((name) => runtimePackageManifest(name, path.join(root, name))),
  };
}

export function assertRuntimePackageClosureEqual(expected, observed) {
  const left = JSON.stringify(expected);
  const right = JSON.stringify(observed);
  if (left !== right) {
    throw new RuntimePackageClosureError("RUNTIME_PACKAGE_CLOSURE_MISMATCH", {
      expectedAggregates: expected.packages?.map((entry) => ({
        name: entry.name,
        version: entry.version,
        fileCount: entry.fileCount,
        byteLength: entry.byteLength,
        aggregateSha256: entry.aggregateSha256,
      })),
      observedAggregates: observed.packages?.map((entry) => ({
        name: entry.name,
        version: entry.version,
        fileCount: entry.fileCount,
        byteLength: entry.byteLength,
        aggregateSha256: entry.aggregateSha256,
      })),
    });
  }
}
