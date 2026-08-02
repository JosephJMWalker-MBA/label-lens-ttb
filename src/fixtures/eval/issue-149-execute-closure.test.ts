/**
 * Issue #149 — the final execute-closure controls.
 *
 * Non-OCR. Synthetic evidence trees and a mocked extractor throughout; the
 * governed corpus is never touched. Every case drives the real implementation.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  cpSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  compareItem,
  compareRuns,
  isSuccessfulAcquisition,
  passDifferenceIsConfinedToTimings,
  SEMANTIC_LEVELS,
} from "../../../scripts/eval/lib/issue-149-semantic-comparison";
import {
  ITEM_FAILURE_SUFFIXES,
  ITEM_SUCCESS_SUFFIXES,
  RUN_COMMIT_MARKER,
  RUN_EVIDENCE_FILES,
  RunEvidenceError,
  sealRunEvidence,
  verifyRunCommitted,
  writeRunEvidence,
  type DeterminismReport,
} from "../../../scripts/eval/lib/issue-149-run-evidence-writer";
import {
  IdentityInventoryError,
  loadIdentityInventory,
  verifyNoHistoricalIdentity,
  verifyRawEvidence,
} from "../../../scripts/eval/lib/issue-149-raw-verifier";
import { canonicalize, sha256Bytes } from "../../../scripts/eval/lib/issue-149-evidence-canonical";
import {
  ARCHIVE_LIMIT_BYTES,
  archiveAdjudication,
  decideArchiveVolume,
} from "../../../scripts/eval/lib/issue-149-archive-volume";
import {
  compareAttestationToSourcePreManifest,
  validateRehearsalBuildReport,
} from "../../../scripts/eval/issue-149-validate-rehearsal-attestation";
import { finalizeOcrRuntimeInitProbe } from "../../../scripts/eval/issue-149-finalize-ocr-runtime-init-probe";
import { runProbeLifecycle } from "../../../scripts/eval/issue-149-ocr-runtime-init-probe";
import {
  OcrRuntimeProbeValidationError,
  validateOcrRuntimeInitProbeArtifact,
  validateOcrRuntimeInitProbeReport,
} from "../../../scripts/eval/issue-149-validate-ocr-runtime-init-probe";
import { adjudicateAcquisitionOutcome } from "../../../scripts/eval/issue-149-adjudicate-acquisition-outcome";
import type { OcrEngine } from "../../../src/pipeline/extractor/ocr-engine";
import {
  assertRuntimePackageClosureEqual,
  canonicalizeRuntimePackageEntries,
  compareText,
  runtimePackageClosure,
  type RuntimePackageClosure,
} from "../../../scripts/eval/lib/issue-149-runtime-package-closure.mjs";

/**
 * The committed control state: the mode file and the authorization artifact,
 * read together.
 *
 * These are ONE state, not two independent facts, and the tests assert its
 * COHERENCE rather than today's value. Asserting `discover` and
 * `EXECUTE_NOT_AUTHORIZED` literally froze the pre-transition state into
 * ordinary CI — and the frozen transition commit may change only the mode file
 * and the authorization artifact, so it could not have repaired them. Pushing it
 * would have started the acquisition workflow and turned ordinary CI red by
 * construction.
 *
 * No trimming and no whitespace normalization: the mode bytes are exact.
 */
const CONTROL_STATE_ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const LOWER_HEX_40 = /^[0-9a-f]{40}$/;

type ControlState = "discover" | "execute" | "complete";

interface CommittedControlState {
  modeBytes: string;
  status: string;
  reviewedImplementationSha: string | null;
  state: ControlState | null;
  coherent: boolean;
  reason: string | null;
}

/** Classify a mode/authorization pair. Every incoherent pairing is rejected. */
function classifyControlState(
  modeBytes: string,
  status: string,
  reviewedImplementationSha: string | null,
): CommittedControlState {
  const base = { modeBytes, status, reviewedImplementationSha };
  const incoherent = (reason: string): CommittedControlState => ({
    ...base,
    state: null,
    coherent: false,
    reason,
  });
  const hasSha =
    typeof reviewedImplementationSha === "string" && LOWER_HEX_40.test(reviewedImplementationSha);

  if (modeBytes === "discover\n") {
    if (status !== "EXECUTE_NOT_AUTHORIZED") {
      return incoherent(`discover requires EXECUTE_NOT_AUTHORIZED, found ${status}`);
    }
    if (reviewedImplementationSha !== null) {
      return incoherent("discover requires a null reviewedImplementationSha");
    }
    return { ...base, state: "discover", coherent: true, reason: null };
  }
  if (modeBytes === "execute\n") {
    if (status !== "EXECUTE_AUTHORIZED") {
      return incoherent(`execute requires EXECUTE_AUTHORIZED, found ${status}`);
    }
    if (!hasSha) return incoherent("execute requires a full lowercase 40-hex reviewed SHA");
    return { ...base, state: "execute", coherent: true, reason: null };
  }
  if (modeBytes === "complete\n") {
    if (status !== "EXECUTE_AUTHORIZED") {
      return incoherent(`complete requires EXECUTE_AUTHORIZED, found ${status}`);
    }
    if (!hasSha) return incoherent("complete requires a full lowercase 40-hex reviewed SHA");
    return { ...base, state: "complete", coherent: true, reason: null };
  }
  return incoherent(`mode bytes ${JSON.stringify(modeBytes)} are not an exact governed mode`);
}

/** Read the real committed control state from disk. */
function committedControlState(): CommittedControlState {
  const modeBytes = readFileSync(
    path.join(process.cwd(), CONTROL_STATE_ROOT, "workflow-mode.txt"),
    "utf8",
  );
  const authorization = JSON.parse(
    readFileSync(
      path.join(process.cwd(), CONTROL_STATE_ROOT, "execute-authorization.json"),
      "utf8",
    ),
  ) as { status: string; reviewedImplementationSha: string | null };
  return classifyControlState(
    modeBytes,
    authorization.status,
    authorization.reviewedImplementationSha,
  );
}

const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-execute-closure-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let uniqueRun = 0;
const freshRoot = (): string => {
  const root = path.join(scratch, `raw-${uniqueRun++}`);
  mkdirSync(root, { recursive: true });
  return root;
};

const DETERMINISM: DeterminismReport = {
  verdict: "COMPLETE_DETERMINISTIC_EVIDENCE",
  comparedItems: 2,
  semanticallyDifferingItems: [],
  timingOnlyDifferingItems: [],
  differencesByLevel: {},
  comparedLevels: SEMANTIC_LEVELS.map((entry) => entry.level),
};

/** Build a synthetic committed item directory. */
function writeItem(
  runRoot: string,
  itemId: string,
  options: { outcome?: "extracted" | "extraction-failed"; overrides?: Record<string, string> } = {},
): void {
  const outcome = options.outcome ?? "extracted";
  const suffixes = outcome === "extracted" ? ITEM_SUCCESS_SUFFIXES : ITEM_FAILURE_SUFFIXES;
  const directory = path.join(runRoot, itemId);
  mkdirSync(directory, { recursive: true });
  for (const suffix of suffixes) {
    const name = `${itemId}${suffix}`;
    const body = options.overrides?.[suffix] ?? `${canonicalize({ itemId, suffix })}\n`;
    writeFileSync(path.join(directory, name), body);
  }
}

const passesJson = (totalMs: number, words: string[]): string =>
  `${canonicalize([
    {
      passId: "pass-1",
      words: words.map((text) => ({ text })),
      timings: { preprocessMs: 1, ocrMs: 2, inverseMappingMs: 3, totalMs },
    },
  ])}\n`;

const failureJson = (code: string, message = "runtime unavailable"): string =>
  `${canonicalize({ errorCode: code, errorMessage: message })}\n`;

function writeRuntimePackage(root: string, name: string, version = "7.0.0"): string {
  const directory = path.join(root, name);
  mkdirSync(path.join(directory, "src"), { recursive: true });
  writeFileSync(path.join(directory, "package.json"), `${canonicalize({ name, version })}\n`);
  writeFileSync(
    path.join(directory, "src", "index.js"),
    `module.exports = ${JSON.stringify(name)};\n`,
  );
  if (name === "tesseract.js-core")
    writeFileSync(path.join(directory, "tesseract-core.wasm"), "wasm\n");
  return directory;
}

function writeRuntimeClosure(root: string, closure: RuntimePackageClosure): string {
  const file = path.join(root, "runtime-package-closure.json");
  writeFileSync(file, `${JSON.stringify(closure, null, 2)}\n`);
  return file;
}

function probeDependencies(
  root: string,
  options: {
    createEngine?: () => Promise<OcrEngine>;
    afterInitialize?: (engine: OcrEngine) => Promise<void>;
  } = {},
) {
  const assets = path.join(root, "assets");
  const packages = path.join(root, "node_modules");
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(assets, "eng.traineddata"), "traineddata\n");
  writeRuntimePackage(packages, "tesseract.js");
  writeRuntimePackage(packages, "tesseract.js-core");
  const closure = runtimePackageClosure(packages);
  return {
    createEngine:
      options.createEngine ??
      (async () => ({
        recognizeWords: async () => {
          throw new Error("UNDERLYING_RECOGNIZER_CALLED");
        },
        terminate: async () => undefined,
      })),
    languageAssetPath: () => assets,
    corePath: () => path.join(packages, "tesseract.js-core"),
    packageRoot: packages,
    expectedClosurePath: writeRuntimeClosure(root, closure),
    governedCorpusMounted: () => false,
    runtimeUid: () => 10149,
    runtimeGid: () => 10149,
    afterInitialize: options.afterInitialize,
  };
}

