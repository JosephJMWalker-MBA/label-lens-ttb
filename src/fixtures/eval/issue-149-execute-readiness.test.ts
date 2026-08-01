/**
 * Issue #149 — the execute-readiness controls.
 *
 * Non-OCR. Every case drives the REAL implementation: the real item writer, the
 * real run-level writer, the real execute-transition decision function and the
 * real supply-chain pins. Nothing here runs the governed corpus.
 */
import { execFileSync } from "node:child_process";
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

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { extractLabelEvidenceDetailed, type ExtractionDebug } from "@/pipeline/extractor/extractor";
import type {
  ExtractionInput,
  OcrWord,
  RegionOcrResult,
} from "@/pipeline/extractor/extractor.types";

import {
  CandidateAdapterError,
  acquireProductionBrandEvidence,
  writeSealedEvidencePackage,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";
import {
  RUN_EVIDENCE_FILES,
  RunEvidenceError,
  sealRunEvidence,
  writeRunEvidence,
} from "../../../scripts/eval/lib/issue-149-run-evidence-writer";
import {
  EXECUTE_MODE_BYTES,
  PERMITTED_TRANSITION_PATHS,
  evaluateExecuteTransition,
} from "../../../scripts/eval/lib/issue-149-execute-authorization.mjs";
import {
  REGION_OCR_RESULT_KEYS,
  orderedWordsOnlyFingerprint,
  semanticPassFingerprint,
  sha256Bytes,
} from "../../../scripts/eval/lib/issue-149-evidence-canonical";

vi.mock("@/pipeline/extractor/extractor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pipeline/extractor/extractor")>()),
  extractLabelEvidenceDetailed: vi.fn(),
}));

/**
 * `node:fs`, with an injectable `writeFileSync`.
 *
 * The writer imports `writeFileSync` as a named binding, so the failure has to
 * be injected at the module boundary. `injectWriteFailureAfter` makes the Nth
 * write throw ENOSPC; everything else passes straight through to the real
 * implementation, so the test exercises the real transaction, not a simulation
 * of it.
 */
const injection = vi.hoisted(() => ({ failAfter: null as number | null, count: 0 }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const writeFileSync = ((...args: Parameters<typeof actual.writeFileSync>) => {
    const current = injection.count;
    injection.count += 1;
    if (injection.failAfter !== null && current === injection.failAfter) {
      throw Object.assign(new Error("injected ENOSPC"), { code: "ENOSPC" });
    }
    return actual.writeFileSync(...args);
  }) as typeof actual.writeFileSync;
  return { ...actual, default: { ...actual, writeFileSync }, writeFileSync };
});

function injectWriteFailureAfter(position: number | null): void {
  injection.failAfter = position;
  injection.count = 0;
}

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-execute-readiness-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const IMAGE = new Uint8Array([1, 2, 3]);
const IMAGE_SHA256 = sha256Bytes(IMAGE);

const word = (text: string, index: number, y: number): OcrWord =>
  ({
    text,
    rawConfidence: 92,
    bbox: { x0: index * 220, y0: y, x1: index * 220 + 200, y1: y + 60 },
    originalGeometry: {
      imageIndex: 0,
      x: index * 220,
      y,
      width: 200,
      height: 60,
      imageWidth: 1600,
      imageHeight: 1200,
    },
  }) as OcrWord;

function region(lines: string[][], totalMs = 6): RegionOcrResult {
  const words: OcrWord[] = [];
  lines.forEach((line, lineIndex) =>
    line.forEach((text, wordIndex) => words.push(word(text, wordIndex, 100 + lineIndex * 200))),
  );
  return {
    passId: "pass-1-full-image",
    regionName: "full-image",
    passKind: "full-image-primary",
    triggerReasons: [],
    preprocessing: [],
    fieldEligibility: { brand: true, alcohol: true },
    transform: {
      crop: { left: 0, top: 0, width: 1600, height: 1200 },
      rotate: 0,
      scale: 1,
      originalWidth: 1600,
      originalHeight: 1200,
    },
    transformedSize: { width: 1600, height: 1200 },
    pageSegMode: 11,
    rawWordCount: words.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 1, ocrMs: 2, inverseMappingMs: 3, totalMs },
    words,
  } as unknown as RegionOcrResult;
}

