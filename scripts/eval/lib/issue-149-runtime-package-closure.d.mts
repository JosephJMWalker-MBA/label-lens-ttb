export interface RuntimePackageEntry {
  path: string;
  byteLength: number;
  sha256: string;
}

export interface RuntimePackageManifest {
  name: string;
  version: string | null;
  fileCount: number;
  byteLength: number;
  aggregateSha256: string;
  entries: RuntimePackageEntry[];
}

export interface RuntimePackageClosure {
  schemaVersion: "issue-149-runtime-package-closure.v1";
  packages: RuntimePackageManifest[];
}

export const REQUIRED_RUNTIME_PACKAGES: string[];

export class RuntimePackageClosureError extends Error {
  code: string;
  detail: unknown;
  constructor(code: string, detail: unknown);
}

export function canonicalizeRuntimePackageEntries(entries: RuntimePackageEntry[]): string;
export function runtimePackageManifest(name: string, directory: string): RuntimePackageManifest;
export function runtimePackageClosure(root: string, packages?: string[]): RuntimePackageClosure;
export function assertRuntimePackageClosureEqual(
  expected: RuntimePackageClosure,
  observed: RuntimePackageClosure,
): void;
