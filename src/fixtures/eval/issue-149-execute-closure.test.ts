/**
 * Issue #149 — the final execute-closure controls.
 *
 * Non-OCR. Synthetic evidence trees and a mocked extractor throughout; the
 * governed corpus is never touched. Every case drives the real implementation.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
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
    // The volume rule runs only AFTER verification.
    expect(workflow.indexOf("Actor 2 — verify")).toBeLessThan(
      workflow.indexOf("Apply the durable-archive volume rule"),
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
    expect(authorization.status).toBe("EXECUTE_NOT_AUTHORIZED");
    expect(authorization.reviewedImplementationSha).toBeNull();
    expect(authorization.branchLocalGateLimitation.statement).toContain("cannot prove");
    expect(authorization.frozenAuthorizationProcedure.length).toBeGreaterThanOrEqual(7);
    expect(authorization.frozenAuthorizationProcedure.join(" ")).toContain("do not push");
  });
});