async function debugFor(passes: RegionOcrResult[]): Promise<ExtractionDebug> {
  const { selectBrandObservation } = await vi.importActual<
    typeof import("@/pipeline/extractor/field-selection")
  >("@/pipeline/extractor/field-selection");
  const primary = selectBrandObservation([passes[0]]);
  const brand = primary.observation.state === "OBSERVED" ? primary : selectBrandObservation(passes);
  return {
    decoded: { width: 1600, height: 1200, format: "png" },
    passes,
    primarySelections: { brand: primary, alcohol: primary },
    finalSelections: { brand, alcohol: primary },
  } as unknown as ExtractionDebug;
}

const inputFor = (itemId: string): ExtractionInput =>
  ({
    imageBytes: Uint8Array.from(IMAGE),
    artifactRef: itemId,
    derivativeSha256: IMAGE_SHA256,
    processedAt: "2026-07-12T00:00:00Z",
    extractionAdapterId: "local-two-field-extractor",
    extractionAdapterVersion: "1.0.0",
    ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  }) as unknown as ExtractionInput;

const PASSES = [
  region([
    ["RED", "BRICK", "WINERY"],
    ["NAPA", "VALLEY"],
  ]),
];

async function acquire(itemId = "item-0001", totalMs = 6) {
  const debug = await debugFor([
    region(
      [
        ["RED", "BRICK", "WINERY"],
        ["NAPA", "VALLEY"],
      ],
      totalMs,
    ),
  ]);
  vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
    ok: true,
    value: { response: {}, debug, sellerRegionReadings: [] },
  } as never);
  return acquireProductionBrandEvidence(inputFor(itemId));
}

beforeEach(() => vi.mocked(extractLabelEvidenceDetailed).mockReset());

describe("Issue #149 item persistence is transactional and single-use", () => {
  it("commits an item by an atomic directory rename, and reads every file back", async () => {
    const sealed = await acquire();
    const directory = path.join(scratch, "commit");
    const written = writeSealedEvidencePackage(sealed, { directory });

    expect(written.directory).toBe(path.join(directory, "item-0001"));
    expect(readdirSync(written.directory).sort()).toEqual(
      sealed.files.map((file) => file.path).sort(),
    );
    for (const file of sealed.files) {
      const bytes = readFileSync(path.join(written.directory, file.path));
      expect(sha256Bytes(bytes)).toBe(file.sha256);
    }
    // No staging directory survives a successful commit.
    expect(readdirSync(directory).filter((entry) => entry.startsWith(".staging-"))).toEqual([]);
  });

  it("refuses to write the same authentic package twice", async () => {
    const sealed = await acquire("item-0002");
    writeSealedEvidencePackage(sealed, { directory: path.join(scratch, "once") });
    expect(() =>
      writeSealedEvidencePackage(sealed, { directory: path.join(scratch, "twice") }),
    ).toThrow(expect.objectContaining({ code: "SEALED_PACKAGE_ALREADY_CONSUMED" }));
  });

  it("refuses a pre-existing destination rather than overwriting evidence", async () => {
    const directory = path.join(scratch, "existing");
    mkdirSync(path.join(directory, "item-0003"), { recursive: true });
    writeFileSync(path.join(directory, "item-0003", "item-0003.passes.json"), "OLD");
    const sealed = await acquire("item-0003");
    expect(() => writeSealedEvidencePackage(sealed, { directory })).toThrow(CandidateAdapterError);
    // The pre-existing bytes are untouched.
    expect(readFileSync(path.join(directory, "item-0003", "item-0003.passes.json"), "utf8")).toBe(
      "OLD",
    );
  });

  it("leaves NO committed item when a write fails after ANY individual write", async () => {
    // Failure is INJECTED after each write position in turn, by making the
    // real writer's next `writeFileSync` throw. The commit point is the
    // directory rename, so a failure at any position before it must leave no
    // committed item — and must leave no staging directory either.
    const probe = await acquire("item-0004");
    const fileCount = probe.files.length;
    expect(fileCount).toBeGreaterThan(1);

    for (let failAfter = 0; failAfter < fileCount; failAfter += 1) {
      const sealed = await acquire("item-0004");
      const directory = path.join(scratch, `inject-${failAfter}`);
      mkdirSync(directory, { recursive: true });

      injectWriteFailureAfter(failAfter);
      try {
        expect(() => writeSealedEvidencePackage(sealed, { directory })).toThrow();
      } finally {
        injectWriteFailureAfter(null);
      }

      // No committed item, at any injection point.
      expect(existsSync(path.join(directory, "item-0004"))).toBe(false);
      // And no staging directory left behind.
      expect(readdirSync(directory).filter((entry) => entry.startsWith(".staging-"))).toEqual([]);
    }
  });

  it("commits the complete, readback-verified set when nothing fails", async () => {
    const sealed = await acquire("item-0005");
    const directory = path.join(scratch, "complete");
    const written = writeSealedEvidencePackage(sealed, { directory });
    const committed = readdirSync(written.directory).sort();
    expect(committed).toEqual(sealed.files.map((file) => file.path).sort());
    for (const file of sealed.files) {
      expect(sha256Bytes(readFileSync(path.join(written.directory, file.path)))).toBe(file.sha256);
    }
  });

  it("does not describe catch-block deletion as the commit rule", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/eval/lib/issue-149-candidate-adapter.ts"),
      "utf8",
    );
    const prose = source.replace(/\s*\n\s*\*?\s*/g, " ");
    expect(prose).toContain("THE COMMIT POINT");
    expect(prose).toContain("is NOT crash-atomic");
    // Exclusive creation, never truncation.
    expect(source).toContain('flag: "wx"');
  });
});