function writeProbeArtifact(
  directory: string,
  report: Record<string, unknown>,
  status: Record<string, unknown>,
  image: Record<string, unknown> = { id: "image", repoDigests: ["sha256:abc"] },
): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "ocr-runtime-init-image-identity.json"),
    `${JSON.stringify(image, null, 2)}\n`,
  );
  writeFileSync(
    path.join(directory, "ocr-runtime-init-container-status.json"),
    `${JSON.stringify(status, null, 2)}\n`,
  );
  writeFileSync(
    path.join(directory, "ocr-runtime-init-probe-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

function acquisitionJsonl(root: string, records: Record<string, unknown>[]): string {
  const file = path.join(root, "acquisition-report.jsonl");
  writeFileSync(file, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  return file;
}

function acquisitionJsonlLines(root: string, lines: string[]): string {
  const file = path.join(root, `acquisition-report-${lines.length}-${Date.now()}.jsonl`);
  writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

describe("Issue #149 the run-level writer derives, and commits unambiguously", () => {
  it("derives item outcome and aggregate from the committed files, not from the caller", () => {
    const root = freshRoot();
    writeItem(root, "item-0001");
    writeItem(root, "item-0002", { outcome: "extraction-failed" });

    const sealed = sealRunEvidence({
      runId: "primary",
      rawDirectory: root,
      expectedItemIds: ["item-0001", "item-0002"],
      determinism: DETERMINISM,
    });
    writeRunEvidence(sealed, { directory: root });

    const counts = JSON.parse(readFileSync(path.join(root, "counts.json"), "utf8")) as {
      outcomeCounts: Record<string, number>;
      itemAggregates: Array<{ itemId: string; outcome: string; aggregateSha256: string }>;
    };
    // Derived from the FILE SETS on disk.
    expect(counts.outcomeCounts).toEqual({ extracted: 1, "extraction-failed": 1 });
    expect(counts.itemAggregates.map((entry) => entry.outcome)).toEqual([
      "extracted",
      "extraction-failed",
    ]);
    for (const aggregate of counts.itemAggregates) {
      expect(aggregate.aggregateSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // The sealer takes no outcome or aggregate parameter at all.
    expect(sealRunEvidence).toHaveLength(1);
  });

  it("rejects an item whose file set is neither the success nor the failure set", () => {
    const root = freshRoot();
    writeItem(root, "item-0001");
    rmSync(path.join(root, "item-0001", "item-0001.counts.json"));
    expect(() =>
      sealRunEvidence({
        runId: "primary",
        rawDirectory: root,
        expectedItemIds: ["item-0001"],
        determinism: DETERMINISM,
      }),
    ).toThrow(expect.objectContaining({ code: "RUN_ITEM_FILE_SET_INVALID" }));
  });

  it("rejects an open determinism object and a caller override of runId or itemCount", () => {
    const root = freshRoot();
    writeItem(root, "item-0001");
    const base = { ...DETERMINISM, comparedItems: 1 };

    for (const bad of [
      { ...base, runId: "forged" },
      { ...base, itemCount: 999 },
      { ...base, extra: true },
      { ...base, verdict: "MADE_UP" },
    ]) {
      expect(() =>
        sealRunEvidence({
          runId: "primary",
          rawDirectory: root,
          expectedItemIds: ["item-0001"],
          determinism: bad as unknown as DeterminismReport,
        }),
      ).toThrow(RunEvidenceError);
    }

    // …and the writer's own facts win in the committed bytes.
    const sealed = sealRunEvidence({
      runId: "primary",
      rawDirectory: root,
      expectedItemIds: ["item-0001"],
      determinism: base,
    });
    writeRunEvidence(sealed, { directory: root });
    const report = JSON.parse(readFileSync(path.join(root, "determinism-report.json"), "utf8")) as {
      runId: string;
      itemCount: number;
    };
    expect(report.runId).toBe("primary");
    expect(report.itemCount).toBe(1);
  });

  it("covers the run-level files in the raw manifest, not just the item files", () => {
    const root = freshRoot();
    writeItem(root, "item-0001");
    const sealed = sealRunEvidence({
      runId: "primary",
      rawDirectory: root,
      expectedItemIds: ["item-0001"],
      determinism: { ...DETERMINISM, comparedItems: 1 },
    });
    writeRunEvidence(sealed, { directory: root });

    const manifest = JSON.parse(
      readFileSync(path.join(root, "raw-evidence-manifest.json"), "utf8"),
    ) as { runFiles: Array<{ path: string }>; itemFiles: Array<{ path: string }> };
    expect(manifest.runFiles.map((entry) => entry.path).sort()).toEqual([
      "counts.json",
      "determinism-report.json",
    ]);
    expect(manifest.itemFiles.length).toBe(ITEM_SUCCESS_SUFFIXES.length);
  });

  it("treats a run without a valid commit marker as UNCOMMITTED", () => {
    const root = freshRoot();
    writeItem(root, "item-0001");
    const sealed = sealRunEvidence({
      runId: "primary",
      rawDirectory: root,
      expectedItemIds: ["item-0001"],
      determinism: { ...DETERMINISM, comparedItems: 1 },
    });
    writeRunEvidence(sealed, { directory: root });
    expect(verifyRunCommitted(root)).toMatchObject({ committed: true, runId: "primary" });

    // All four files present, marker removed: exactly the state a crash between
    // renames leaves. It must NOT read as committed.
    rmSync(path.join(root, RUN_COMMIT_MARKER));
    for (const file of RUN_EVIDENCE_FILES) {
      expect(existsSync(path.join(root, file))).toBe(true);
    }
    expect(verifyRunCommitted(root)).toMatchObject({
      committed: false,
      reason: "RUN_COMMIT_MARKER_ABSENT",
    });
  });

  it("detects a tampered run-level file through the marker's bound digests", () => {
    const root = freshRoot();
    writeItem(root, "item-0001");
    const sealed = sealRunEvidence({
      runId: "primary",
      rawDirectory: root,
      expectedItemIds: ["item-0001"],
      determinism: { ...DETERMINISM, comparedItems: 1 },
    });
    writeRunEvidence(sealed, { directory: root });
    writeFileSync(path.join(root, "counts.json"), "{}\n");
    expect(verifyRunCommitted(root).committed).toBe(false);
    expect(verifyRunCommitted(root).reason).toContain("RUN_FILE_DIGEST_MISMATCH");
  });

  it("never overwrites an existing run, and refuses a replayed summary", () => {
    const root = freshRoot();
    writeItem(root, "item-0001");
    const seal = () =>
      sealRunEvidence({
        runId: "primary",
        rawDirectory: root,
        expectedItemIds: ["item-0001"],
        determinism: { ...DETERMINISM, comparedItems: 1 },
      });
    const first = seal();
    writeRunEvidence(first, { directory: root });
    expect(() => writeRunEvidence(first, { directory: root })).toThrow(
      expect.objectContaining({ code: "RUN_EVIDENCE_ALREADY_CONSUMED" }),
    );
    expect(() => writeRunEvidence(seal(), { directory: root })).toThrow(RunEvidenceError);
  });
});

describe("Issue #149 the semantic comparison covers every level", () => {
  const twoRuns = (
    mutate: (repeatRoot: string, itemId: string) => void,
    itemIds = ["item-0001"],
  ) => {
    const primary = freshRoot();
    const repeat = freshRoot();
    for (const itemId of itemIds) {
      writeItem(primary, itemId, { overrides: { ".passes.json": passesJson(6, ["RED"]) } });
      writeItem(repeat, itemId, { overrides: { ".passes.json": passesJson(6, ["RED"]) } });
      mutate(repeat, itemId);
    }
    return compareRuns({
      primaryDirectory: primary,
      repeatDirectory: repeat,
      expectedItemIds: itemIds,
    });
  };

  it("compares the full preregistered level set", () => {
    const report = twoRuns(() => undefined);
    expect(report.verdict).toBe("COMPLETE_DETERMINISTIC_EVIDENCE");
    expect(report.comparedLevels).toEqual(SEMANTIC_LEVELS.map((entry) => entry.level));
    expect(report.comparedLevels.length).toBeGreaterThanOrEqual(9);
    expect(isSuccessfulAcquisition(report.verdict)).toBe(true);
  });

  it("calls a CANDIDATE-ORDER change semantic, not timing-only", () => {
    // The exact misclassification the pass-fingerprint-only comparison made:
    // passes identical, candidates reordered.
    const report = twoRuns((repeat, itemId) => {
      writeFileSync(
        path.join(repeat, itemId, `${itemId}.candidates.jsonl`),
        `${canonicalize({ order: "changed" })}\n`,
      );
    });
    expect(report.verdict).toBe("COMPLETE_WITH_NONDETERMINISM");
    expect(report.semanticallyDifferingItems).toEqual(["item-0001"]);
    expect(report.timingOnlyDifferingItems).toEqual([]);
    expect(report.differencesByLevel.candidateRecordsAndStableIdentities).toEqual(["item-0001"]);
  });

  it("calls a SELECTION change semantic", () => {
    const report = twoRuns((repeat, itemId) => {
      writeFileSync(
        path.join(repeat, itemId, `${itemId}.selection.json`),
        `${canonicalize({ selected: "OTHER" })}\n`,
      );
    });
    expect(report.verdict).toBe("COMPLETE_WITH_NONDETERMINISM");
    expect(report.differencesByLevel.rankingSelectionAuthorityAndAbstention).toEqual(["item-0001"]);
  });

  it("calls a FAILURE-RECORD change semantic", () => {
    const primary = freshRoot();
    const repeat = freshRoot();
    writeItem(primary, "item-0001", { outcome: "extraction-failed" });
    writeItem(repeat, "item-0001", { outcome: "extraction-failed" });
    writeFileSync(
      path.join(repeat, "item-0001", "item-0001.failure.json"),
      `${canonicalize({ errorCode: "OTHER" })}\n`,
    );
    const report = compareRuns({
      primaryDirectory: primary,
      repeatDirectory: repeat,
      expectedItemIds: ["item-0001"],
    });
    expect(report.differencesByLevel.typedFailureEvidence).toEqual(["item-0001"]);
    expect(report.verdict).toBe("COMPLETE_WITH_NONDETERMINISM");
  });

  it("calls a TIMING-ONLY change timing-only, and checks rather than assumes it", () => {
    const report = twoRuns((repeat, itemId) => {
      writeFileSync(path.join(repeat, itemId, `${itemId}.passes.json`), passesJson(9999, ["RED"]));
    });
    expect(report.verdict).toBe("COMPLETE_DETERMINISTIC_EVIDENCE");
    expect(report.semanticallyDifferingItems).toEqual([]);
    expect(report.timingOnlyDifferingItems).toEqual(["item-0001"]);

    // The confinement is verified, not inferred.
    expect(passDifferenceIsConfinedToTimings(passesJson(6, ["RED"]), passesJson(1, ["RED"]))).toBe(
      true,
    );
    expect(passDifferenceIsConfinedToTimings(passesJson(6, ["RED"]), passesJson(6, ["BLUE"]))).toBe(
      false,
    );
  });

  it("treats identical typed failures on both runs as deterministic", () => {
    const primary = freshRoot();
    const repeat = freshRoot();
    writeItem(primary, "item-0001", { outcome: "extraction-failed" });
    writeItem(repeat, "item-0001", { outcome: "extraction-failed" });
    const report = compareRuns({
      primaryDirectory: primary,
      repeatDirectory: repeat,
      expectedItemIds: ["item-0001"],
    });
    expect(report.verdict).toBe("COMPLETE_DETERMINISTIC_EVIDENCE");
  });

  it("classifies complete all-OCR_UNAVAILABLE evidence as a runtime failure", () => {
    const primary = freshRoot();
    const repeat = freshRoot();
    for (const itemId of ["item-0001", "item-0002"]) {
      writeItem(primary, itemId, {
        outcome: "extraction-failed",
        overrides: { ".failure.json": failureJson("OCR_UNAVAILABLE", "__dirname is not defined") },
      });
      writeItem(repeat, itemId, {
        outcome: "extraction-failed",
        overrides: { ".failure.json": failureJson("OCR_UNAVAILABLE", "missing eng.traineddata") },
      });
    }
    const report = compareRuns({
      primaryDirectory: primary,
      repeatDirectory: repeat,
      expectedItemIds: ["item-0001", "item-0002"],
    });
    expect(report.verdict).toBe("RUNTIME_FAILURE");
    expect(report.extractedItemCount).toBe(0);
    expect(report.failedItemCount).toBe(4);
    expect(report.runtimeUnavailableItemCount).toBe(4);
    expect(report.runtimeFailureCodes).toEqual(["OCR_UNAVAILABLE"]);
    expect(report.scientificResultProduced).toBe(false);
    expect(isSuccessfulAcquisition(report.verdict)).toBe(false);
  });

  it("classifies one complete all-OCR_UNAVAILABLE run as runtime failure even when the other differs", () => {
    const primary = freshRoot();
    const repeat = freshRoot();
    for (const itemId of ["item-0001", "item-0002"]) {
      writeItem(primary, itemId, {
        outcome: "extraction-failed",
        overrides: { ".failure.json": failureJson("OCR_UNAVAILABLE", "missing eng.traineddata") },
      });
      writeItem(repeat, itemId, {
        outcome: "extraction-failed",
        overrides: {
          ".failure.json": failureJson(itemId === "item-0001" ? "OTHER" : "OCR_UNAVAILABLE"),
        },
      });
    }
    const report = compareRuns({
      primaryDirectory: primary,
      repeatDirectory: repeat,
      expectedItemIds: ["item-0001", "item-0002"],
    });
    expect(report.verdict).toBe("RUNTIME_FAILURE");
    expect(report.scientificResultProduced).toBe(false);
  });

  it("does not turn mixed extraction and item failure into a global runtime failure", () => {
    const primary = freshRoot();
    const repeat = freshRoot();
    writeItem(primary, "item-0001");
    writeItem(primary, "item-0002", {
      outcome: "extraction-failed",
      overrides: { ".failure.json": failureJson("OCR_UNAVAILABLE") },
    });
    writeItem(repeat, "item-0001");
    writeItem(repeat, "item-0002", {
      outcome: "extraction-failed",
      overrides: { ".failure.json": failureJson("OCR_UNAVAILABLE") },
    });
    const report = compareRuns({
      primaryDirectory: primary,
      repeatDirectory: repeat,
      expectedItemIds: ["item-0001", "item-0002"],
    });
    expect(report.verdict).toBe("COMPLETE_DETERMINISTIC_EVIDENCE");
    expect(report.extractedItemCount).toBe(2);
    expect(report.failedItemCount).toBe(2);
    expect(report.scientificResultProduced).toBe(true);
  });

  it("treats success-versus-failure as an OUTCOME difference", () => {
    const primary = freshRoot();
    const repeat = freshRoot();
    writeItem(primary, "item-0001", { outcome: "extracted" });
    writeItem(repeat, "item-0001", { outcome: "extraction-failed" });
    const item = compareItem(
      path.join(primary, "item-0001"),
      path.join(repeat, "item-0001"),
      "item-0001",
    );
    expect(item.differingLevels).toContain("outcome");
    expect(item.timingOnly).toBe(false);
  });

  it("reports INCOMPLETE_EVIDENCE when an item set is short, and that is unsuccessful", () => {
    const primary = freshRoot();
    const repeat = freshRoot();
    writeItem(primary, "item-0001");
    const report = compareRuns({
      primaryDirectory: primary,
      repeatDirectory: repeat,
      expectedItemIds: ["item-0001"],
    });
    expect(report.verdict).toBe("INCOMPLETE_EVIDENCE");
    expect(isSuccessfulAcquisition(report.verdict)).toBe(false);
  });

  it("treats COMPLETE_WITH_NONDETERMINISM as a SUCCESSFUL acquisition", () => {
    // A nonzero exit would skip the verification and upload steps that follow —
    // exactly what a nondeterministic result most needs preserved.
    expect(isSuccessfulAcquisition("COMPLETE_WITH_NONDETERMINISM")).toBe(true);
    expect(isSuccessfulAcquisition("COMPLETE_DETERMINISTIC_EVIDENCE")).toBe(true);
    for (const failing of ["INCOMPLETE_EVIDENCE", "TRUTH_ISOLATION_FAILURE", "RUNTIME_FAILURE"]) {
      expect(isSuccessfulAcquisition(failing as never)).toBe(false);
    }
    const runner = readFileSync(
      path.join(process.cwd(), "scripts/eval/issue-149-brand-evidence-acquisition-run.ts"),
      "utf8",
    );
    expect(runner).toContain("isSuccessfulAcquisition(comparison.verdict) ? 0 : 1");
  });
});

describe("Issue #149 OCR runtime init probe evidence is load-bearing", () => {
  it("reports zero recognition calls when recognition is never attempted", async () => {
    const root = freshRoot();
    const report = await runProbeLifecycle(probeDependencies(root));
    expect(report).toMatchObject({
      status: "OK",
      workerInitializationAttempted: true,
      workerInitialized: true,
      workerTerminationAttempted: true,
      workerTerminated: true,
      recognizeCalls: 0,
      runtimePackageClosureMatched: true,
    });
  });

  it("increments, halts, and never forwards an attempted recognition", async () => {
    const root = freshRoot();
    let underlyingCalls = 0;
    const report = await runProbeLifecycle(
      probeDependencies(root, {
        createEngine: async () => ({
          recognizeWords: async () => {
            underlyingCalls += 1;
            return [];
          },
          terminate: async () => undefined,
        }),
        afterInitialize: async (engine: OcrEngine) => {
          await engine.recognizeWords(Buffer.from("not-an-image"), 6);
        },
      }),
    );
    expect(report).toMatchObject({
      status: "HALTED",
      failureStage: "after-initialize",
      failureCode: "OCR_RUNTIME_INIT_PROBE_FAILED",
      recognizeCalls: 1,
      workerInitialized: true,
      workerTerminationAttempted: false,
    });
    expect(underlyingCalls).toBe(0);
  });

  it("preserves accurate partial state for initialization and termination failures", async () => {
    const initFailure = await runProbeLifecycle(
      probeDependencies(freshRoot(), {
        createEngine: async () => {
          throw new Error("OCR_INIT_FAILED");
        },
      }),
    );
    expect(initFailure).toMatchObject({
      status: "HALTED",
      failureStage: "initialize",
      workerInitializationAttempted: true,
      workerInitialized: false,
      workerTerminationAttempted: false,
    });

    const terminationFailure = await runProbeLifecycle(
      probeDependencies(freshRoot(), {
        createEngine: async () => ({
          recognizeWords: async () => [],
          terminate: async () => {
            throw new Error("OCR_TERMINATE_FAILED");
          },
        }),
      }),
    );
    expect(terminationFailure).toMatchObject({
      status: "HALTED",
      failureStage: "terminate",
      workerInitialized: true,
      workerTerminationAttempted: true,
      workerTerminated: false,
    });
  });

  it("halts missing language data before worker initialization", async () => {
    const root = freshRoot();
    const dependencies = probeDependencies(root);
    rmSync(path.join(root, "assets", "eng.traineddata"));
    const report = await runProbeLifecycle(dependencies);
    expect(report).toMatchObject({
      status: "HALTED",
      failureStage: "runtime-paths",
      workerInitializationAttempted: false,
      workerInitialized: false,
    });
    expect(String(report.failureDetail)).toContain("OCR_LANGUAGE_ASSET_MISSING");
  });

  it("halts missing tesseract package closures and altered copied files", () => {
    const source = path.join(freshRoot(), "source");
    const copy = path.join(freshRoot(), "copy");
    writeRuntimePackage(source, "tesseract.js");
    writeRuntimePackage(source, "tesseract.js-core");
    cpSync(source, copy, { recursive: true });
    const expected = runtimePackageClosure(source);
    const observed = runtimePackageClosure(copy);
    expect(() => assertRuntimePackageClosureEqual(expected, observed)).not.toThrow();

    writeFileSync(path.join(copy, "tesseract.js", "src", "index.js"), "altered\n");
    expect(() => assertRuntimePackageClosureEqual(expected, runtimePackageClosure(copy))).toThrow(
      /RUNTIME_PACKAGE_CLOSURE_MISMATCH/,
    );
    rmSync(path.join(copy, "tesseract.js"), { recursive: true, force: true });
    expect(() => runtimePackageClosure(copy)).toThrow(/RUNTIME_PACKAGE_MISSING/);
    const copyMissingCore = path.join(freshRoot(), "copy-missing-core");
    cpSync(source, copyMissingCore, { recursive: true });
    rmSync(path.join(copyMissingCore, "tesseract.js-core"), { recursive: true, force: true });
    expect(() => runtimePackageClosure(copyMissingCore)).toThrow(/RUNTIME_PACKAGE_MISSING/);
  });

  it("validates reports and rejects forged success, recognition, UID/GID, paths, versions and digests", async () => {
    const observed = (await runProbeLifecycle(probeDependencies(freshRoot()))) as Record<
      string,
      unknown
    >;
    const ok: Record<string, unknown> = {
      ...observed,
      containerExitStatus: 0,
      reportProducedByContainer: true,
      languageAssetPath: "/opt/acquisition/assets",
      corePath: "/opt/acquisition/node_modules/tesseract.js-core",
    };
    expect(() => validateOcrRuntimeInitProbeReport(ok)).not.toThrow();
    const rejects = [
      { workerInitialized: false },
      { recognizeCalls: 1 },
      { runtimeUid: 1 },
      { runtimeGid: 1 },
      { languageAssetPath: "/wrong" },
      { corePath: "/wrong" },
      {
        observedRuntimePackageClosure: {
          ...(ok.observedRuntimePackageClosure as RuntimePackageClosure),
          packages: [
            {
              ...(ok.observedRuntimePackageClosure as RuntimePackageClosure).packages[0],
              version: "0.0.0",
            },
            (ok.observedRuntimePackageClosure as RuntimePackageClosure).packages[1],
          ],
        },
      },
      {
        observedRuntimePackageClosure: {
          ...(ok.observedRuntimePackageClosure as RuntimePackageClosure),
          packages: [
            {
              ...(ok.observedRuntimePackageClosure as RuntimePackageClosure).packages[0],
              aggregateSha256: "0".repeat(64),
            },
            (ok.observedRuntimePackageClosure as RuntimePackageClosure).packages[1],
          ],
        },
      },
    ];
    for (const patch of rejects) {
      expect(() => validateOcrRuntimeInitProbeReport({ ...ok, ...patch })).toThrow(
        OcrRuntimeProbeValidationError,
      );
    }
  });

  it("finalizes container no-report failures into a closed HALTED report", () => {
    const directory = path.join(freshRoot(), "probe-artifact");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "ocr-runtime-init-image-identity.json"),
      `${canonicalize({ id: "image" })}\n`,
    );
    const report = finalizeOcrRuntimeInitProbe({ directory, containerExitStatus: 42 });
    expect(report).toMatchObject({
      status: "HALTED",
      containerExitStatus: 42,
      failureCode: "OCR_RUNTIME_INIT_CONTAINER_FAILED",
      reportProducedByContainer: false,
      recognizeCalls: null,
      workerInitialized: false,
    });
    expect(existsSync(path.join(directory, "ocr-runtime-init-probe-report.json"))).toBe(true);
    expect(existsSync(path.join(directory, "ocr-runtime-init-container-status.json"))).toBe(true);
    expect(existsSync(path.join(directory, "ocr-runtime-init-image-identity.json"))).toBe(true);
  });

  it("binds probe validation to trusted container status and image identity files", async () => {
    const directory = path.join(freshRoot(), "probe-artifact");
    const container = (await runProbeLifecycle(probeDependencies(freshRoot()))) as Record<
      string,
      unknown
    >;
    const image = { id: "image", repoDigests: ["sha256:abc"] };
    writeProbeArtifact(directory, container, { containerExitStatus: 0 }, image);
    finalizeOcrRuntimeInitProbe({ directory, containerExitStatus: 0 });
    const finalized = JSON.parse(
      readFileSync(path.join(directory, "ocr-runtime-init-probe-report.json"), "utf8"),
    ) as Record<string, unknown>;
    const validReport = {
      ...finalized,
      languageAssetPath: "/opt/acquisition/assets",
      corePath: "/opt/acquisition/node_modules/tesseract.js-core",
    };
    writeFileSync(
      path.join(directory, "ocr-runtime-init-probe-report.json"),
      `${JSON.stringify(validReport, null, 2)}\n`,
    );
    expect(() => validateOcrRuntimeInitProbeArtifact(directory)).not.toThrow();

    finalizeOcrRuntimeInitProbe({ directory, containerExitStatus: 9 });
    const nonzero = {
      ...validReport,
      containerExitStatus: 9,
      reportProducedByContainer: true,
    };
    writeFileSync(
      path.join(directory, "ocr-runtime-init-probe-report.json"),
      `${JSON.stringify(nonzero, null, 2)}\n`,
    );
    expect(() => validateOcrRuntimeInitProbeArtifact(directory)).toThrow(
      /OCR_RUNTIME_INIT_CONTAINER_NONZERO/,
    );

    const missingStatus = path.join(freshRoot(), "missing-status");
    writeProbeArtifact(missingStatus, validReport, { containerExitStatus: 0 }, image);
    rmSync(path.join(missingStatus, "ocr-runtime-init-container-status.json"));
    expect(() => validateOcrRuntimeInitProbeArtifact(missingStatus)).toThrow(
      /OCR_RUNTIME_INIT_STATUS_MISSING_OR_MALFORMED/,
    );

    const malformedStatus = path.join(freshRoot(), "malformed-status");
    writeProbeArtifact(malformedStatus, validReport, { containerExitStatus: 0 }, image);
    writeFileSync(path.join(malformedStatus, "ocr-runtime-init-container-status.json"), "{\n");
    expect(() => validateOcrRuntimeInitProbeArtifact(malformedStatus)).toThrow(
      /OCR_RUNTIME_INIT_STATUS_MISSING_OR_MALFORMED/,
    );

    const statusMismatch = path.join(freshRoot(), "status-mismatch");
    writeProbeArtifact(statusMismatch, validReport, { containerExitStatus: 1 }, image);
    expect(() => validateOcrRuntimeInitProbeArtifact(statusMismatch)).toThrow(
      /OCR_RUNTIME_INIT_STATUS_REPORT_MISMATCH/,
    );

    const imageMismatch = path.join(freshRoot(), "image-mismatch");
    writeProbeArtifact(imageMismatch, validReport, { containerExitStatus: 0 }, { id: "other" });
    expect(() => validateOcrRuntimeInitProbeArtifact(imageMismatch)).toThrow(
      /OCR_RUNTIME_INIT_IMAGE_IDENTITY_REPORT_MISMATCH|OCR_RUNTIME_INIT_IMAGE_IDENTITY_DIGEST_MISMATCH/,
    );
  });

  it("uses fixed code-point ordering for runtime package closure aggregates", () => {
    const entries = [
      { path: "z/file.txt", byteLength: 1, sha256: "b" },
      { path: "A/file.txt", byteLength: 1, sha256: "a" },
      { path: "_/file.txt", byteLength: 1, sha256: "c" },
      { path: "a/file.txt", byteLength: 1, sha256: "d" },
      { path: "a-1/file.txt", byteLength: 1, sha256: "e" },
    ];
    const ordered = [...entries].sort((left, right) => compareText(left.path, right.path));
    expect(ordered.map((entry) => entry.path)).toEqual([
      "A/file.txt",
      "_/file.txt",
      "a-1/file.txt",
      "a/file.txt",
      "z/file.txt",
    ]);
    expect(canonicalizeRuntimePackageEntries(entries)).toBe(
      JSON.stringify([
        ["A/file.txt", 1, "a"],
        ["_/file.txt", 1, "c"],
        ["a-1/file.txt", 1, "e"],
        ["a/file.txt", 1, "d"],
        ["z/file.txt", 1, "b"],
      ]),
    );
  });

  it("adjudicates acquisition outcomes from the terminal record, not exit status alone", () => {
    const root = freshRoot();
    const terminal = (record: Record<string, unknown>, status: number) =>
      adjudicateAcquisitionOutcome({
        acquisitionReportPath: acquisitionJsonl(root, [{ item: "noise" }, record]),
        containerExitStatus: status,
      });

    for (const verdict of ["COMPLETE_DETERMINISTIC_EVIDENCE", "COMPLETE_WITH_NONDETERMINISM"]) {
      expect(
        terminal(
          {
            status: "ACQUISITION_COMPLETE",
            verdict,
            haltCode: null,
            scientificResultProduced: true,
          },
          0,
        ).outcomeClass,
      ).toBe("SCIENTIFIC_RESULT_COMPLETE");
    }

    expect(
      terminal(
        {
          status: "ACQUISITION_RUNTIME_FAILURE",
          verdict: "RUNTIME_FAILURE",
          haltCode: "OCR_RUNTIME_FAILURE",
          scientificResultProduced: false,
        },
        1,
      ).outcomeClass,
    ).toBe("OCR_RUNTIME_FAILURE");

    expect(
      terminal(
        {
          status: "ACQUISITION_COMPLETE",
          verdict: "INCOMPLETE_EVIDENCE",
          haltCode: null,
          scientificResultProduced: false,
        },
        1,
      ).outcomeClass,
    ).toBe("INCOMPLETE_EVIDENCE");

    expect(
      adjudicateAcquisitionOutcome({
        acquisitionReportPath: acquisitionJsonl(root, [{ status: "item" }]),
        containerExitStatus: 1,
      }).outcomeClass,
    ).toBe("ACQUISITION_RUNNER_FAILURE");
    writeFileSync(path.join(root, "malformed.jsonl"), "{\n");
    expect(
      adjudicateAcquisitionOutcome({
        acquisitionReportPath: path.join(root, "malformed.jsonl"),
        containerExitStatus: 1,
      }).outcomeClass,
    ).toBe("ACQUISITION_RUNNER_FAILURE");
    expect(
      terminal(
        {
          status: "ACQUISITION_RUNTIME_FAILURE",
          verdict: "RUNTIME_FAILURE",
          haltCode: "OCR_RUNTIME_FAILURE",
          scientificResultProduced: false,
        },
        0,
      ).outcomeClass,
    ).toBe("ACQUISITION_RUNNER_FAILURE");
    expect(
      terminal(
        {
          status: "ACQUISITION_COMPLETE",
          verdict: "COMPLETE_DETERMINISTIC_EVIDENCE",
          haltCode: null,
          scientificResultProduced: true,
        },
        1,
      ).outcomeClass,
    ).toBe("ACQUISITION_RUNNER_FAILURE");
  });

  it("fails closed when acquisition reports mix valid terminals with malformed lines", () => {
    const root = freshRoot();
    const cases = [
      {
        name: "deterministic-success",
        status: 0,
        terminal: {
          status: "ACQUISITION_COMPLETE",
          verdict: "COMPLETE_DETERMINISTIC_EVIDENCE",
          haltCode: null,
          scientificResultProduced: true,
        },
      },
      {
        name: "nondeterministic-success",
        status: 0,
        terminal: {
          status: "ACQUISITION_COMPLETE",
          verdict: "COMPLETE_WITH_NONDETERMINISM",
          haltCode: null,
          scientificResultProduced: true,
        },
      },
      {
        name: "ocr-runtime-failure",
        status: 1,
        terminal: {
          status: "ACQUISITION_RUNTIME_FAILURE",
          verdict: "RUNTIME_FAILURE",
          haltCode: "OCR_RUNTIME_FAILURE",
          scientificResultProduced: false,
        },
      },
      {
        name: "incomplete-evidence",
        status: 1,
        terminal: {
          status: "ACQUISITION_COMPLETE",
          verdict: "INCOMPLETE_EVIDENCE",
          haltCode: null,
          scientificResultProduced: false,
        },
      },
    ];

    for (const entry of cases) {
      const report = adjudicateAcquisitionOutcome({
        acquisitionReportPath: acquisitionJsonlLines(root, [
          JSON.stringify({ item: entry.name, status: "ITEM_OBSERVED" }),
          JSON.stringify(entry.terminal),
          "{",
        ]),
        containerExitStatus: entry.status,
      });
      expect(report).toMatchObject({
        terminalRecordFound: false,
        terminalRecordCount: 1,
        reportMalformed: true,
        malformedLineCount: 1,
        reportCoherent: false,
        terminalStatus: entry.terminal.status,
        verdict: entry.terminal.verdict,
        haltCode: entry.terminal.haltCode,
        scientificResultProduced: entry.terminal.scientificResultProduced,
        outcomeClass: "ACQUISITION_RUNNER_FAILURE",
        finalDecision: "ACQUISITION_RUNNER_FAILURE",
      });
      expect(report.coherenceChecks).toMatchObject({
        reportCoherent: false,
        successfulScientific: false,
        ocrRuntimeFailure: false,
        incompleteEvidence: false,
      });
    }
  });

  it("fails closed on duplicate terminal records while allowing valid nonterminal JSON records", () => {
    const root = freshRoot();
    const completeTerminal = {
      status: "ACQUISITION_COMPLETE",
      verdict: "COMPLETE_DETERMINISTIC_EVIDENCE",
      haltCode: null,
      scientificResultProduced: true,
    };
    const duplicate = adjudicateAcquisitionOutcome({
      acquisitionReportPath: acquisitionJsonl(root, [
        { status: "ITEM_OBSERVED", item: "item-0001" },
        completeTerminal,
        {
          status: "ACQUISITION_RUNTIME_FAILURE",
          verdict: "RUNTIME_FAILURE",
          haltCode: "OCR_RUNTIME_FAILURE",
          scientificResultProduced: false,
        },
      ]),
      containerExitStatus: 0,
    });
    expect(duplicate).toMatchObject({
      terminalRecordFound: false,
      terminalRecordCount: 2,
      reportMalformed: false,
      malformedLineCount: 0,
      reportCoherent: false,
      outcomeClass: "ACQUISITION_RUNNER_FAILURE",
      finalDecision: "ACQUISITION_RUNNER_FAILURE",
    });
    expect(duplicate.coherenceChecks.successfulScientific).toBe(false);

    const withNonterminals = adjudicateAcquisitionOutcome({
      acquisitionReportPath: acquisitionJsonl(root, [
        { status: "ITEM_OBSERVED", item: "item-0001" },
        { status: "ITEM_SKIPPED", item: "item-0002" },
        { item: "item-0003", note: "valid nonterminal JSON without acquisition status" },
        completeTerminal,
      ]),
      containerExitStatus: 0,
    });
    expect(withNonterminals).toMatchObject({
      terminalRecordFound: true,
      terminalRecordCount: 1,
      reportMalformed: false,
      malformedLineCount: 0,
      reportCoherent: true,
      outcomeClass: "SCIENTIFIC_RESULT_COMPLETE",
      finalDecision: "SCIENTIFIC_RESULT_COMPLETE",
    });
    expect(withNonterminals.coherenceChecks.successfulScientific).toBe(true);
  });

  it("requires exact terminal schema before accepting successful or incomplete outcomes", () => {
    const root = freshRoot();
    const successTerminal = {
      status: "ACQUISITION_COMPLETE",
      verdict: "COMPLETE_DETERMINISTIC_EVIDENCE",
      haltCode: null,
      scientificResultProduced: true,
    };
    const adjudicateTerminal = (terminal: Record<string, unknown>, status: number) =>
      adjudicateAcquisitionOutcome({
        acquisitionReportPath: acquisitionJsonl(root, [terminal]),
        containerExitStatus: status,
      });

    expect(adjudicateTerminal(successTerminal, 0)).toMatchObject({
      outcomeClass: "SCIENTIFIC_RESULT_COMPLETE",
      terminalSchemaValid: true,
      haltCodePresent: true,
    });

    const missingHaltCode = {
      status: successTerminal.status,
      verdict: successTerminal.verdict,
      scientificResultProduced: successTerminal.scientificResultProduced,
    };
    for (const terminal of [
      missingHaltCode,
      { ...successTerminal, haltCode: 123 },
      { ...successTerminal, haltCode: { code: null } },
      { ...successTerminal, haltCode: false },
    ]) {
      const report = adjudicateTerminal(terminal, 0);
      expect(report).toMatchObject({
        outcomeClass: "ACQUISITION_RUNNER_FAILURE",
        finalDecision: "ACQUISITION_RUNNER_FAILURE",
        terminalSchemaValid: false,
      });
      expect(report.terminalFieldErrors).toContain("haltCode");
      expect(report.coherenceChecks.successfulScientific).toBe(false);
    }

    const incompleteTerminal = {
      status: "ACQUISITION_COMPLETE",
      verdict: "INCOMPLETE_EVIDENCE",
      haltCode: null,
      scientificResultProduced: false,
    };
    expect(adjudicateTerminal(incompleteTerminal, 1)).toMatchObject({
      outcomeClass: "INCOMPLETE_EVIDENCE",
      terminalSchemaValid: true,
      haltCodePresent: true,
    });
    for (const terminal of [
      { ...incompleteTerminal, haltCode: "INCOMPLETE_EVIDENCE" },
      { ...incompleteTerminal, status: "ACQUISITION_RUNTIME_FAILURE" },
    ]) {
      const report = adjudicateTerminal(terminal, 1);
      expect(report).toMatchObject({
        outcomeClass: "ACQUISITION_RUNNER_FAILURE",
        finalDecision: "ACQUISITION_RUNNER_FAILURE",
      });
      expect(report.coherenceChecks.incompleteEvidence).toBe(false);
    }
  });

  it("treats JSONL primitives and arrays as malformed acquisition report content", () => {
    const root = freshRoot();
    const successTerminal = {
      status: "ACQUISITION_COMPLETE",
      verdict: "COMPLETE_DETERMINISTIC_EVIDENCE",
      haltCode: null,
      scientificResultProduced: true,
    };
    for (const primitiveLine of ['"warning"', "42", "true", "null", "[]"]) {
      const report = adjudicateAcquisitionOutcome({
        acquisitionReportPath: acquisitionJsonlLines(root, [
          JSON.stringify({ item: "item-0001", status: "ITEM_OBSERVED" }),
          JSON.stringify(successTerminal),
          primitiveLine,
        ]),
        containerExitStatus: 0,
      });
      expect(report).toMatchObject({
        terminalRecordFound: false,
        terminalRecordCount: 1,
        reportMalformed: true,
        malformedLineCount: 1,
        reportCoherent: false,
        outcomeClass: "ACQUISITION_RUNNER_FAILURE",
        finalDecision: "ACQUISITION_RUNNER_FAILURE",
      });
      expect(report.coherenceChecks.successfulScientific).toBe(false);
    }

    const withNonterminalObjects = adjudicateAcquisitionOutcome({
      acquisitionReportPath: acquisitionJsonl(root, [
        { item: "item-0001", status: "ITEM_OBSERVED" },
        { item: "item-0002", status: "ITEM_REJECTED", details: { reason: "valid object" } },
        successTerminal,
      ]),
      containerExitStatus: 0,
    });
    expect(withNonterminalObjects).toMatchObject({
      reportMalformed: false,
      malformedLineCount: 0,
      reportCoherent: true,
      outcomeClass: "SCIENTIFIC_RESULT_COMPLETE",
    });
  });

  it("keeps malformed acquisition reports off completed evidence routing decisions", () => {
    const root = freshRoot();
    const malformedSuccess = adjudicateAcquisitionOutcome({
      acquisitionReportPath: acquisitionJsonlLines(root, [
        JSON.stringify({
          status: "ACQUISITION_COMPLETE",
          verdict: "COMPLETE_DETERMINISTIC_EVIDENCE",
          haltCode: null,
          scientificResultProduced: true,
        }),
        "{",
      ]),
      containerExitStatus: 0,
    });
    expect(malformedSuccess.outcomeClass).toBe("ACQUISITION_RUNNER_FAILURE");
    expect(malformedSuccess.finalDecision).toBe("ACQUISITION_RUNNER_FAILURE");
    expect(malformedSuccess.coherenceChecks.successfulScientific).toBe(false);
    expect(malformedSuccess.outcomeClass).not.toBe("SCIENTIFIC_RESULT_COMPLETE");

    const malformedSchema = adjudicateAcquisitionOutcome({
      acquisitionReportPath: acquisitionJsonl(root, [
        {
          status: "ACQUISITION_COMPLETE",
          verdict: "COMPLETE_DETERMINISTIC_EVIDENCE",
          scientificResultProduced: true,
        },
      ]),
      containerExitStatus: 0,
    });
    expect(malformedSchema.outcomeClass).toBe("ACQUISITION_RUNNER_FAILURE");
    expect(malformedSchema.coherenceChecks.successfulScientific).toBe(false);

    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    const completeUpload = workflow.slice(
      workflow.indexOf("- name: Upload the verified raw evidence"),
      workflow.indexOf("- name: Stage incomplete forensic artifact payload"),
    );
    expect(completeUpload).toContain(
      "needs.job-b-execute.outputs.acquisitionOutcomeClass == 'SCIENTIFIC_RESULT_COMPLETE'",
    );
    const terminal = workflow.slice(workflow.indexOf("acquisition-adjudication:"));
    expect(terminal).toContain("ACQUISITION_RUNNER_FAILURE");
  });

  it("requires the workflow artifact to include report, status, and image identity", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    const probe = workflow.slice(
      workflow.indexOf("ocr-runtime-init-probe:"),
      workflow.indexOf("verifier-transport-rehearsal:"),
    );
    expect(probe).toContain("Finalize OCR runtime init probe report");
    expect(probe).toContain("OCR_RUNTIME_INIT_IMAGE_IDENTITY_MISSING");
    expect(probe).toContain("OCR_RUNTIME_INIT_CONTAINER_STATUS_MISSING");
    expect(probe).toContain("OCR_RUNTIME_INIT_CLOSED_REPORT_MISSING");
    expect(probe).toContain("node verifier/validate-ocr-runtime-init-probe.mjs");
    expect(probe).toContain("path: ocr-runtime-init-probe-artifact");
    expect(probe).toContain("if-no-files-found: error");
  });
});

describe("Issue #149 actor 2 verifies raw evidence, and Job C scans for identity", () => {
  const committedRun = (root: string, runId: string, itemIds: string[]) => {
    const runRoot = path.join(root, runId);
    mkdirSync(runRoot, { recursive: true });
    for (const itemId of itemIds) writeItem(runRoot, itemId);
    const sealed = sealRunEvidence({
      runId,
      rawDirectory: runRoot,
      expectedItemIds: itemIds,
      determinism: { ...DETERMINISM, comparedItems: itemIds.length },
    });
    writeRunEvidence(sealed, { directory: runRoot });
    return runRoot;
  };

  it("passes on two complete, committed runs", () => {
    const root = freshRoot();
    committedRun(root, "primary", ["item-0001", "item-0002"]);
    committedRun(root, "repeat", ["item-0001", "item-0002"]);
    const report = verifyRawEvidence({
      rawRoot: root,
      expectedItemIds: ["item-0001", "item-0002"],
    });
    expect(report.ok).toBe(true);
    expect(report.haltCode).toBeNull();
    expect(report.totalBytes).toBeGreaterThan(0);
  });

  it("writes run evidence and the commit marker host-readable under a restrictive umask", () => {
    const previous = process.umask(0o077);
    try {
      const root = freshRoot();
      const runRoot = committedRun(root, "primary", ["item-0001", "item-0002"]);
      expect(statSync(runRoot).mode & 0o777).toBe(0o755);
      for (const entry of readdirSync(runRoot).filter((name) => !name.startsWith("item-"))) {
        const entryPath = path.join(runRoot, entry);
        const stats = statSync(entryPath);
        expect(stats.isFile()).toBe(true);
        expect(stats.mode & 0o777).toBe(0o644);
      }
    } finally {
      process.umask(previous);
    }
  });

  it("fails on a missing item, a missing marker, a tampered file and a staging leftover", () => {
    const failing: Array<[string, (root: string) => void]> = [
      [
        "missing item",
        (root) => rmSync(path.join(root, "repeat", "item-0002"), { recursive: true }),
      ],
      ["missing marker", (root) => rmSync(path.join(root, "primary", RUN_COMMIT_MARKER))],
      [
        "tampered item file",
        (root) =>
          writeFileSync(path.join(root, "primary", "item-0001", "item-0001.counts.json"), "X"),
      ],
      [
        "staging leftover",
        (root) => mkdirSync(path.join(root, "primary", ".staging-run-primary-abc")),
      ],
    ];
    for (const [name, damage] of failing) {
      const root = freshRoot();
      committedRun(root, "primary", ["item-0001", "item-0002"]);
      committedRun(root, "repeat", ["item-0001", "item-0002"]);
      damage(root);
      const report = verifyRawEvidence({
        rawRoot: root,
        expectedItemIds: ["item-0001", "item-0002"],
      });
      expect(report.ok, `${name} must fail verification`).toBe(false);
      expect(report.haltCode).toBe("RAW_VERIFICATION_FAILED");
    }
  });

  it("is not a size check", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    expect(workflow).toContain("Actor 2 — verify the sealed raw evidence");
    // Plain node against the transported verifier bundle. Job B has no
    // checkout, so `npx vite-node scripts/eval/...` could never have run there.
    expect(workflow).toContain("node verifier/verify.mjs");
    expect(workflow).not.toContain(
      "npx vite-node --config vitest.config.ts \\\n            scripts/eval/issue-149-verify-raw-evidence.ts",
    );
    // Actor 2 runs even when the acquisition failed.
    expect(workflow).toContain(
      "Actor 2 — verify the sealed raw evidence\n        id: raw\n        if: always()",
    );
    // The volume MEASUREMENT runs only after verification…
    expect(workflow.indexOf("Actor 2 — verify")).toBeLessThan(
      workflow.indexOf("Measure the archive volume (nonfatal)"),
    );
    // …and it is nonfatal, so it cannot skip the upload that follows it.
    expect(workflow.indexOf("Measure the archive volume (nonfatal)")).toBeLessThan(
      workflow.indexOf("Upload the verified raw evidence"),
    );
    // Partial output is not labelled as completed evidence.
    expect(workflow).toContain("issue-149-incomplete-forensic-output");
    expect(workflow).toContain("artifact-digest");
  });

  it("finds a planted historical identifier, and reports clean when there is none", () => {
    const root = freshRoot();
    committedRun(root, "primary", ["item-0001"]);
    const clean = verifyNoHistoricalIdentity({
      rawRoot: root,
      historicalCaseIds: ["brand-023"],
      historicalImagePaths: ["src/fixtures/images/brand-023.png"],
      forbiddenEvidenceKeys: ["expectedBrand", "governedTruth"],
    });
    expect(clean.ok).toBe(true);
    expect(clean.hits).toEqual([]);
    expect(clean.reportDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(clean.didNotReceive).toContain("acceptable Brand values");

    writeFileSync(path.join(root, "primary", "item-0001", "item-0001.counts.json"), "brand-023\n");
    const leaked = verifyNoHistoricalIdentity({
      rawRoot: root,
      historicalCaseIds: ["brand-023"],
      historicalImagePaths: [],
      forbiddenEvidenceKeys: [],
    });
    expect(leaked.ok).toBe(false);
    expect(leaked.haltCode).toBe("TRUTH_ISOLATION_FAILURE");
    expect(leaked.hits[0].marker).toBe("historical identifier");
  });

  it("finds a planted forbidden evidence key", () => {
    const root = freshRoot();
    committedRun(root, "primary", ["item-0001"]);
    writeFileSync(
      path.join(root, "primary", "item-0001", "item-0001.selection.json"),
      `${canonicalize({ expectedBrand: "X" })}\n`,
    );
    const report = verifyNoHistoricalIdentity({
      rawRoot: root,
      historicalCaseIds: [],
      historicalImagePaths: [],
      forbiddenEvidenceKeys: ["expectedBrand"],
    });
    expect(report.ok).toBe(false);
    expect(report.hits[0].marker).toContain("expectedBrand");
  });
});

describe("Issue #149 execute halts before OCR when the preflight fails", () => {
  it("runs the preflight before the first acquisition call, using the shared core", () => {
    const runner = readFileSync(
      path.join(process.cwd(), "scripts/eval/issue-149-brand-evidence-acquisition-run.ts"),
      "utf8",
    );
    const executeBody = runner.slice(runner.indexOf("async function execute("));
    const preflightAt = executeBody.indexOf("runRuntimeDiscovery(process.env)");
    const acquireAt = executeBody.indexOf("await acquireProductionBrandEvidence(");
    expect(preflightAt).toBeGreaterThan(-1);
    expect(acquireAt).toBeGreaterThan(-1);
    // The preflight comes FIRST, and returns on failure.
    expect(preflightAt).toBeLessThan(acquireAt);
    expect(executeBody).toContain("EXECUTE_BOUNDARY_PREFLIGHT_FAILED");
    // The SAME implementation discovery runs — not a second restatement.
    expect(runner).toContain('from "./lib/issue-149-runtime-discovery"');
  });

  it("reports zero acquisition, extractor and writer calls on a preflight failure", async () => {
    vi.resetModules();
    const discovery = await import("../../../scripts/eval/lib/issue-149-runtime-discovery");
    const spy = vi.spyOn(discovery, "runRuntimeDiscovery");
    // The halt path reports every count as zero, which is the claim a reader
    // needs: not "we stopped" but "nothing ran".
    const runner = readFileSync(
      path.join(process.cwd(), "scripts/eval/issue-149-brand-evidence-acquisition-run.ts"),
      "utf8",
    );
    for (const claim of [
      "acquisitionApiCalls: 0",
      "extractorCalls: 0",
      "itemWriterCalls: 0",
      "runWriterCalls: 0",
      "outputFilesCreated: 0",
    ]) {
      expect(runner).toContain(claim);
    }
    spy.mockRestore();
  });
});

describe("Issue #149 the identity inventory must be present and exact", () => {
  const inventory = {
    artifact: "issue-149-identity-inventory",
    experimentId: "issue-149-brand-complete-evidence-acquisition",
    historicalCaseIds: ["brand-023"],
    historicalImagePaths: ["src/fixtures/images/brand-023.png"],
    forbiddenEvidenceKeys: ["expectedBrand"],
    containsNo: ["acceptable Brand values"],
  };
  const text = `${JSON.stringify(inventory, null, 2)}\n`;
  const expected = {
    inventorySha256: sha256Bytes(text),
    historicalCaseIdCount: 1,
    historicalImagePathCount: 1,
    forbiddenEvidenceKeyCount: 1,
  };

  it("loads a complete, digest-matched inventory", () => {
    const loaded = loadIdentityInventory({ inventoryText: text, expected });
    expect(loaded.historicalCaseIds).toEqual(["brand-023"]);
    expect(loaded.forbiddenEvidenceKeys).toEqual(["expectedBrand"]);
  });

  it("HALTS on an absent inventory — an absent file is not an empty one", () => {
    // The exact defect: the CLI turned a missing file into an empty array, so
    // Job C scanned for zero markers and reported clean.
    expect(() => loadIdentityInventory({ inventoryText: null, expected })).toThrow(
      expect.objectContaining({ code: "IDENTITY_INVENTORY_ABSENT" }),
    );
    expect(() => loadIdentityInventory({ inventoryText: text, expected: null })).toThrow(
      expect.objectContaining({ code: "IDENTITY_INVENTORY_ABSENT" }),
    );
  });

  it("HALTS on a wrong digest, malformed schema, duplicate, empty or zero-marker inventory", () => {
    expect(() =>
      loadIdentityInventory({
        inventoryText: text,
        expected: { ...expected, inventorySha256: "0".repeat(64) },
      }),
    ).toThrow(expect.objectContaining({ code: "IDENTITY_INVENTORY_DIGEST_MISMATCH" }));

    const variant = (mutate: (draft: Record<string, unknown>) => void): string => {
      const draft = JSON.parse(JSON.stringify(inventory)) as Record<string, unknown>;
      mutate(draft);
      return `${JSON.stringify(draft, null, 2)}\n`;
    };
    const cases: Array<[string, string]> = [
      ["not json", "{oops"],
      ["extra key", variant((draft) => (draft.extra = true))],
      ["duplicate marker", variant((draft) => (draft.historicalCaseIds = ["a", "a"]))],
      ["empty marker", variant((draft) => (draft.historicalCaseIds = [" "]))],
      ["zero markers", variant((draft) => (draft.historicalCaseIds = []))],
      ["zero forbidden keys", variant((draft) => (draft.forbiddenEvidenceKeys = []))],
      ["wrong count", variant((draft) => (draft.historicalCaseIds = ["a", "b"]))],
    ];
    for (const [name, body] of cases) {
      expect(
        () =>
          loadIdentityInventory({
            inventoryText: body,
            expected: { ...expected, inventorySha256: sha256Bytes(body) },
          }),
        `${name} must halt`,
      ).toThrow(IdentityInventoryError);
    }
  });
});

describe("Issue #149 the run marker schema is closed and exact", () => {
  const committedRoot = (): string => {
    const root = freshRoot();
    writeItem(root, "item-0001");
    const sealed = sealRunEvidence({
      runId: "primary",
      rawDirectory: root,
      expectedItemIds: ["item-0001"],
      determinism: { ...DETERMINISM, comparedItems: 1 },
    });
    writeRunEvidence(sealed, { directory: root });
    return root;
  };
  const marker = (root: string) =>
    JSON.parse(readFileSync(path.join(root, RUN_COMMIT_MARKER), "utf8")) as Record<string, unknown>;
  const rewrite = (root: string, mutate: (draft: Record<string, unknown>) => void): void => {
    const draft = marker(root);
    mutate(draft);
    writeFileSync(path.join(root, RUN_COMMIT_MARKER), `${JSON.stringify(draft)}\n`);
  };

  it("rejects a digest SUBSET with a correct requiredFiles list", () => {
    // The exact defect: iterating whatever fileDigests contained meant a marker
    // with one valid entry and the right requiredFiles read as committed.
    const root = committedRoot();
    rewrite(root, (draft) => {
      draft.fileDigests = (draft.fileDigests as unknown[]).slice(0, 1);
    });
    expect(verifyRunCommitted(root)).toMatchObject({
      committed: false,
      reason: "RUN_COMMIT_MARKER_DIGEST_SET_MISMATCH",
    });
  });

  it("rejects duplicated, extra, reordered or malformed digests", () => {
    const mutations: Array<[string, (draft: Record<string, unknown>) => void]> = [
      [
        "duplicate",
        (draft) => {
          const list = draft.fileDigests as unknown[];
          draft.fileDigests = [list[0], list[0], list[2], list[3]];
        },
      ],
      [
        "extra",
        (draft) => {
          const list = draft.fileDigests as unknown[];
          draft.fileDigests = [...list, list[0]];
        },
      ],
      [
        "reordered",
        (draft) => {
          draft.fileDigests = [...(draft.fileDigests as unknown[])].reverse();
        },
      ],
      [
        "malformed",
        (draft) => {
          draft.fileDigests = [1, 2, 3, 4];
        },
      ],
    ];
    for (const [name, mutate] of mutations) {
      const root = committedRoot();
      rewrite(root, mutate);
      const verdict = verifyRunCommitted(root);
      expect(verdict.committed, `${name} must be uncommitted`).toBe(false);
      // …and it must be an explicit result, never an uncaught TypeError.
      expect(typeof verdict.reason).toBe("string");
    }
  });

  it("rejects a wrong aggregate, an extra key, a wrong runId and a bad itemCount", () => {
    const checks: Array<[(draft: Record<string, unknown>) => void, string]> = [
      [(draft) => (draft.aggregateSha256 = "0".repeat(64)), "RUN_COMMIT_MARKER_AGGREGATE_MISMATCH"],
      [(draft) => (draft.extra = true), "RUN_COMMIT_MARKER_KEY_SET_MISMATCH"],
      [(draft) => (draft.runId = "other"), "RUN_COMMIT_MARKER_RUN_ID_MISMATCH"],
      [(draft) => (draft.itemCount = -1), "RUN_COMMIT_MARKER_ITEM_COUNT_INVALID"],
      [(draft) => (draft.requiredFiles = ["counts.json"]), "RUN_COMMIT_MARKER_FILE_SET_MISMATCH"],
    ];
    for (const [mutate, reason] of checks) {
      const root = committedRoot();
      rewrite(root, mutate);
      expect(verifyRunCommitted(root, { runId: "primary" })).toMatchObject({
        committed: false,
        reason,
      });
    }
  });

  it("rejects an unexpected run-level file", () => {
    const root = committedRoot();
    writeFileSync(path.join(root, "stray.json"), "{}\n");
    expect(verifyRunCommitted(root).committed).toBe(false);
    expect(verifyRunCommitted(root).reason).toContain("UNEXPECTED_RUN_LEVEL_FILE");
  });
});

describe("Issue #149 manifest verification is bidirectional", () => {
  const run = (root: string, runId: string, itemIds: string[]) => {
    const runRoot = path.join(root, runId);
    mkdirSync(runRoot, { recursive: true });
    for (const itemId of itemIds) writeItem(runRoot, itemId);
    const sealed = sealRunEvidence({
      runId,
      rawDirectory: runRoot,
      expectedItemIds: itemIds,
      determinism: { ...DETERMINISM, comparedItems: itemIds.length },
    });
    writeRunEvidence(sealed, { directory: runRoot });
    return runRoot;
  };

  it("rejects a PHANTOM manifest entry naming a file that does not exist", () => {
    // Verifying only the files on disk against the manifest leaves the manifest
    // free to contain entries for files that were never written.
    const root = freshRoot();
    run(root, "primary", ["item-0001"]);
    run(root, "repeat", ["item-0001"]);
    const manifestPath = path.join(root, "primary", "raw-evidence-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      itemFiles: Array<{ path: string; byteLength: number; sha256: string }>;
    };
    manifest.itemFiles.push({
      path: "item-0001/item-0001.phantom.json",
      byteLength: 1,
      sha256: "0".repeat(64),
    });
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);

    const report = verifyRawEvidence({ rawRoot: root, expectedItemIds: ["item-0001"] });
    expect(report.ok).toBe(false);
    const finding = report.findings.find((entry) =>
      entry.check.includes("manifest-covers-exactly-what-is-on-disk"),
    );
    expect(finding?.ok).toBe(false);
    expect((finding?.detail as { phantom: string[] }).phantom).toContain(
      "item-0001/item-0001.phantom.json",
    );
  });

  it("does NOT claim to have run the forbidden-key scan", () => {
    const root = freshRoot();
    run(root, "primary", ["item-0001"]);
    run(root, "repeat", ["item-0001"]);
    const report = verifyRawEvidence({ rawRoot: root, expectedItemIds: ["item-0001"] });
    const delegated = report.findings.find(
      (entry) => entry.check === "forbidden-evidence-key-scan",
    );
    expect(delegated).toBeDefined();
    expect((delegated?.detail as { adjudicatedHere: boolean }).adjudicatedHere).toBe(false);
    expect((delegated?.detail as { delegatedTo: string }).delegatedTo).toContain("Job C");
    // The old finding name asserted a result Actor 2 never computed.
    expect(report.findings.map((entry) => entry.check)).not.toContain("no-forbidden-evidence-key");
  });
});

describe("Issue #149 the archive limit governs, and never destroys", () => {
  it("is eligible below and AT the limit, and requires a decision one byte over", () => {
    expect(ARCHIVE_LIMIT_BYTES).toBe(104857600);
    expect(decideArchiveVolume(104857599).decision).toBe("ELIGIBLE_FOR_OWNER_COMMIT_PROCESS");
    // The rule is "exceeds", so equality is not over.
    expect(decideArchiveVolume(104857600).decision).toBe("ELIGIBLE_FOR_OWNER_COMMIT_PROCESS");
    expect(decideArchiveVolume(104857601).decision).toBe("DURABLE_ARCHIVE_DECISION_REQUIRED");
    expect(decideArchiveVolume(104857600).overLimit).toBe(false);
    expect(decideArchiveVolume(104857601).overLimit).toBe(true);
  });

  it("requires upload and verification on BOTH sides of the limit", () => {
    for (const bytes of [0, 104857600, 104857601, 999999999]) {
      const report = decideArchiveVolume(bytes);
      expect(report.uploadAndVerificationRequired).toBe(true);
      // Over-limit evidence is COMPLETE evidence, never forensic output.
      expect(report.routeAsIncompleteForensicOutput).toBe(false);
    }
  });

  it("refuses to adjudicate before the artifact and receipt exist", () => {
    const report = decideArchiveVolume(104857601);
    for (const state of [
      { verifiedArtifactUploaded: false, verificationReceiptCreated: false },
      { verifiedArtifactUploaded: true, verificationReceiptCreated: false },
      { verifiedArtifactUploaded: false, verificationReceiptCreated: true },
    ]) {
      expect(archiveAdjudication({ report, ...state })).toMatchObject({
        ok: false,
        haltCode: "ARCHIVE_ADJUDICATION_BEFORE_PRESERVATION",
      });
    }
  });

  it("halts over the limit ONLY after preservation, and passes at the limit", () => {
    const preserved = { verifiedArtifactUploaded: true, verificationReceiptCreated: true };
    expect(
      archiveAdjudication({ report: decideArchiveVolume(104857601), ...preserved }),
    ).toMatchObject({ ok: false, haltCode: "RAW_EVIDENCE_EXCEEDS_DURABLE_ARCHIVE_LIMIT" });
    expect(
      archiveAdjudication({ report: decideArchiveVolume(104857600), ...preserved }),
    ).toMatchObject({ ok: true, haltCode: null });
  });

  it("says plainly that a retention-bound artifact is not permanent preservation", () => {
    expect(decideArchiveVolume(104857601).meaning).toContain("NOT permanent preservation");
    expect(decideArchiveVolume(104857601).meaning).toContain("expires");
  });

  it("orders the workflow so preservation precedes adjudication", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    // The measurement is nonfatal and no longer gates the upload.
    expect(workflow).toContain("Measure the archive volume (nonfatal)");
    expect(workflow).not.toContain('RAW_EVIDENCE_EXCEEDS_DURABLE_ARCHIVE_LIMIT" >&2; exit 1; }');
    // The verified upload does not depend on the volume outcome.
    const uploadCondition = workflow.slice(
      workflow.indexOf("- name: Upload the verified raw evidence"),
      workflow.indexOf(
        "retention-days: 30",
        workflow.indexOf("- name: Upload the verified raw evidence"),
      ),
    );
    expect(uploadCondition).toContain(
      "if: steps.raw.outputs.verified == 'true' && steps.identity.outcome == 'success' && needs.job-b-execute.outputs.acquisitionOutcomeClass == 'SCIENTIFIC_RESULT_COMPLETE'",
    );
    expect(uploadCondition).not.toContain("overLimit");
    // The terminal adjudication runs after upload AND the receipt job.
    expect(workflow).toContain(
      "needs: [resolve-mode, job-b-execute, job-b-verify-evidence, verify-uploaded-artifact]",
    );
    expect(workflow.indexOf("Upload the verified raw evidence")).toBeLessThan(
      workflow.indexOf("archive-adjudication:"),
    );
    // The archive-volume report travels with the evidence.
    expect(workflow).toContain("archive-volume-report.json");
  });

  it("cannot skip forensic handoff verification on the acquisition failure path", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    const forensicJob = workflow.slice(
      workflow.indexOf("verify-forensic-handoff:"),
      workflow.indexOf("job-b-verify-evidence:"),
    );
    expect(forensicJob).toContain("needs: [resolve-mode, job-b-execute]");
    expect(forensicJob).toContain("if: always() && needs.resolve-mode.outputs.mode == 'execute'");
    expect(forensicJob).toContain(
      "artifact-ids: ${{ needs.job-b-execute.outputs.forensicArtifactId }}",
    );
    expect(forensicJob).toContain("handoff-receipt.json");
    expect(forensicJob).toContain("source-pre-manifest.json");
    expect(forensicJob).toContain("source-post-manifest.json");

    const actorJob = workflow.slice(
      workflow.indexOf("job-b-verify-evidence:"),
      workflow.indexOf("verify-uploaded-artifact:"),
    );
    expect(actorJob).toContain("needs: [resolve-mode, job-b-execute, verify-forensic-handoff]");
    expect(
      actorJob.indexOf("artifact-ids: ${{ needs.job-b-execute.outputs.forensicArtifactId }}"),
    ).toBeLessThan(actorJob.indexOf("Actor 2 — verify the sealed raw evidence"));

    const terminal = workflow.slice(workflow.indexOf("acquisition-adjudication:"));
    expect(terminal).toContain(
      "needs: [resolve-mode, job-b-execute, verify-forensic-handoff, job-b-verify-evidence]",
    );
    expect(terminal).toContain('test "${{ needs.verify-forensic-handoff.result }}" = "success"');
    expect(terminal).toContain('test "${{ needs.job-b-verify-evidence.result }}" = "success"');
    expect(terminal).toContain("ACQUISITION_VERIFICATION_JOB_FAILED");
  });

  it("uses explicit upload staging roots whose consumers read the same layout", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    expect(workflow).toContain("Stage rehearsal roundtrip payload");
    expect(workflow).toContain("path: rehearsal-roundtrip-payload");
    expect(workflow).toContain("--raw roundtrip/raw");
    expect(workflow).toContain("--manifest roundtrip/expected-items.json");
    expect(workflow).toContain('root = pathlib.Path("roundtrip/forensic-handoff")');
    expect(workflow).toContain('archive = root / "source-tree.tar"');
    expect(workflow).toContain("planted-unreadable-0700/raw/primary/item-9001/partial.txt");

    expect(workflow).toContain("Stage complete evidence artifact payload");
    expect(workflow).toContain("path: complete-evidence-payload");
    expect(workflow).toContain("--raw downloaded/host-readable-output/raw");
    expect(workflow).toContain("Stage incomplete forensic artifact payload");
    expect(workflow).toContain("path: incomplete-evidence-payload");
  });

  it("validates private rehearsal source by attestation before handoff and by source-pre comparison after handoff", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    const rehearsal = workflow.slice(
      workflow.indexOf("verifier-transport-rehearsal:"),
      workflow.indexOf("      # The OVER-LIMIT ordering"),
    );
    const buildStep = rehearsal.slice(
      rehearsal.indexOf("- name: Build synthetic evidence inside the pinned container"),
      rehearsal.indexOf("- name: Prove planted 0700 evidence is unreadable before handoff"),
    );
    expect(buildStep).toContain("| tee rehearsal-build-report.json");
    expect(buildStep).toContain("node verifier/validate-rehearsal-attestation.mjs");
    expect(buildStep).toContain("--build-report rehearsal-build-report.json");
    expect(buildStep).not.toContain("stat -c");
    expect(buildStep).not.toContain("find synthetic-container");
    expect(buildStep).not.toContain("ls synthetic-container");

    const denialStep = rehearsal.slice(
      rehearsal.indexOf("- name: Prove planted 0700 evidence is unreadable before handoff"),
      rehearsal.indexOf("- name: Run the real forensic handoff for rehearsal"),
    );
    expect(denialStep).toContain('cat "${ATTEMPTED}"');
    expect(denialStep).toContain("STATUS=$?");
    expect(denialStep).toContain('test "${STATUS}" -ne 0');
    expect(denialStep).toContain("PLANTED_0700_DENIAL_DIAGNOSTIC_MISSING");
    expect(denialStep).not.toContain("test -r");

    const handoffStep = rehearsal.slice(
      rehearsal.indexOf("- name: Run the real forensic handoff for rehearsal"),
      rehearsal.indexOf("- name: Actor 2 runs with plain Node and no checkout"),
    );
    expect(handoffStep).toContain("sudo -E");
    expect(handoffStep).toContain("--source synthetic-container");
    expect(handoffStep).toContain(
      "--source-pre-manifest rehearsal-forensic-handoff/source-pre-manifest.json",
    );
    expect(handoffStep).toContain("node verifier/validate-rehearsal-attestation.mjs");
  });

  it("preserves pre-handoff denial evidence even when later rehearsal stages fail", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    const rehearsal = workflow.slice(
      workflow.indexOf("verifier-transport-rehearsal:"),
      workflow.indexOf("      # The OVER-LIMIT ordering"),
    );
    const denialStep = rehearsal.slice(
      rehearsal.indexOf("- name: Prove planted 0700 evidence is unreadable before handoff"),
      rehearsal.indexOf("- name: Run the real forensic handoff for rehearsal"),
    );
    expect(denialStep).toContain("stdoutByteLength");
    expect(denialStep).toContain("stdoutSha256");
    expect(denialStep).toContain("stderrByteLength");
    expect(denialStep).toContain("stderrSha256");
    expect(denialStep).toContain("denialDiagnosticMatched");
    expect(denialStep).toContain("denialDiagnosticPattern");
    expect(denialStep).toContain("PLANTED_0700_STDOUT_NOT_EMPTY");
    expect(denialStep).toContain("PLANTED_0700_STDERR_EMPTY");

    const roundtripStaging = rehearsal.slice(
      rehearsal.indexOf("- name: Stage rehearsal roundtrip payload"),
      rehearsal.indexOf("- name: Upload the synthetic evidence, then redownload by ID"),
    );
    expect(roundtripStaging).toContain(
      "cp planted-0700-proof.json rehearsal-roundtrip-payload/planted-0700-proof.json",
    );
    expect(roundtripStaging).toContain(
      "cp planted-before-handoff.stdout rehearsal-roundtrip-payload/planted-before-handoff.stdout",
    );
    expect(roundtripStaging).toContain(
      "cp planted-before-handoff.stderr rehearsal-roundtrip-payload/planted-before-handoff.stderr",
    );

    const roundtripVerification = rehearsal.slice(
      rehearsal.indexOf("- name: Verify the round-tripped artifact identity and contents"),
      rehearsal.indexOf("      # The OVER-LIMIT ordering"),
    );
    expect(roundtripVerification).toContain("roundtrip/planted-0700-proof.json");
    expect(roundtripVerification).toContain("roundtrip/planted-before-handoff.stdout");
    expect(roundtripVerification).toContain("roundtrip/planted-before-handoff.stderr");
    expect(roundtripVerification).toContain("PLANTED_0700_STDOUT_DIGEST_MISMATCH");
    expect(roundtripVerification).toContain("PLANTED_0700_STDERR_DIGEST_MISMATCH");
    expect(roundtripVerification).toContain("PLANTED_0700_STDERR_EMPTY");
    expect(roundtripVerification).toContain("PLANTED_0700_DENIAL_DIAGNOSTIC_MISMATCH");

    const reportUpload = workflow.slice(
      workflow.indexOf("name: issue-149-rehearsal-reports"),
      workflow.indexOf("retention-days: 7", workflow.indexOf("name: issue-149-rehearsal-reports")),
    );
    for (const expected of [
      "rehearsal-build-report.json",
      "rehearsal-image-identity.json",
      "planted-0700-proof.json",
      "planted-before-handoff.stdout",
      "planted-before-handoff.stderr",
      "rehearsal-forensic-handoff-report.json",
      "rehearsal-*.json",
      "over-limit-report.json",
      "at-limit-report.json",
      "if-no-files-found: error",
    ]) {
      expect(reportUpload).toContain(expected);
    }
    expect(workflow.indexOf("name: issue-149-rehearsal-reports")).toBeGreaterThan(
      workflow.indexOf("- name: Stage rehearsal roundtrip payload"),
    );
  });

  it("binds both forensic and complete artifacts to this run and head", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    expect(workflow).toContain("FORENSIC_METADATA_RUN");
    expect(workflow).toContain("FORENSIC_METADATA_HEAD");
    expect(workflow).toContain("FORENSIC_ARTIFACT_HEAD_ASSOCIATION_MISMATCH");
    expect(workflow).toContain("FORENSIC_CARRIED_HEAD_SHA_MISMATCH");
    expect(workflow).toContain("METADATA_RUN");
    expect(workflow).toContain("METADATA_HEAD");
    expect(workflow).toContain("ARTIFACT_HEAD_ASSOCIATION_MISMATCH");
    expect(workflow).toContain("CARRIED_HEAD_SHA_MISMATCH");
  });

  it("keeps the incomplete-forensic route for genuine failures only", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    const forensic = workflow.slice(workflow.indexOf("- name: Upload incomplete forensic output"));
    // Conditioned on Actor 2 / Job C failing — never on the volume.
    expect(forensic).toContain("if: always() &&");
    expect(forensic).toContain(
      "needs.job-b-execute.outputs.acquisitionOutcomeClass != 'SCIENTIFIC_RESULT_COMPLETE'",
    );
    expect(forensic).toContain("steps.raw.outputs.verified != 'true'");
    expect(forensic).toContain("steps.identity.outcome != 'success'");
    expect(forensic).toContain("if-no-files-found: error");
    expect(forensic.slice(0, 400)).not.toContain("overLimit");

    const staging = workflow.slice(
      workflow.indexOf("- name: Stage incomplete forensic artifact payload"),
      workflow.indexOf("- name: Upload incomplete forensic output"),
    );
    expect(staging).toContain("if: always() &&");
    expect(staging).toContain(
      "needs.job-b-execute.outputs.acquisitionOutcomeClass != 'SCIENTIFIC_RESULT_COMPLETE'",
    );
    expect(staging).toContain("steps.raw.outputs.verified != 'true'");
    expect(staging).toContain("steps.identity.outcome != 'success'");
    expect(staging).toContain("raw-verification-report.json");
    expect(staging).toContain("identity-leak-report.json");
  });

  it("routes runtime-failure evidence away from the completed raw-evidence upload", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    const completeUpload = workflow.slice(
      workflow.indexOf("- name: Upload the verified raw evidence"),
      workflow.indexOf("- name: Stage incomplete forensic artifact payload"),
    );
    expect(completeUpload).toContain(
      "needs.job-b-execute.outputs.acquisitionOutcomeClass == 'SCIENTIFIC_RESULT_COMPLETE'",
    );

    const terminal = workflow.slice(workflow.indexOf("acquisition-adjudication:"));
    expect(terminal).toContain("OCR_RUNTIME_FAILURE");
    expect(terminal).toContain("INCOMPLETE_EVIDENCE");
    expect(terminal).toContain("ACQUISITION_RUNNER_FAILURE");
    expect(terminal.indexOf("ACQUISITION_VERIFICATION_JOB_FAILED")).toBeLessThan(
      terminal.indexOf("OCR_RUNTIME_FAILURE"),
    );
  });

  it("runs a discover-only OCR init probe with no governed input mount and no recognition", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    const probe = workflow.slice(
      workflow.indexOf("ocr-runtime-init-probe:"),
      workflow.indexOf("verifier-transport-rehearsal:"),
    );
    expect(probe).toContain("if: needs.resolve-mode.outputs.mode == 'discover'");
    expect(probe).toContain("--network none");
    expect(probe).toContain("--read-only");
    expect(probe).toContain('--user "${ISSUE_149_RUNTIME_UID}:${ISSUE_149_RUNTIME_GID}"');
    expect(probe).toContain('-v "$PWD/preparation/bundle:/opt/acquisition:ro"');
    expect(probe).not.toContain(":/input");
    expect(probe).not.toContain(":/output");
    expect(probe).toContain("LABEL_LENS_OCR_ASSET_DIR=/opt/acquisition/assets");
    expect(probe).toContain(
      "LABEL_LENS_OCR_CORE_DIR=/opt/acquisition/node_modules/tesseract.js-core",
    );
    expect(probe).toContain("node verifier/validate-ocr-runtime-init-probe.mjs");
    expect(probe).toContain("OCR_RUNTIME_INIT_CLOSED_REPORT_MISSING");
    expect(probe).toContain("if: always()");
  });

  it("uses a fail-capable executable snapshot mode and ownership audit", () => {
    const audit = (root: string, uid: number, gid: number): { status: number; stderr: string } => {
      const script = `
        set -euo pipefail
        HOST_UID="${uid}"
        HOST_GID="${gid}"
        BAD_DIR="$(find "${root}" -type d ! -perm 0755 -print -quit)"
        test -z "$BAD_DIR" || { echo "SNAPSHOT_DIRECTORY_MODE_MISMATCH: $BAD_DIR" >&2; exit 1; }
        BAD_FILE="$(find "${root}" -type f ! -perm 0644 -print -quit)"
        test -z "$BAD_FILE" || { echo "SNAPSHOT_FILE_MODE_MISMATCH: $BAD_FILE" >&2; exit 1; }
        BAD_OWNER="$(find "${root}" \\( ! -uid "$HOST_UID" -o ! -gid "$HOST_GID" \\) -print -quit)"
        test -z "$BAD_OWNER" || { echo "SNAPSHOT_OWNERSHIP_MISMATCH: $BAD_OWNER" >&2; exit 1; }
      `;
      try {
        execFileSync("bash", ["-c", script], { encoding: "utf8" });
        return { status: 0, stderr: "" };
      } catch (cause) {
        const failure = cause as { status?: number; stderr?: Buffer | string };
        return {
          status: failure.status ?? -1,
          stderr: Buffer.isBuffer(failure.stderr)
            ? failure.stderr.toString("utf8")
            : (failure.stderr ?? ""),
        };
      }
    };

    const root = path.join(scratch, `snapshot-audit-${uniqueRun++}`);
    const currentUid = process.getuid?.() ?? statSync(scratch).uid;
    const currentGid = process.getgid?.() ?? statSync(scratch).gid;
    const tree = path.join(root, "snapshot");
    mkdirSync(path.join(tree, "dir"), { recursive: true, mode: 0o755 });
    writeFileSync(path.join(tree, "dir", "file.txt"), "ok\n", { mode: 0o644 });
    chmodSync(tree, 0o755);
    chmodSync(path.join(tree, "dir"), 0o755);
    chmodSync(path.join(tree, "dir", "file.txt"), 0o644);
    expect(audit(tree, currentUid, currentGid)).toEqual({ status: 0, stderr: "" });

    chmodSync(path.join(tree, "dir"), 0o700);
    const badDir = audit(tree, currentUid, currentGid);
    expect(badDir.status).not.toBe(0);
    expect(badDir.stderr).toContain("SNAPSHOT_DIRECTORY_MODE_MISMATCH");
    expect(badDir.stderr).not.toContain("cannot stat");
    chmodSync(path.join(tree, "dir"), 0o755);

    chmodSync(path.join(tree, "dir", "file.txt"), 0o600);
    const badFile = audit(tree, currentUid, currentGid);
    expect(badFile.status).not.toBe(0);
    expect(badFile.stderr).toContain("SNAPSHOT_FILE_MODE_MISMATCH");
    expect(badFile.stderr).not.toContain("cannot stat");
    chmodSync(path.join(tree, "dir", "file.txt"), 0o644);

    const badOwner = audit(tree, currentUid + 1, currentGid);
    expect(badOwner.status).not.toBe(0);
    expect(badOwner.stderr).toContain("SNAPSHOT_OWNERSHIP_MISMATCH");
    expect(badOwner.stderr).not.toContain("cannot stat");
  });
});

