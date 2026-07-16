/**
 * Ship-readiness pilot intake CLI (Issues #120 / #121).
 *
 * A reusable, generic tool. It contains no private image bytes, no original
 * local filenames, and no expected answers — those live only in the gitignored
 * local pilot workspace it operates on. All arguments are paths the operator
 * supplies at run time.
 *
 * Subcommands:
 *   build         <objective-metadata.tsv> <dispositions.json> <out-manifest.json>
 *   validate      <manifest.json> <raw-dir> [derivatives-dir]
 *   counterbalance <manifest.json> <seed> <out-order.json>
 *   worksheets    <order.json> <out-dir>
 *
 * Run with: node --experimental-strip-types --no-warnings scripts/pilots/pilot-intake.ts <cmd> ...
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  PILOT_INTAKE_SCHEMA_VERSION,
  generateCounterbalancedOrder,
  renderWorksheet,
  reviewOrderIsReproducible,
  validatePilotManifest,
  worksheetTargetPilotIds,
  type CounterbalancedOrder,
  type PilotCaseEntry,
  type PilotChallengeTag,
  type PilotManifest,
} from "../../src/pilots/ship-readiness/pilot-intake.ts";

function fail(message: string): never {
  console.error(`pilot-intake: ${message}`);
  process.exit(1);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Build a manifest from objective metadata (TSV) + a human dispositions file. */
function build(metadataTsv: string, dispositionsPath: string, outPath: string): void {
  const rows = readFileSync(metadataTsv, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t"));
  type Disposition = {
    intakeStatus: PilotCaseEntry["intakeStatus"];
    reason: string | null;
    challengeTags: PilotChallengeTag[];
    challengeTagNote?: string | null;
    nearDuplicateSuspicion?: string | null;
    provenanceStatus?: PilotCaseEntry["provenanceStatus"];
  };
  const dispositions = readJson<Record<string, Disposition>>(dispositionsPath);

  const cases: PilotCaseEntry[] = rows.map((cols) => {
    const [pilotId, originalFile, mediaType, bytes, width, height, orientation, sha] = cols;
    const d = dispositions[pilotId];
    if (!d) fail(`no disposition for ${pilotId}`);
    return {
      pilotId,
      localFilenameRef: originalFile,
      sourceDigest: sha,
      mediaType: mediaType as PilotCaseEntry["mediaType"],
      byteSize: Number(bytes),
      width: Number(width),
      height: Number(height),
      orientationMetadata: orientation === "<nil>" ? "none" : orientation,
      derivative: null,
      provenanceStatus: d.provenanceStatus ?? "PENDING_HUMAN_CONFIRMATION",
      intakeStatus: d.intakeStatus,
      exclusionOrPendingReason: d.reason,
      challengeTags: d.challengeTags,
      challengeTagNote: d.challengeTagNote ?? null,
      nearDuplicateSuspicion: d.nearDuplicateSuspicion ?? null,
      preparedAt: new Date().toISOString(),
      preparedBy: "pilot-intake-cli",
      containsExpectedValues: false,
      containsOcrOrModelOutput: false,
      containsComplianceJudgment: false,
    };
  });

  const ids = cases.map((c) => Number(c.pilotId.slice(-3)));
  const manifest: PilotManifest = {
    schemaVersion: PILOT_INTAKE_SCHEMA_VERSION,
    pilotCorpusId: "ship-readiness-001",
    expectedCaseCount: cases.length,
    firstId: Math.min(...ids),
    lastId: Math.max(...ids),
    preparedAt: new Date().toISOString(),
    preparedBy: "pilot-intake-cli",
    cases,
  };

  const result = validatePilotManifest(manifest);
  if (!result.ok) fail(`manifest invalid:\n${result.issues.join("\n")}`);
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`built + validated manifest (${cases.length} cases) -> ${outPath}`);
}

/** Validate a manifest and prove the raw files were not modified after intake. */
function validate(manifestPath: string, rawDir: string, derivDir?: string): void {
  const manifest = readJson<PilotManifest>(manifestPath);
  const result = validatePilotManifest(manifest);
  const issues = [...result.issues];

  for (const entry of manifest.cases) {
    const rawPath = join(
      rawDir,
      `${entry.pilotId}.${entry.mediaType === "image/png" ? "png" : "jpeg"}`,
    );
    if (!existsSync(rawPath)) {
      issues.push(`${entry.pilotId}: raw file missing at ${basename(rawPath)}`);
      continue;
    }
    const actual = sha256(readFileSync(rawPath));
    if (actual !== entry.sourceDigest)
      issues.push(`${entry.pilotId}: raw digest changed since intake (file was modified)`);
    if (entry.derivative && derivDir) {
      const dPath = join(derivDir, basename(entry.derivative.derivativeRef));
      if (!existsSync(dPath)) issues.push(`${entry.pilotId}: derivative missing`);
      else if (sha256(readFileSync(dPath)) !== entry.derivative.derivativeDigest)
        issues.push(`${entry.pilotId}: derivative digest mismatch`);
    }
  }

  if (issues.length > 0) fail(`validation FAILED:\n${issues.join("\n")}`);
  console.log(
    `validation PASSED: ${manifest.cases.length} cases, raw bytes unmodified, no expected values.`,
  );
}

function counterbalance(manifestPath: string, seedArg: string, outPath: string): void {
  const manifest = readJson<PilotManifest>(manifestPath);
  const seed = Number(seedArg);
  if (!Number.isInteger(seed)) fail("seed must be an integer");
  const includedIds = manifest.cases
    .filter((c) => c.intakeStatus === "INCLUDED")
    .map((c) => c.pilotId);
  const order = generateCounterbalancedOrder(includedIds, seed);
  if (!reviewOrderIsReproducible(order)) fail("generated order is not reproducible");
  writeFileSync(outPath, JSON.stringify(order, null, 2) + "\n");
  console.log(
    `counterbalanced ${includedIds.length} included cases (seed ${seed}; ${order.manualFirstCount} manual-first, ${order.assistedFirstCount} assisted-first) -> ${outPath}`,
  );
}

function worksheets(orderPath: string, outDir: string): void {
  const order = readJson<CounterbalancedOrder>(orderPath);
  mkdirSync(outDir, { recursive: true });
  // Only the INCLUDED cases the order was built over receive a worksheet, each
  // rendered in its preregistered first-pass mode. Excluded cases get none.
  const targets = worksheetTargetPilotIds(order);
  for (const pilotId of targets) {
    const firstMode = order.firstModeByCase[pilotId];
    writeFileSync(join(outDir, `${pilotId}.worksheet.md`), renderWorksheet(pilotId, firstMode));
  }
  console.log(`wrote ${targets.length} order-aware worksheet instances -> ${outDir}`);
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "build":
    if (args.length !== 3) fail("build <metadata.tsv> <dispositions.json> <out-manifest.json>");
    build(args[0], args[1], args[2]);
    break;
  case "validate":
    if (args.length < 2) fail("validate <manifest.json> <raw-dir> [derivatives-dir]");
    validate(args[0], args[1], args[2]);
    break;
  case "counterbalance":
    if (args.length !== 3) fail("counterbalance <manifest.json> <seed> <out-order.json>");
    counterbalance(args[0], args[1], args[2]);
    break;
  case "worksheets":
    if (args.length !== 2) fail("worksheets <order.json> <out-dir>");
    worksheets(args[0], args[1]);
    break;
  default:
    fail(`unknown command ${cmd ?? "(none)"} — use build|validate|counterbalance|worksheets`);
}