describe("Issue #149 run-level evidence has one authenticated writer", () => {
  const DETERMINISM = {
    verdict: "COMPLETE_DETERMINISTIC_EVIDENCE" as const,
    comparedItems: 1,
    semanticallyDifferingItems: [] as string[],
    timingOnlyDifferingItems: [] as string[],
    differencesByLevel: {},
    comparedLevels: ["outcome"],
  };

  async function committedRun(runId: string, itemIds: string[]) {
    const rawDirectory = path.join(scratch, `run-${runId}`);
    for (const itemId of itemIds) {
      const sealed = await acquire(itemId);
      writeSealedEvidencePackage(sealed, { directory: rawDirectory });
    }
    return { rawDirectory, expectedItemIds: itemIds };
  }

  it("seals and commits the complete run-level file set", async () => {
    const { rawDirectory, expectedItemIds } = await committedRun("ok", ["item-0011", "item-0012"]);
    const sealed = sealRunEvidence({
      runId: "primary",
      rawDirectory,
      expectedItemIds,
      determinism: { ...DETERMINISM, comparedItems: 2 },
    });
    expect(sealed.files.map((file) => file.path)).toEqual([...RUN_EVIDENCE_FILES]);

    const written = writeRunEvidence(sealed, { directory: rawDirectory });
    expect(written.filesWritten).toBe(RUN_EVIDENCE_FILES.length);
    for (const file of RUN_EVIDENCE_FILES) {
      expect(existsSync(path.join(rawDirectory, file))).toBe(true);
    }
    const manifestBytes = readFileSync(path.join(rawDirectory, "raw-evidence-manifest.json"));
    const digestLine = readFileSync(
      path.join(rawDirectory, "raw-evidence-manifest.sha256"),
      "utf8",
    );
    expect(digestLine).toBe(`${sha256Bytes(manifestBytes)}  raw-evidence-manifest.json\n`);
  });

  it("halts when the committed item set disagrees with the expected one", async () => {
    const { rawDirectory, expectedItemIds } = await committedRun("short", ["item-0013"]);
    expect(() =>
      sealRunEvidence({
        runId: "primary",
        rawDirectory,
        expectedItemIds: [...expectedItemIds, "item-9999"],
        determinism: DETERMINISM,
      }),
    ).toThrow(expect.objectContaining({ code: "RUN_ITEM_SET_INCOMPLETE" }));
  });

  it("rejects a forged, replayed or overwriting run summary", async () => {
    const { rawDirectory, expectedItemIds } = await committedRun("forge", ["item-0014"]);
    const seal = () =>
      sealRunEvidence({
        runId: "primary",
        rawDirectory,
        expectedItemIds,
        determinism: DETERMINISM,
      });
    const sealed = seal();

    const forged = { ...sealed } as typeof sealed;
    expect(() => writeRunEvidence(forged, { directory: rawDirectory })).toThrow(
      expect.objectContaining({ code: "RUN_SUMMARY_UNAUTHENTIC" }),
    );

    writeRunEvidence(sealed, { directory: rawDirectory });
    expect(() => writeRunEvidence(sealed, { directory: rawDirectory })).toThrow(
      expect.objectContaining({ code: "RUN_EVIDENCE_ALREADY_CONSUMED" }),
    );
    expect(() => writeRunEvidence(seal(), { directory: rawDirectory })).toThrow(RunEvidenceError);
  });

  it("takes no caller-selected subset and no truth-bearing input", () => {
    expect(writeRunEvidence).toHaveLength(2);
    const source = readFileSync(
      path.join(process.cwd(), "scripts/eval/lib/issue-149-run-evidence-writer.ts"),
      "utf8",
    );
    for (const truth of [
      "governedTruth",
      "expectedBrand",
      "acceptableValues",
      "historicalCaseId",
    ]) {
      expect(source).not.toContain(truth);
    }
  });
});