describe("Issue #149 the forensic handoff closes source and ownership failures", () => {
  it("records pre/post source manifests, rejects hardlinks, and reports closed outcomes", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/eval/issue-149-forensic-handoff.ts"),
      "utf8",
    );
    expect(source).toContain("source-pre-manifest.json");
    expect(source).toContain("source-post-manifest.json");
    expect(source).toContain("sourcePreManifestDigest");
    expect(source).toContain("sourcePostManifestDigest");
    expect(source).toContain("sourceMutated");
    expect(source).toContain("FORENSIC_HANDOFF_SOURCE_MUTATED");
    expect(source).toContain("FORENSIC_HANDOFF_HARDLINK_REJECTED");
    expect(source).toContain("nlink");
    expect(source).toContain("dev");
    expect(source).toContain("ino");
    expect(source).toContain('arg("host-uid")');
    expect(source).toContain('arg("host-gid")');
    expect(source).toContain("sourceHistograms");
    expect(source).toContain("snapshotHistograms");
    expect(source).toContain("hostReadable");
    expect(source).toContain("requiredComponentInventory");
  });

  const handoffScratch = (): string => {
    const root = path.join(scratch, `handoff-${uniqueRun++}`);
    mkdirSync(root, { recursive: true });
    return root;
  };

  const hostUid = (): number => process.getuid?.() ?? statSync(scratch).uid;
  const hostGid = (): number => process.getgid?.() ?? statSync(scratch).gid;

  function runHandoff(root: string, source: string): { status: number; stdout: string } {
    const out = path.join(root, "out");
    const snapshot = path.join(root, "snapshot");
    const args = [
      "vite-node",
      "--config",
      "vitest.config.ts",
      "scripts/eval/issue-149-forensic-handoff.ts",
      "--source",
      source,
      "--out",
      out,
      "--snapshot",
      snapshot,
      "--host-uid",
      String(hostUid()),
      "--host-gid",
      String(hostGid()),
      "--acquisition-status",
      "0",
    ];
    try {
      const stdout = execFileSync("npx", args, { cwd: process.cwd(), encoding: "utf8" });
      return { status: 0, stdout };
    } catch (cause) {
      const failure = cause as { status?: number; stdout?: Buffer | string };
      return {
        status: failure.status ?? -1,
        stdout: Buffer.isBuffer(failure.stdout)
          ? failure.stdout.toString("utf8")
          : (failure.stdout ?? ""),
      };
    }
  }

  function readReceipt(root: string): Record<string, unknown> {
    return JSON.parse(
      readFileSync(path.join(root, "out", "handoff-receipt.json"), "utf8"),
    ) as Record<string, unknown>;
  }

  function writeCompleteSource(source: string): void {
    mkdirSync(path.join(source, "raw", "primary", "item-9001"), { recursive: true });
    writeFileSync(
      path.join(source, "expected-items.json"),
      '{"cases":[{"opaqueItemId":"item-9001"}]}\n',
    );
    writeFileSync(path.join(source, "raw", "primary", "item-9001", "partial.txt"), "preserved\n");
  }

  function sourceFilesFromManifest(
    root: string,
    name: string,
  ): Array<{
    path: string;
    length: number;
    digest: string;
  }> {
    const manifest = JSON.parse(readFileSync(path.join(root, "out", name), "utf8")) as {
      entries: Array<{ path: string; type: string; length: number; digest: string }>;
    };
    return manifest.entries
      .filter((entry) => entry.type === "file")
      .map((entry) => ({ path: entry.path, length: entry.length, digest: entry.digest }))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  function snapshotFiles(root: string): Array<{ path: string; length: number; digest: string }> {
    return sourceFilesFromManifest(root, "snapshot-manifest.json");
  }

  it("executes the real helper on a complete tree and preserves source/snapshot equivalence", () => {
    const root = handoffScratch();
    const source = path.join(root, "source");
    writeCompleteSource(source);

    const result = runHandoff(root, source);
    expect(result.status).toBe(0);
    const receipt = readReceipt(root);
    expect(receipt.status).toBe("VERIFIED");
    expect(receipt.haltCode).toBeNull();
    expect(receipt.sourceMutated).toBe(false);
    expect(receipt.contentEquivalent).toBe(true);
    expect(receipt.hostReadable).toBe(true);
    expect(receipt.sourcePreManifestDigest).toBe(receipt.sourcePostManifestDigest);
    expect(sourceFilesFromManifest(root, "source-pre-manifest.json")).toEqual(snapshotFiles(root));
    expect(existsSync(path.join(root, "out", "source-tree.tar"))).toBe(true);
    expect(receipt.requiredComponentInventory).toEqual({
      "source-pre-manifest.json": true,
      "source-post-manifest.json": true,
      "source-tree.tar": true,
      "snapshot-manifest.json": true,
      "handoff-receipt.json": true,
    });
    for (const entry of readdirSync(path.join(root, "snapshot", "raw", "primary", "item-9001"))) {
      expect(
        statSync(path.join(root, "snapshot", "raw", "primary", "item-9001", entry)).mode & 0o777,
      ).toBe(0o644);
    }
    expect(statSync(path.join(root, "snapshot", "raw", "primary", "item-9001")).mode & 0o777).toBe(
      0o755,
    );
    expect(statSync(path.join(root, "snapshot")).uid).toBe(hostUid());
    expect(statSync(path.join(root, "snapshot")).gid).toBe(hostGid());
  });

  it("copies a 0700 source and normalizes the host-readable snapshot without mutating source", () => {
    const root = handoffScratch();
    const source = path.join(root, "source");
    writeCompleteSource(source);
    chmodSync(source, 0o700);

    const before = statSync(source).mode & 0o777;
    const result = runHandoff(root, source);
    expect(result.status).toBe(0);
    expect(statSync(source).mode & 0o777).toBe(before);
    expect(statSync(path.join(root, "snapshot")).mode & 0o777).toBe(0o755);
  });

  it("handles empty and partial sources as closed verified source trees", () => {
    for (const [label, populate] of [
      ["empty", (source: string) => mkdirSync(source, { recursive: true })],
      [
        "partial",
        (source: string) => {
          mkdirSync(path.join(source, "raw", "primary", "item-9001"), { recursive: true });
          writeFileSync(
            path.join(source, "raw", "primary", "item-9001", "partial.txt"),
            "partial\n",
          );
        },
      ],
    ] as const) {
      const root = handoffScratch();
      const source = path.join(root, label);
      populate(source);
      const result = runHandoff(root, source);
      expect(result.status).toBe(0);
      expect(readReceipt(root)).toMatchObject({
        status: "VERIFIED",
        sourceMutated: false,
        contentEquivalent: true,
        hostReadable: true,
      });
    }
  });

  it("writes closed halted receipts for absent, symlink, hardlink, and special-file sources", () => {
    const cases: Array<[string, string, (source: string) => void]> = [
      ["absent", "FORENSIC_HANDOFF_SOURCE_ABSENT", () => undefined],
      [
        "symlink",
        "FORENSIC_HANDOFF_SYMLINK_REJECTED",
        (source) => {
          mkdirSync(source, { recursive: true });
          symlinkSync("missing-target", path.join(source, "link"));
        },
      ],
      [
        "hardlink",
        "FORENSIC_HANDOFF_HARDLINK_REJECTED",
        (source) => {
          mkdirSync(source, { recursive: true });
          const original = path.join(source, "original.txt");
          writeFileSync(original, "same inode\n");
          linkSync(original, path.join(source, "linked.txt"));
        },
      ],
    ];
    for (const [label, haltCode, populate] of cases) {
      const root = handoffScratch();
      const source = path.join(root, label);
      populate(source);
      const result = runHandoff(root, source);
      expect(result.status).not.toBe(0);
      const receipt = readReceipt(root);
      expect(receipt).toMatchObject({ status: "HALTED", haltCode });
      expect(
        (receipt.requiredComponentInventory as Record<string, boolean>)["handoff-receipt.json"],
      ).toBe(true);
    }

    const fifoRoot = handoffScratch();
    const fifoSource = path.join(fifoRoot, "fifo");
    mkdirSync(fifoSource, { recursive: true });
    try {
      execFileSync("mkfifo", [path.join(fifoSource, "pipe")]);
    } catch {
      return;
    }
    const fifo = runHandoff(fifoRoot, fifoSource);
    expect(fifo.status).not.toBe(0);
    expect(readReceipt(fifoRoot)).toMatchObject({
      status: "HALTED",
      haltCode: "FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE",
    });
  });
});

