/**
 * Ship-readiness run-002 declaration-intake CLI (Issues #124 / #127).
 *
 * A generic tool that operates on a gitignored local workspace. It carries no
 * image bytes, no private paths, and no declared values — those are supplied at
 * run time. It never reads label artwork and never produces declared values;
 * declared brand/alcohol values must be established independently by controlled
 * human intake or genuine records before randomization. All parsed JSON is
 * validated fail-closed before use.
 *
 * Subcommands:
 *   skeleton       <candidates.json> <out-manifest.json>
 *   validate       <manifest.json>
 *   accounting     <manifest.json> <out.json>
 *   no-leakage     <manifest.json> <out.json>
 *   verify-sources <manifest.json> <authorized-root-dir | trusted-inventory.json> <out.json>
 *
 * Run with: npx vite-node --config vitest.config.ts scripts/pilots/declaration-intake.ts <cmd> ...
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

import {
  DECLARATION_MANIFEST_SCHEMA_VERSION,
  PRODUCT_BOUNDARY_STATEMENT,
  checkNoLeakage,
  computeCandidateAccounting,
  computeDeclarationInputDigest,
  computeEntryDigest,
  computeFullManifestDigest,
  createAuthorizedRootReader,
  parseCandidateInputs,
  validateDeclarationManifest,
  verifySourcesAgainstInventory,
  verifySourcesWithReader,
  type DeclarationEntry,
  type DeclarationManifest,
  type TrustedInventoryRecord,
} from "../../src/pilots/ship-readiness/declaration-manifest.ts";

function fail(message: string): never {
  console.error(`declaration-intake: ${message}`);
  process.exit(1);
}
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Load + validate a manifest fail-closed before any typed use. */
function loadValidManifest(path: string): DeclarationManifest {
  const raw = readJson<unknown>(path);
  const result = validateDeclarationManifest(raw);
  if (!result.ok) fail(`manifest invalid:\n${result.issues.join("\n")}`);
  return raw as DeclarationManifest;
}

/** Build a pre-declaration skeleton: no declared values, provenance pending. */
function skeleton(candidatesPath: string, outPath: string): void {
  const parsed = parseCandidateInputs(readJson<unknown>(candidatesPath));
  if (!parsed.ok) fail(`candidates invalid:\n${parsed.issues.join("\n")}`);
  const candidates = parsed.candidates;
  const entries: DeclarationEntry[] = candidates.map((c) => {
    const entry: DeclarationEntry = {
      runId: "ship-readiness-002",
      run002CaseId: c.run002CaseId,
      sourceImageRef: c.sourceImageRef,
      sourceImageSha256: c.sourceImageSha256,
      sourceMediaType: c.sourceMediaType,
      sourceByteSize: c.sourceByteSize,
      priorPilotIdentity: c.priorPilotIdentity,
      declaredBrand: {
        exactSourceText: null,
        normalizedComparisonForm: null,
        valueState: "PENDING_INDEPENDENT_SOURCE",
        uncertaintyState: "UNCERTAIN",
      },
      declaredAlcohol: {
        exactSourceText: null,
        normalizedComparisonForm: null,
        valueState: "PENDING_INDEPENDENT_SOURCE",
        uncertaintyState: "UNCERTAIN",
      },
      declarationSourceType: null,
      declarationSourceRef: null,
      sourceAccessDate: null,
      recordedBy: null,
      recordedTimestamp: null,
      transcriptionMethod: null,
      independenceStatement: null,
      timing: {
        intakeStartTimestamp: null,
        intakeCompletionTimestamp: null,
        sourceSearchMs: null,
        transcriptionMs: null,
        verificationMs: null,
        totalIntakeBurdenMs: null,
      },
      primaryBlindEligibilityState: c.eligibility,
      exclusionOrNonBlindReason: c.reason ?? null,
      schemaVersion: DECLARATION_MANIFEST_SCHEMA_VERSION,
      manifestEntryDigest: null,
    };
    return { ...entry, manifestEntryDigest: computeEntryDigest(entry) };
  });

  const base: DeclarationManifest = {
    schemaVersion: DECLARATION_MANIFEST_SCHEMA_VERSION,
    runId: "ship-readiness-002",
    productBoundaryStatement: PRODUCT_BOUNDARY_STATEMENT,
    randomizationTimestamp: null,
    reviewerExposureTimestamp: null,
    machineExecutionTimestamp: null,
    expectedCandidateCount: entries.length,
    preparedAt: new Date().toISOString(),
    preparedBy: "declaration-intake-cli",
    entries,
    declarationInputDigest: null,
    fullManifestDigest: null,
  };
  const sealed: DeclarationManifest = {
    ...base,
    declarationInputDigest: computeDeclarationInputDigest(base),
    fullManifestDigest: computeFullManifestDigest(base),
  };
  const result = validateDeclarationManifest(sealed);
  if (!result.ok) fail(`skeleton invalid:\n${result.issues.join("\n")}`);
  writeFileSync(outPath, JSON.stringify(sealed, null, 2) + "\n");
  console.log(`wrote validated skeleton (${entries.length} candidates) -> ${outPath}`);
}