describe("Issue #149 the pass representation matches the replay contract", () => {
  it("persists EXACTLY the thirteen RegionOcrResult fields, with no envelope", async () => {
    const sealed = await acquire("item-0021");
    const file = sealed.files.find((entry) => entry.path.endsWith(".passes.json"));
    const records = JSON.parse(Buffer.from(file!.bytes).toString("utf8")) as Array<
      Record<string, unknown>
    >;
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0]).sort()).toEqual([...REGION_OCR_RESULT_KEYS].sort());
    for (const forbidden of ["opaqueItemId", "passOrdinal"]) {
      expect(Object.hasOwn(records[0], forbidden)).toBe(false);
    }
  });

  it("supplies identity from the filename and ordinal from array position", async () => {
    const sealed = await acquire("item-0022");
    const file = sealed.files.find((entry) => entry.path.endsWith(".passes.json"))!;
    expect(file.path).toBe("item-0022.passes.json");
    expect(file.path.startsWith(sealed.itemId)).toBe(true);
  });
});

describe("Issue #149 the promised fingerprints are sealed", () => {
  const fingerprints = async (totalMs: number) => {
    const sealed = await acquire("item-0031", totalMs);
    const file = sealed.files.find((entry) => entry.path.endsWith(".fingerprints.json"))!;
    return JSON.parse(Buffer.from(file.bytes).toString("utf8")) as {
      orderedPassArraySemanticFingerprint: string;
      semanticPassExcludedKeys: string[];
      perPass: Array<{ semanticPassFingerprint: string; orderedWordsOnlyFingerprint: string }>;
    };
  };

  it("seals a per-pass semantic fingerprint, a words-only fingerprint and the array fingerprint", async () => {
    const sealedFingerprints = await fingerprints(6);
    expect(sealedFingerprints.semanticPassExcludedKeys).toEqual(["timings"]);
    expect(sealedFingerprints.perPass).toHaveLength(1);
    expect(sealedFingerprints.perPass[0].semanticPassFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(sealedFingerprints.perPass[0].orderedWordsOnlyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(sealedFingerprints.orderedPassArraySemanticFingerprint).toMatch(/^[0-9a-f]{64}$/);
    // The two per-pass digests are genuinely different quantities.
    expect(sealedFingerprints.perPass[0].semanticPassFingerprint).not.toBe(
      sealedFingerprints.perPass[0].orderedWordsOnlyFingerprint,
    );
  });

  it("does NOT change when only timings change", async () => {
    const fast = await fingerprints(6);
    const slow = await fingerprints(9999);
    expect(slow.perPass[0].semanticPassFingerprint).toBe(fast.perPass[0].semanticPassFingerprint);
    expect(slow.perPass[0].orderedWordsOnlyFingerprint).toBe(
      fast.perPass[0].orderedWordsOnlyFingerprint,
    );
    expect(slow.orderedPassArraySemanticFingerprint).toBe(fast.orderedPassArraySemanticFingerprint);
  });

  it("DOES change when words or a non-timing pass field change", () => {
    const base = region([["RED", "BRICK", "WINERY"]]);
    const differentWords = region([["SILVER", "OAK"]]);
    expect(semanticPassFingerprint(differentWords)).not.toBe(semanticPassFingerprint(base));
    expect(orderedWordsOnlyFingerprint(differentWords)).not.toBe(orderedWordsOnlyFingerprint(base));

    const differentPageSegMode = {
      ...(base as unknown as Record<string, unknown>),
      pageSegMode: 6,
    };
    expect(semanticPassFingerprint(differentPageSegMode)).not.toBe(semanticPassFingerprint(base));
    // …and the WORDS-only digest does not, because no word changed.
    expect(orderedWordsOnlyFingerprint(differentPageSegMode)).toBe(
      orderedWordsOnlyFingerprint(base),
    );
  });

  it("keeps artifact integrity over the exact bytes, timings included", async () => {
    const fast = await acquire("item-0032", 6);
    const passesFast = fast.files.find((entry) => entry.path.endsWith(".passes.json"))!;
    const slow = await acquire("item-0032", 9999);
    const passesSlow = slow.files.find((entry) => entry.path.endsWith(".passes.json"))!;
    // The sealed pass bytes DO include timings, so byte integrity differs even
    // though the semantic fingerprints agree. Both statements are true, and the
    // determinism verdict rests on the semantic one.
    expect(passesSlow.sha256).not.toBe(passesFast.sha256);
    expect(slow.aggregateSha256).not.toBe(fast.aggregateSha256);
  });
});

describe("Issue #149 the execute transition is gated on a reviewed head", () => {
  const REVIEWED = "a".repeat(40);
  const authorized = { status: "EXECUTE_AUTHORIZED", reviewedImplementationSha: REVIEWED };
  const base = {
    authorization: authorized,
    headSha: "b".repeat(40),
    reviewedShaIsAncestorOfHead: true,
    changedPathsSinceReviewedSha: [PERMITTED_TRANSITION_PATHS[0]],
    modeFileBytes: EXECUTE_MODE_BYTES,
  };
  const rules = (facts: Parameters<typeof evaluateExecuteTransition>[0]) =>
    evaluateExecuteTransition(facts).violations.map((violation) => violation.rule);

  it("permits a mode-only transition from the approved parent", () => {
    expect(evaluateExecuteTransition(base).ok).toBe(true);
    expect(
      evaluateExecuteTransition({
        ...base,
        changedPathsSinceReviewedSha: [...PERMITTED_TRANSITION_PATHS],
      }).ok,
    ).toBe(true);
  });

  it("rejects mode plus a runner modification", () => {
    expect(
      rules({
        ...base,
        changedPathsSinceReviewedSha: [
          PERMITTED_TRANSITION_PATHS[0],
          "scripts/eval/issue-149-brand-evidence-acquisition-run.ts",
        ],
      }),
    ).toContain("UNREVIEWED_FILE_CHANGED_AFTER_REVIEWED_HEAD");
  });

  it("rejects mode plus a workflow modification", () => {
    expect(
      rules({
        ...base,
        changedPathsSinceReviewedSha: [
          PERMITTED_TRANSITION_PATHS[0],
          ".github/workflows/issue-149-brand-evidence-acquisition.yml",
        ],
      }),
    ).toContain("UNREVIEWED_FILE_CHANGED_AFTER_REVIEWED_HEAD");
  });

  it("rejects multiple hidden commits after the approved head", () => {
    expect(
      rules({
        ...base,
        changedPathsSinceReviewedSha: [
          PERMITTED_TRANSITION_PATHS[0],
          "scripts/eval/lib/issue-149-candidate-adapter.ts",
          "artifacts/issue-149-brand-complete-evidence-acquisition/evidence-schema.json",
          "package.json",
        ],
      }),
    ).toContain("UNREVIEWED_FILE_CHANGED_AFTER_REVIEWED_HEAD");
  });

  it("rejects a wrong approved SHA", () => {
    expect(rules({ ...base, reviewedShaIsAncestorOfHead: false })).toContain(
      "REVIEWED_HEAD_NOT_ANCESTOR",
    );
  });

  it("rejects malformed or absent authorization", () => {
    expect(rules({ ...base, authorization: null })).toContain("AUTHORIZATION_ARTIFACT_ABSENT");
    for (const malformed of [
      { status: "EXECUTE_AUTHORIZED", reviewedImplementationSha: null },
      { status: "EXECUTE_AUTHORIZED", reviewedImplementationSha: "abc" },
      { status: "EXECUTE_AUTHORIZED", reviewedImplementationSha: "A".repeat(40) },
    ]) {
      expect(rules({ ...base, authorization: malformed as never })).toContain(
        "AUTHORIZATION_MALFORMED",
      );
    }
    expect(
      rules({
        ...base,
        authorization: { status: "EXECUTE_NOT_AUTHORIZED", reviewedImplementationSha: REVIEWED },
      }),
    ).toContain("EXECUTE_NOT_AUTHORIZED");
  });

  it("rejects whitespace-normalized but non-exact mode bytes", () => {
    for (const nearly of ["execute", " execute\n", "execute\n\n", "execute\r\n", "  execute  "]) {
      expect(rules({ ...base, modeFileBytes: nearly })).toContain("MODE_BYTES_NOT_EXACT");
    }
    expect(rules({ ...base, modeFileBytes: "discover\n" })).toContain(
      "MODE_NOT_TRANSITIONED_TO_EXECUTE",
    );
  });

  it("is EXECUTE_NOT_AUTHORIZED today, and the real gate says so", () => {
    const artifact = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "execute-authorization.json"), "utf8"),
    ) as { status: string; reviewedImplementationSha: string | null };
    expect(artifact.status).toBe("EXECUTE_NOT_AUTHORIZED");
    expect(artifact.reviewedImplementationSha).toBeNull();

    let code = 0;
    try {
      execFileSync("node", ["scripts/eval/issue-149-execute-gate.mjs"], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (cause) {
      code = (cause as { status?: number }).status ?? -1;
    }
    expect(code).toBe(1);
  });

  it("says plainly that the paths filter is not the control", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
      "utf8",
    );
    const prose = workflow.replace(/\s*\n\s*#?\s*/g, " ");
    expect(prose).toContain("It does NOT restrict what else that push contains");
    expect(workflow).toContain("scripts/eval/issue-149-execute-gate.mjs");
    // The OCR job cannot start unless the gate job succeeded.
    expect(workflow).toContain("needs: [resolve-mode, execute-transition-gate, job-a-prepare]");
  });
});

