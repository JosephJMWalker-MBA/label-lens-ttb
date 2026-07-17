/**
 * Ship-readiness run-002 declaration-intake CLI (Issues #124 / #127).
 *
 * A generic tool that operates on a gitignored local workspace. It carries no
 * image bytes, no private paths, and no declared values — those are supplied at
 * run time. It never reads label artwork and never produces declared values;
 * declared brand/alcohol values must be established independently by controlled
 * human intake or genuine records before randomization.
 *
 * Subcommands:
 *   skeleton    <candidates.json> <out-manifest.json>
 *   validate    <manifest.json>
 *   accounting  <manifest.json> <out.json>
 *   no-leakage  <manifest.json> <out.json>
 *
 * Run with: npx vite-node --config vitest.config.ts scripts/pilots/declaration-intake.ts <cmd> ...
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  DECLARATION_MANIFEST_SCHEMA_VERSION,
  PRODUCT_BOUNDARY_STATEMENT,
  checkNoLeakage,
  computeCandidateAccounting,
  computeEntryDigest,
  computeManifestDigest,
  validateDeclarationManifest,
  type DeclarationEligibilityState,
  type DeclarationEntry,
  type DeclarationManifest,
  type DeclarationMediaType,
} from "../../src/pilots/ship-readiness/declaration-manifest.ts";

function fail(message: string): never {
  console.error(`declaration-intake: ${message}`);
  process.exit(1);
}
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

interface CandidateInput {
  run002CaseId: string;
  sourceImageRef: string;
  sourceImageSha256: string;
  sourceMediaType: DeclarationMediaType;
  sourceByteSize: number;
  priorPilotIdentity: string | null;
  eligibility: DeclarationEligibilityState;
  reason?: string | null;
}

/** Build a pre-declaration skeleton: no declared values, provenance pending. */
function skeleton(candidatesPath: string, outPath: string): void {
  const candidates = readJson<CandidateInput[]>(candidatesPath);
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
    manifestDigest: null,
  };
  const withDigest: DeclarationManifest = { ...base, manifestDigest: computeManifestDigest(base) };
  const result = validateDeclarationManifest(withDigest);
  if (!result.ok) fail(`skeleton invalid:\n${result.issues.join("\n")}`);
  writeFileSync(outPath, JSON.stringify(withDigest, null, 2) + "\n");
  console.log(`wrote validated skeleton (${entries.length} candidates) -> ${outPath}`);
}

function validate(manifestPath: string): void {
  const result = validateDeclarationManifest(readJson<DeclarationManifest>(manifestPath));
  if (!result.ok) fail(`validation FAILED:\n${result.issues.join("\n")}`);
  console.log("validation PASSED");
}

function accounting(manifestPath: string, outPath: string): void {
  const acct = computeCandidateAccounting(readJson<DeclarationManifest>(manifestPath));
  writeFileSync(outPath, JSON.stringify(acct, null, 2) + "\n");
  console.log(
    `accounting: total ${acct.totalCandidateImages}, primary ${acct.primaryBlindCandidates}, pending ${acct.pending}, non-blind ${acct.nonBlindOperational}, excluded ${acct.excluded} -> ${outPath}`,
  );
}

function noLeakage(manifestPath: string, outPath: string): void {
  const result = checkNoLeakage(readJson<DeclarationManifest>(manifestPath));
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
  default:
    fail(`unknown command ${cmd ?? "(none)"} — use skeleton|validate|accounting|no-leakage`);
}