function validate(manifestPath: string): void {
  const result = validateDeclarationManifest(readJson<unknown>(manifestPath));
  if (!result.ok) fail(`validation FAILED:\n${result.issues.join("\n")}`);
  console.log("validation PASSED");
}

function accounting(manifestPath: string, outPath: string): void {
  const acct = computeCandidateAccounting(loadValidManifest(manifestPath));
  writeFileSync(outPath, JSON.stringify(acct, null, 2) + "\n");
  console.log(
    `accounting: total ${acct.totalCandidateImages}, complete ${acct.declarationsComplete}, primary ${acct.primaryBlindCandidates}, pending ${acct.pending}, non-blind ${acct.nonBlindOperational}, excluded ${acct.excluded} -> ${outPath}`,
  );
}

function noLeakage(manifestPath: string, outPath: string): void {
  const result = checkNoLeakage(loadValidManifest(manifestPath));
  writeFileSync(
    outPath,
    JSON.stringify(
      { ok: result.ok, issues: result.issues, checkedAt: new Date().toISOString() },
      null,
      2,
    ) + "\n",
  );
  if (!result.ok) fail(`leakage detected:\n${result.issues.join("\n")}`);
  console.log(`no-leakage PASSED -> ${outPath}`);
}

/** Verify source bytes against an authorized root dir, or digests against a trusted inventory. */
function verifySources(manifestPath: string, rootOrInventory: string, outPath: string): void {
  const manifest = loadValidManifest(manifestPath);
  let report;
  if (rootOrInventory.endsWith(".json")) {
    const inv = readJson<
      { files?: { sha256: string; sizeBytes: number }[] } | { sha256: string; sizeBytes: number }[]
    >(rootOrInventory);
    const files = Array.isArray(inv) ? inv : (inv.files ?? []);
    const records: TrustedInventoryRecord[] = files.map((f) => ({
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
    }));
    report = verifySourcesAgainstInventory(manifest, records);
  } else {
    if (!existsSync(rootOrInventory) || !statSync(rootOrInventory).isDirectory())
      fail(`authorized root is not a directory: ${rootOrInventory}`);
    // Confined reader resists both `..` traversal and symlink escape (canonical-root containment).
    report = verifySourcesWithReader(manifest, createAuthorizedRootReader(rootOrInventory));
  }
  // Bounded report: relative refs only, never absolute private paths.
  writeFileSync(
    outPath,
    JSON.stringify(
      { ok: report.ok, results: report.results, checkedAt: new Date().toISOString() },
      null,
      2,
    ) + "\n",
  );
  if (!report.ok)
    fail(
      `source verification FAILED (${report.results.filter((r) => !r.ok).length} of ${report.results.length}) -> ${outPath}`,
    );
  console.log(`source verification PASSED (${report.results.length} sources) -> ${outPath}`);
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "skeleton":
    if (args.length !== 2) fail("skeleton <candidates.json> <out-manifest.json>");
    skeleton(args[0], args[1]);
    break;
  case "validate":
    if (args.length !== 1) fail("validate <manifest.json>");
    validate(args[0]);
    break;
  case "accounting":
    if (args.length !== 2) fail("accounting <manifest.json> <out.json>");
    accounting(args[0], args[1]);
    break;
  case "no-leakage":
    if (args.length !== 2) fail("no-leakage <manifest.json> <out.json>");
    noLeakage(args[0], args[1]);
    break;
  case "verify-sources":
    if (args.length !== 3)
      fail(
        "verify-sources <manifest.json> <authorized-root-dir | trusted-inventory.json> <out.json>",
      );
    verifySources(args[0], args[1], args[2]);
    break;
  default:
    fail(
      `unknown command ${cmd ?? "(none)"} — use skeleton|validate|accounting|no-leakage|verify-sources`,
    );
}