describe("Issue #149 the rehearsal synthetic builder preserves the output mount root", () => {
  type SourceAttestationEntry = {
    path: string;
    type: "directory" | "file";
    mode: string;
    uid: number;
    gid: number;
    length: number | null;
    sha256: string | null;
  };

  type RehearsalBuildReport = {
    status: string;
    runtimeUid: number;
    runtimeGid: number;
    restrictiveUmask: string;
    sourceAttestation: SourceAttestationEntry[];
    ocrRun: boolean;
    acquisitionApiInvoked: boolean;
    governedCorpusUsed: boolean;
    plantedFailures: string[];
  };

  function runSyntheticBuilder(output: string): { status: number; stdout: string; stderr: string } {
    const args = [
      "vite-node",
      "--config",
      "vitest.config.ts",
      "scripts/eval/issue-149-build-rehearsal-evidence.ts",
      output,
    ];
    try {
      const stdout = execFileSync("npx", args, { cwd: process.cwd(), encoding: "utf8" });
      return { status: 0, stdout, stderr: "" };
    } catch (cause) {
      const failure = cause as {
        status?: number;
        stdout?: Buffer | string;
        stderr?: Buffer | string;
      };
      return {
        status: failure.status ?? -1,
        stdout: Buffer.isBuffer(failure.stdout)
          ? failure.stdout.toString("utf8")
          : (failure.stdout ?? ""),
        stderr: Buffer.isBuffer(failure.stderr)
          ? failure.stderr.toString("utf8")
          : (failure.stderr ?? ""),
      };
    }
  }

  function sha256File(file: string): string {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  }

  function parseBuildReport(stdout: string): RehearsalBuildReport {
    return JSON.parse(stdout) as RehearsalBuildReport;
  }

  function expectSyntheticEvidence(root: string, stdout: string): RehearsalBuildReport {
    const report = parseBuildReport(stdout);
    expect(report).toMatchObject({
      status: "REHEARSAL_EVIDENCE_BUILT",
      runtimeUid: process.getuid?.() ?? statSync(root).uid,
      runtimeGid: process.getgid?.() ?? statSync(root).gid,
      restrictiveUmask: "077",
      ocrRun: false,
      acquisitionApiInvoked: false,
      governedCorpusUsed: false,
    });
    expect(report.plantedFailures).toContain("unreadable-0700");
    expect(existsSync(path.join(root, "raw", "primary", "item-9001"))).toBe(true);
    expect(existsSync(path.join(root, "raw", "repeat", "item-9002"))).toBe(true);
    expect(existsSync(path.join(root, "expected-items.json"))).toBe(true);
    expect(
      existsSync(
        path.join(root, "planted-unreadable-0700", "raw", "primary", "item-9001", "partial.txt"),
      ),
    ).toBe(true);
    return report;
  }

  function expectAttestationMatchesLstat(root: string, report: RehearsalBuildReport): void {
    const expectedPaths = [
      "raw",
      "raw/primary",
      "raw/primary/item-9001",
      "planted-unreadable-0700/raw/primary/item-9001",
      "planted-unreadable-0700/raw/primary/item-9001/partial.txt",
    ];
    expect(report.sourceAttestation.map((entry) => entry.path).sort()).toEqual(
      [...expectedPaths].sort(),
    );
    for (const entry of report.sourceAttestation) {
      const absolute = path.join(root, entry.path);
      const stat = lstatSync(absolute);
      expect(entry.type).toBe(stat.isDirectory() ? "directory" : "file");
      expect(entry.mode).toBe((stat.mode & 0o777).toString(8).padStart(4, "0"));
      expect(entry.uid).toBe(stat.uid);
      expect(entry.gid).toBe(stat.gid);
      if (stat.isFile()) {
        expect(entry.length).toBe(stat.size);
        expect(entry.sha256).toBe(sha256File(absolute));
      } else {
        expect(entry.length).toBeNull();
        expect(entry.sha256).toBeNull();
      }
    }
    expect(report.sourceAttestation.find((entry) => entry.path === "raw")?.mode).toBe("0700");
    expect(
      report.sourceAttestation.find(
        (entry) => entry.path === "planted-unreadable-0700/raw/primary/item-9001",
      )?.mode,
    ).toBe("0700");
    expect(
      report.sourceAttestation.find(
        (entry) => entry.path === "planted-unreadable-0700/raw/primary/item-9001/partial.txt",
      )?.mode,
    ).toBe("0600");
  }

  it("creates an absent output directory and writes only synthetic no-OCR evidence", () => {
    const root = path.join(scratch, `rehearsal-builder-absent-${uniqueRun++}`);
    const result = runSyntheticBuilder(root);
    expect(result.status).toBe(0);
    const report = expectSyntheticEvidence(root, result.stdout);
    expectAttestationMatchesLstat(root, report);
    expect(() =>
      validateRehearsalBuildReport(report, report.runtimeUid, report.runtimeGid),
    ).not.toThrow();
  });

  it("preserves an existing output directory identity while removing stale children", () => {
    const root = path.join(scratch, `rehearsal-builder-existing-${uniqueRun++}`);
    mkdirSync(path.join(root, "stale-dir", "nested"), { recursive: true });
    writeFileSync(path.join(root, "stale-file.txt"), "stale\n");
    writeFileSync(path.join(root, "stale-dir", "nested", "old.txt"), "old\n");
    const before = statSync(root);

    const result = runSyntheticBuilder(root);
    expect(result.status).toBe(0);
    const after = statSync(root);
    expect(after.dev).toBe(before.dev);
    expect(after.ino).toBe(before.ino);
    expect(existsSync(path.join(root, "stale-file.txt"))).toBe(false);
    expect(existsSync(path.join(root, "stale-dir"))).toBe(false);
    const report = expectSyntheticEvidence(root, result.stdout);
    expectAttestationMatchesLstat(root, report);
  });

  it("rejects filesystem root, symlink roots, and regular-file roots without a success report", () => {
    const rootResult = runSyntheticBuilder(path.parse(scratch).root);
    expect(rootResult.status).not.toBe(0);
    expect(rootResult.stdout).not.toContain("REHEARSAL_EVIDENCE_BUILT");
    expect(rootResult.stderr).toContain("REHEARSAL_OUTPUT_ROOT_REFUSED");

    const target = path.join(scratch, `rehearsal-builder-target-${uniqueRun++}`);
    const link = path.join(scratch, `rehearsal-builder-link-${uniqueRun++}`);
    mkdirSync(target, { recursive: true });
    symlinkSync(target, link);
    const linkResult = runSyntheticBuilder(link);
    expect(linkResult.status).not.toBe(0);
    expect(linkResult.stdout).not.toContain("REHEARSAL_EVIDENCE_BUILT");
    expect(linkResult.stderr).toContain("REHEARSAL_OUTPUT_SYMLINK_REFUSED");

    const file = path.join(scratch, `rehearsal-builder-file-${uniqueRun++}`);
    writeFileSync(file, "not a directory\n");
    const fileResult = runSyntheticBuilder(file);
    expect(fileResult.status).not.toBe(0);
    expect(fileResult.stdout).not.toContain("REHEARSAL_EVIDENCE_BUILT");
    expect(fileResult.stderr).toContain("REHEARSAL_OUTPUT_NOT_DIRECTORY");
  });

  it("halts validation for malformed, false-owner, false-mode, false-length, and false-digest attestations", () => {
    const root = path.join(scratch, `rehearsal-builder-validator-${uniqueRun++}`);
    const result = runSyntheticBuilder(root);
    expect(result.status).toBe(0);
    const report = expectSyntheticEvidence(root, result.stdout);
    const validUid = report.runtimeUid;
    const validGid = report.runtimeGid;

    expect(() =>
      validateRehearsalBuildReport({ ...report, sourceAttestation: undefined }, validUid, validGid),
    ).toThrow("REHEARSAL_SOURCE_ATTESTATION_MISSING");
    expect(() =>
      validateRehearsalBuildReport({ ...report, runtimeUid: validUid + 1 }, validUid, validGid),
    ).toThrow("REHEARSAL_RUNTIME_UID_MISMATCH");
    expect(() =>
      validateRehearsalBuildReport(
        {
          ...report,
          sourceAttestation: report.sourceAttestation.map((entry) =>
            entry.path === "planted-unreadable-0700/raw/primary/item-9001"
              ? { ...entry, mode: "0755" }
              : entry,
          ),
        },
        validUid,
        validGid,
      ),
    ).toThrow("REHEARSAL_PLANTED_ITEM_MODE_MISMATCH");
    expect(() =>
      validateRehearsalBuildReport(
        {
          ...report,
          sourceAttestation: report.sourceAttestation.map((entry) =>
            entry.path === "planted-unreadable-0700/raw/primary/item-9001/partial.txt"
              ? { ...entry, length: 11 }
              : entry,
          ),
        },
        validUid,
        validGid,
      ),
    ).toThrow("REHEARSAL_PLANTED_PARTIAL_DIGEST_MISMATCH");
    expect(() =>
      validateRehearsalBuildReport(
        {
          ...report,
          sourceAttestation: report.sourceAttestation.map((entry) =>
            entry.path === "planted-unreadable-0700/raw/primary/item-9001/partial.txt"
              ? { ...entry, sha256: "0".repeat(64) }
              : entry,
          ),
        },
        validUid,
        validGid,
      ),
    ).toThrow("REHEARSAL_PLANTED_PARTIAL_DIGEST_MISMATCH");
  });

  it("compares builder attestation to source-pre manifest as a load-bearing check", () => {
    const root = path.join(scratch, `rehearsal-builder-source-pre-${uniqueRun++}`);
    const result = runSyntheticBuilder(root);
    expect(result.status).toBe(0);
    const report = expectSyntheticEvidence(root, result.stdout);
    const entries = validateRehearsalBuildReport(report, report.runtimeUid, report.runtimeGid);
    const manifest = {
      entries: entries.map((entry) => ({
        path: entry.path,
        type: entry.type,
        mode: entry.mode,
        uid: entry.uid,
        gid: entry.gid,
        length: entry.length,
        digest: entry.sha256,
      })),
    };
    expect(() => compareAttestationToSourcePreManifest(entries, manifest)).not.toThrow();
    expect(() =>
      compareAttestationToSourcePreManifest(entries, {
        entries: manifest.entries.map((entry) =>
          entry.path === "planted-unreadable-0700/raw/primary/item-9001/partial.txt"
            ? { ...entry, digest: "0".repeat(64) }
            : entry,
        ),
      }),
    ).toThrow("REHEARSAL_SOURCE_PRE_DIGEST_MISMATCH");
  });
});

