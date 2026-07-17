/**
 * Ship-readiness run-002 declaration-intake CLI (Issues #124 / #127).
 *
 * A generic tool that operates on a gitignored local workspace. It carries no
 * image bytes, no private paths, and no declared values — those are supplied at
 * run time. It never reads label artwork and never produces declared values;
 * declared brand/alcohol values must be established independently by controlled
 * human intake or genuine records before randomization. Every JSON input path is
 * read through one bounded reader (no uncaught exceptions) and validated
 * fail-closed before use.
 *
 * Subcommands:
 *   skeleton                    <candidates.json> <out-manifest.json>
 *   validate                    <manifest.json>
 *   accounting                  <manifest.json> <out.json>
 *   no-leakage                  <manifest.json> <out.json>
 *   verify-source-bytes         <manifest.json> <authorized-root-dir> <out.json>
 *   verify-inventory-membership <manifest.json> <trusted-inventory.json> <out.json>
 *
 * `verify-source-bytes` reads the actual source bytes and recomputes SHA-256,
 * byte size, and media type (root-confined; traversal + symlink escape rejected).
 * `verify-inventory-membership` proves digest + byte-size membership only — it
 * does NOT read or sniff any source bytes. The two are never conflated.
 *
 * Run with: npx vite-node --config vitest.config.ts scripts/pilots/declaration-intake.ts <cmd> ...
 */
import { existsSync, statSync, writeFileSync } from "node:fs";

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
  readJsonFile,
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

/** Bounded JSON read: concise governed error, never an uncaught exception/stack. */
function loadJson(path: string): unknown {
  const result = readJsonFile(path);
  if (!result.ok) fail(result.error);
  return result.value;
}

/** Load + validate a manifest fail-closed before any typed use. */
function loadValidManifest(path: string): DeclarationManifest {
  const raw = loadJson(path);
  const result = validateDeclarationManifest(raw);
  if (!result.ok) fail(`manifest invalid:\n${result.issues.join("\n")}`);
  return raw as DeclarationManifest;
}

/** Build a pre-declaration skeleton: no declared values, provenance pending. */
function skeleton(candidatesPath: string, outPath: string): void {
  const parsed = parseCandidateInputs(loadJson(candidatesPath));
  if (!parsed.ok) fail(`candidates invalid:\n${parsed.issues.join("\n")}`);
  const entries: DeclarationEntry[] = parsed.candidates.map((c) => {
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
  const result = validateDeclarationManifest(loadJson(manifestPath));
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

const BYTES_VERIFIES =
  "actual source bytes read under the authorized root: recomputed SHA-256, byte size, and sniffed media type; `..` traversal and symlink escape rejected";
const MEMBERSHIP_VERIFIES =
  "trusted-inventory membership by digest and byte size only; source bytes are NOT read or sniffed";

function writeVerificationReport(
  outPath: string,
  mode: string,
  verifies: string,
  report: { ok: boolean; results: readonly unknown[] },
): void {
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        mode,
        verifies,
        ok: report.ok,
        results: report.results,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
}

/** Actual-byte verification confined to an authorized root. */
function verifySourceBytes(manifestPath: string, rootDir: string, outPath: string): void {
  const manifest = loadValidManifest(manifestPath);
  if (!existsSync(rootDir) || !statSync(rootDir).isDirectory())
    fail(`authorized root is not a directory: ${rootDir}`);
  const report = verifySourcesWithReader(manifest, createAuthorizedRootReader(rootDir));
  writeVerificationReport(outPath, "AUTHORIZED_ROOT_BYTES", BYTES_VERIFIES, report);
  if (!report.ok)
    fail(
      `source-byte verification FAILED (${report.results.filter((r) => !r.ok).length} of ${report.results.length}) -> ${outPath}`,
    );
  console.log(`source-byte verification PASSED (${report.results.length} sources) -> ${outPath}`);
}

/** Digest + byte-size membership against a trusted inventory (no byte reading). */
function verifyInventoryMembership(
  manifestPath: string,
  inventoryPath: string,
  outPath: string,
): void {
  const manifest = loadValidManifest(manifestPath);
  const inv = loadJson(inventoryPath);
  const files: unknown = Array.isArray(inv) ? inv : ((inv as { files?: unknown }).files ?? []);
  if (!Array.isArray(files))
    fail("trusted inventory must be an array or an object with a files[] array");
  const records: TrustedInventoryRecord[] = [];
  for (const f of files)
    if (f && typeof f === "object" && typeof (f as { sha256?: unknown }).sha256 === "string")
      records.push({
        sha256: (f as { sha256: string }).sha256,
        sizeBytes: (f as { sizeBytes: number }).sizeBytes,
      });
  const report = verifySourcesAgainstInventory(manifest, records);
  writeVerificationReport(outPath, "TRUSTED_INVENTORY_MEMBERSHIP", MEMBERSHIP_VERIFIES, report);
  if (!report.ok)
    fail(
      `inventory membership verification FAILED (${report.results.filter((r) => !r.ok).length} of ${report.results.length}) -> ${outPath}`,
    );
  console.log(
    `inventory membership verification PASSED (${report.results.length} sources) -> ${outPath}`,
  );
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
  case "verify-source-bytes":
    if (args.length !== 3)
      fail("verify-source-bytes <manifest.json> <authorized-root-dir> <out.json>");
    verifySourceBytes(args[0], args[1], args[2]);
    break;
  case "verify-inventory-membership":
    if (args.length !== 3)
      fail("verify-inventory-membership <manifest.json> <trusted-inventory.json> <out.json>");
    verifyInventoryMembership(args[0], args[1], args[2]);
    break;
  default:
    fail(
      `unknown command ${cmd ?? "(none)"} — use skeleton|validate|accounting|no-leakage|verify-source-bytes|verify-inventory-membership`,
    );
}