describe("Issue #149 the execution supply chain is pinned", () => {
  const workflow = readFileSync(
    path.join(process.cwd(), ".github/workflows/issue-149-brand-evidence-acquisition.yml"),
    "utf8",
  );
  const pins = JSON.parse(
    readFileSync(path.join(process.cwd(), ROOT, "execution-supply-chain-pins.json"), "utf8"),
  ) as {
    actions: Array<{ action: string; pinnedSha: string; resolvedFromTag: string }>;
    runtimeImage: { reference: string; manifestDigest: string; platform: string };
    pinnedRuntimeIdentity: { uid: number; gid: number };
  };

  it("references every action by full commit SHA, never by a movable tag", () => {
    const references = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
    expect(references.length).toBeGreaterThanOrEqual(8);
    for (const reference of references) {
      expect(reference).toMatch(/@[0-9a-f]{40}$/);
    }
    for (const action of pins.actions) {
      expect(workflow).toContain(`${action.action}@${action.pinnedSha}`);
      // The human-readable release is recorded beside the SHA.
      expect(action.resolvedFromTag).toMatch(/^v\d/);
    }
  });

  it("pins the runtime image by linux/amd64 digest and verifies it at run time", () => {
    expect(pins.runtimeImage.platform).toBe("linux/amd64");
    expect(pins.runtimeImage.manifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(workflow).toContain(pins.runtimeImage.reference);
    expect(workflow).toContain("RUNTIME_IMAGE_DIGEST_MISMATCH");
    expect(workflow).toContain("--platform linux/amd64");
  });

  it("pins a non-root runtime identity and passes it in for verification", () => {
    expect(pins.pinnedRuntimeIdentity.uid).toBeGreaterThan(0);
    expect(pins.pinnedRuntimeIdentity.gid).toBeGreaterThan(0);
    expect(workflow).toContain(`ISSUE_149_RUNTIME_UID: "${pins.pinnedRuntimeIdentity.uid}"`);
    expect(workflow).toContain('--user "${ISSUE_149_RUNTIME_UID}:${ISSUE_149_RUNTIME_GID}"');
    expect(workflow).toContain("ISSUE_149_EXPECTED_UID");
  });
});