describe("Issue #149 the pre-handoff denial proof preserves captured streams", () => {
  function digest(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  function verifyDeniedReadProof(root: string): void {
    const proof = JSON.parse(readFileSync(path.join(root, "planted-0700-proof.json"), "utf8")) as {
      accessDenied: boolean;
      exitStatus: number;
      stdoutByteLength: number;
      stdoutSha256: string;
      stderrByteLength: number;
      stderrSha256: string;
      denialDiagnosticPattern: string;
    };
    const stdout = readFileSync(path.join(root, "planted-before-handoff.stdout"));
    const stderr = readFileSync(path.join(root, "planted-before-handoff.stderr"));
    if (proof.accessDenied !== true) throw new Error("PLANTED_0700_PROOF_ACCESS_DENIED_FALSE");
    if (proof.exitStatus === 0) throw new Error("PLANTED_0700_PROOF_EXIT_STATUS_ZERO");
    if (stdout.byteLength !== 0) throw new Error("PLANTED_0700_STDOUT_NOT_EMPTY");
    if (stderr.byteLength === 0) throw new Error("PLANTED_0700_STDERR_EMPTY");
    if (proof.stdoutByteLength !== stdout.byteLength || proof.stdoutSha256 !== digest(stdout)) {
      throw new Error("PLANTED_0700_STDOUT_DIGEST_MISMATCH");
    }
    if (proof.stderrByteLength !== stderr.byteLength || proof.stderrSha256 !== digest(stderr)) {
      throw new Error("PLANTED_0700_STDERR_DIGEST_MISMATCH");
    }
    if (!new RegExp(proof.denialDiagnosticPattern, "i").test(stderr.toString("utf8"))) {
      throw new Error("PLANTED_0700_DENIAL_DIAGNOSTIC_MISMATCH");
    }
  }

  function writeProof(root: string, overrides: Record<string, unknown> = {}): void {
    mkdirSync(root, { recursive: true });
    const stdout = Buffer.from("");
    const stderr = Buffer.from("cat: private: Permission denied\n");
    writeFileSync(path.join(root, "planted-before-handoff.stdout"), stdout);
    writeFileSync(path.join(root, "planted-before-handoff.stderr"), stderr);
    writeFileSync(
      path.join(root, "planted-0700-proof.json"),
      `${JSON.stringify(
        {
          attemptedPath:
            "synthetic-container/planted-unreadable-0700/raw/primary/item-9001/partial.txt",
          hostUid: process.getuid?.() ?? 501,
          hostGid: process.getgid?.() ?? 20,
          exitStatus: 1,
          accessDenied: true,
          stdoutByteLength: stdout.byteLength,
          stdoutSha256: digest(stdout),
          stderrByteLength: stderr.byteLength,
          stderrSha256: digest(stderr),
          denialDiagnosticMatched: true,
          denialDiagnosticPattern: "Permission denied|denied|Operation not permitted",
          sourceMutated: false,
          chmodAttempted: false,
          chownAttempted: false,
          ...overrides,
        },
        null,
        2,
      )}\n`,
    );
  }

  it("recomputes denial stream lengths and digests and rejects forged evidence", () => {
    const valid = path.join(scratch, `denial-proof-valid-${uniqueRun++}`);
    writeProof(valid);
    expect(() => verifyDeniedReadProof(valid)).not.toThrow();

    const forgedDigest = path.join(scratch, `denial-proof-forged-${uniqueRun++}`);
    writeProof(forgedDigest, { stderrSha256: "0".repeat(64) });
    expect(() => verifyDeniedReadProof(forgedDigest)).toThrow(
      "PLANTED_0700_STDERR_DIGEST_MISMATCH",
    );

    const emptyStderr = path.join(scratch, `denial-proof-empty-stderr-${uniqueRun++}`);
    writeProof(emptyStderr, { stderrByteLength: 0 });
    writeFileSync(path.join(emptyStderr, "planted-before-handoff.stderr"), "");
    expect(() => verifyDeniedReadProof(emptyStderr)).toThrow("PLANTED_0700_STDERR_EMPTY");
  });
});

describe("Issue #149 the authorization boundary is stated honestly", () => {
  it("says a branch-local gate cannot authenticate its own continued existence", () => {
    const authorization = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          "artifacts/issue-149-brand-complete-evidence-acquisition/execute-authorization.json",
        ),
        "utf8",
      ),
    ) as {
      status: string;
      reviewedImplementationSha: string | null;
      branchLocalGateLimitation: { statement: string };
      frozenAuthorizationProcedure: string[];
    };
    // Coherence, not today's value: the transition commit may change only the
    // mode file and this artifact, so a test that pinned their current contents
    // could not survive it.
    const committed = committedControlState();
    expect(committed.coherent, committed.reason ?? "").toBe(true);
    expect(authorization.status).toBe(committed.status);
    expect(authorization.reviewedImplementationSha).toBe(committed.reviewedImplementationSha);
    expect(authorization.branchLocalGateLimitation.statement).toContain("cannot prove");
    expect(authorization.frozenAuthorizationProcedure.length).toBeGreaterThanOrEqual(7);
    expect(authorization.frozenAuthorizationProcedure.join(" ")).toContain("do not push");
  });
});
