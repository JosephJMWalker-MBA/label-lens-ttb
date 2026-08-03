import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  brandNormalizedMatch,
  normalizeKey,
  normalizedIncludes,
} from "../../src/fixtures/eval/metrics";

const RUN_ID = "30775581351";
const BASE_SHA = "391b8fd342a34824174fdeffdf943110cddb9476";
const EXECUTE_SHA = "981e04b64c37955b6db8a8aed93c6ffc54c1e114";
const RESULT_ROOT = `artifacts/issue-149-brand-post-freeze-evaluation-${RUN_ID}`;
const EVIDENCE_ROOT = `artifacts/issue-149-brand-complete-evidence-result-${RUN_ID}`;
const RAW_ROOT = `${EVIDENCE_ROOT}/raw-evidence/host-readable-output/raw`;
const ID_MAP = "artifacts/issue-149-brand-complete-evidence-acquisition/post-freeze/id-map.json";
const TRUTH_MANIFEST = "src/fixtures/eval/eval-manifest.json";
const PRIOR_EVIDENCE = "artifacts/brand-evidence-path-diagnosis/cases.json";
const PRIOR_BASELINE =
  "artifacts/issue-149-brand-current-baseline-failure-decomposition/per-case-attribution.json";
const PRIOR_STAGE =
  "artifacts/issue-149-brand-candidate-construction-filter-decomposition/per-case-stage-attribution.json";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type Candidate = {
  activeRejectionReasons: string[];
  assembly: string;
  candidateOrdinal: number;
  cleanedValue: string;
  filterChecks: Array<{ check: string; failed: boolean }>;
  filterReason: string;
  kept: boolean;
  opaqueItemId: string;
  passId: string;
  passKind: string;
  rankedPosition: number | null;
  rawText: string;
  stableCandidateId: string;
};

type Line = {
  cleanedValue: string;
  lineOrdinal: number;
  passId: string;
  passKind: string;
  rawText: string;
};

type Word = {
  text: string;
  passId: string;
};

type Selection = {
  selection?: {
    observation?: {
      value?: string | null;
      state?: string;
      alternates?: Array<{ value?: string | null }>;
      candidateProvenance?: unknown;
    };
    abstentionReason?: string | null;
    authorityGate?: unknown;
    supportingPassIds?: string[];
    source?: unknown;
  };
  brand?: {
    observation?: {
      value?: string | null;
      state?: string;
      alternates?: Array<{ value?: string | null }>;
      candidateProvenance?: unknown;
    };
    abstentionReason?: string | null;
    authorityGate?: unknown;
    supportingPassIds?: string[];
    source?: unknown;
  };
};

type TruthRecord = {
  caseId: string;
  imagePath: string;
  expectedSha256: string;
  annotation: {
    brand: {
      presence: "present" | "absent";
      acceptablePresentations?: string[];
      genuinelyAmbiguous?: boolean;
    };
  };
};

type MapEntry = {
  opaqueItemId: string;
  historicalCaseId: string;
  historicalImagePath: string;
  sourceImageSha256: string;
  sourceImageByteSize: number;
};

type CaseEvaluation = {
  opaqueItemId: string;
  historicalCaseId: string;
  historicalImagePath: string;
  sourceImageSha256: string;
  sourceImageByteSize: number;
  brandPresent: boolean;
  acceptableValues: string[];
  knownAmbiguous: boolean;
  truthInRawOcr: boolean;
  truthOnReconstructedLine: boolean;
  truthBearingCandidateFormed: boolean;
  truthBearingCandidateFormedStatus: "evaluated" | "CANNOT_COMPARE_SEMANTICALLY";
  truthBearingCandidateKept: boolean;
  truthBearingCandidateEnteredFinalRanking: boolean;
  truthBearingCandidates: Array<{
    stableCandidateId: string;
    candidateOrdinal: number;
    rawText: string;
    cleanedValue: string;
    kept: boolean;
    rankedPosition: number | null;
    activeRejectionReasons: string[];
    filterReason: string;
    filterChecks: Array<{ check: string; failed: boolean }>;
    passId: string;
    passKind: string;
    assembly: string;
  }>;
  filtersRejectingEachTruthBearingCandidate: Array<{
    stableCandidateId: string;
    candidateOrdinal: number;
    activeRejectionReasons: string[];
    filterReason: string;
    filterChecks: Array<{ check: string; failed: boolean }>;
    passId: string;
    passKind: string;
    assembly: string;
  }>;
  truthRank: {
    rankedPositions: number[];
    bestRankedPosition: number | null;
  };
  selectedCorrectness: "correct" | "incorrect" | "absent-no-selection" | "absent-false-certainty";
  finalAuthorityResult: {
    selectedValue: string | null;
    finalAuthorityState: string | null;
    abstentionReason: string | null;
    supportingPassIds: string[];
    supportingPassInformation: unknown;
  };
  absentCaseDiagnostics: null | {
    rawOcrContainedBrandLikeText: boolean;
    anyCandidateFormed: boolean;
    anyCandidateKept: boolean;
    brandValueSelected: boolean;
    finalAuthorityState: string | null;
    abstentionReason: string | null;
    falseCertainty: boolean;
  };
};

type CurrentResult = {
  artifact: "issue-149-brand-post-freeze-current-per-case-evaluation";
  runId: string;
  baseSha: string;
  executeSha: string;
  currentResultFrozenBeforeHistoricalComparison: true;
  cases: CaseEvaluation[];
};

type DifferenceCode =
  | "CURRENT_RERUN_CONFIRMS_PRIOR_FIELD"
  | "PRIOR_FIELD_NOT_REPRODUCED"
  | "CURRENT_PIPELINE_DIFFERENCE"
  | "NONDETERMINISTIC_EVIDENCE"
  | "CANNOT_COMPARE_SEMANTICALLY";

export function stableStringify(value: Json): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function stableValue(value: unknown): Json {
  if (value === undefined) return null;
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return String(value);
}

function stablePretty(value: unknown): string {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function writeJson(file: string, value: Json): void {
  writeFileSync(file, stablePretty(value));
}

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function readJsonl<T>(file: string): T[] {
  const text = readFileSync(file, "utf8").trim();
  if (text.length === 0) return [];
  return text.split("\n").map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch (cause) {
      throw new Error(`MALFORMED_JSONL:${file}:${index + 1}:${String(cause)}`);
    }
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function itemId(index: number): string {
  return `item-${String(index).padStart(4, "0")}`;
}

function matchesTruth(value: string | null | undefined, acceptable: string[]): boolean {
  if (typeof value !== "string") return false;
  return brandNormalizedMatch(value, acceptable) || normalizedIncludes(value, acceptable);
}

function exactCandidateTruth(
  candidate: Candidate,
  acceptable: string[],
  ambiguities: Array<{
    opaqueItemId: string;
    candidateOrdinal: number;
    rawMatch: boolean;
    cleanedMatch: boolean;
  }>,
): boolean {
  const raw = matchesTruth(candidate.rawText, acceptable);
  const cleaned = matchesTruth(candidate.cleanedValue, acceptable);
  if (raw !== cleaned) {
    ambiguities.push({
      opaqueItemId: candidate.opaqueItemId,
      candidateOrdinal: candidate.candidateOrdinal,
      rawMatch: raw,
      cleanedMatch: cleaned,
    });
  }
  return raw && cleaned;
}

function loadIdMap(): MapEntry[] {
  const map = readJson<{ entryCount: number; map: MapEntry[] }>(ID_MAP);
  assert(map.entryCount === 115, "ID_MAP_ENTRY_COUNT_NOT_115");
  assert(map.map.length === 115, "ID_MAP_LENGTH_NOT_115");
  return map.map;
}

function loadTruth(): Map<string, TruthRecord> {
  const manifest = readJson<{ records: TruthRecord[] }>(TRUTH_MANIFEST);
  return new Map(manifest.records.map((record) => [record.caseId, record]));
}

function validateJoin(map: MapEntry[], truth: Map<string, TruthRecord>): void {
  const opaque = new Set<string>();
  const historical = new Set<string>();
  for (let i = 0; i < 115; i += 1) {
    const entry = map[i];
    const expectedOpaque = itemId(i + 1);
    assert(entry.opaqueItemId === expectedOpaque, `OPAQUE_ID_NOT_CONTIGUOUS:${entry.opaqueItemId}`);
    assert(!opaque.has(entry.opaqueItemId), `DUPLICATE_OPAQUE_ID:${entry.opaqueItemId}`);
    assert(
      !historical.has(entry.historicalCaseId),
      `DUPLICATE_HISTORICAL_CASE:${entry.historicalCaseId}`,
    );
    opaque.add(entry.opaqueItemId);
    historical.add(entry.historicalCaseId);
    const truthRecord = truth.get(entry.historicalCaseId);
    assert(truthRecord, `MISSING_TRUTH_RECORD:${entry.historicalCaseId}`);
    assert(
      truthRecord.imagePath === entry.historicalImagePath,
      `IMAGE_PATH_MISMATCH:${entry.opaqueItemId}`,
    );
    assert(
      truthRecord.expectedSha256 === entry.sourceImageSha256,
      `IMAGE_SHA_MISMATCH:${entry.opaqueItemId}`,
    );
    assert(
      statSync(entry.historicalImagePath).size === entry.sourceImageByteSize,
      `IMAGE_BYTE_SIZE_MISMATCH:${entry.opaqueItemId}`,
    );
    const provenance = readJson<{ imageSha256: string; imageByteLength: number }>(
      `${RAW_ROOT}/primary/${entry.opaqueItemId}/${entry.opaqueItemId}.provenance.json`,
    );
    assert(
      provenance.imageSha256 === entry.sourceImageSha256,
      `PROVENANCE_SHA_MISMATCH:${entry.opaqueItemId}`,
    );
    assert(
      provenance.imageByteLength === entry.sourceImageByteSize,
      `PROVENANCE_BYTES_MISMATCH:${entry.opaqueItemId}`,
    );
  }
}

function evaluateRun(
  run: "primary" | "repeat",
  map: MapEntry[],
  truth: Map<string, TruthRecord>,
): CaseEvaluation[] {
  return map.map((entry) => {
    const root = `${RAW_ROOT}/${run}/${entry.opaqueItemId}`;
    const truthRecord = truth.get(entry.historicalCaseId);
    assert(truthRecord, `MISSING_TRUTH:${entry.historicalCaseId}`);
    const brand = truthRecord.annotation.brand;
    const brandPresent = brand.presence === "present";
    const acceptableValues = brand.acceptablePresentations ?? [];
    assert(
      brandPresent ? acceptableValues.length > 0 : acceptableValues.length === 0,
      `BRAND_TRUTH_SHAPE:${entry.opaqueItemId}`,
    );
    const words = readJsonl<Word>(`${root}/${entry.opaqueItemId}.words.jsonl`);
    const lines = readJsonl<Line>(`${root}/${entry.opaqueItemId}.lines.jsonl`);
    const candidates = readJsonl<Candidate>(`${root}/${entry.opaqueItemId}.candidates.jsonl`);
    const selection = readJson<Selection>(`${root}/${entry.opaqueItemId}.selection.json`);
    const brandSelection = selection.brand ?? selection.selection;
    assert(words.length > 0, `NO_WORDS:${entry.opaqueItemId}`);
    assert(
      candidates.every((candidate, index) => candidate.candidateOrdinal === index),
      `CANDIDATES_NOT_ORDINAL:${entry.opaqueItemId}`,
    );
    assert(
      candidates.every((candidate) => candidate.opaqueItemId === entry.opaqueItemId),
      `CANDIDATE_OPAQUE_MISMATCH:${entry.opaqueItemId}`,
    );

    const wordText = words.map((word) => word.text).join(" ");
    const truthInRawOcr = brandPresent && normalizedIncludes(wordText, acceptableValues);
    const truthOnReconstructedLine =
      brandPresent &&
      lines.some(
        (line) =>
          matchesTruth(line.rawText, acceptableValues) ||
          matchesTruth(line.cleanedValue, acceptableValues),
      );
    const candidateAmbiguities: Array<{
      opaqueItemId: string;
      candidateOrdinal: number;
      rawMatch: boolean;
      cleanedMatch: boolean;
    }> = [];
    const truthBearingCandidates = brandPresent
      ? candidates.filter((candidate) =>
          exactCandidateTruth(candidate, acceptableValues, candidateAmbiguities),
        )
      : [];
    const rejectedTruthCandidates = truthBearingCandidates.filter((candidate) => !candidate.kept);
    const rankedPositions = truthBearingCandidates
      .map((candidate) => candidate.rankedPosition)
      .filter((position): position is number => typeof position === "number")
      .sort((a, b) => a - b);
    const selectedValue = brandSelection?.observation?.value ?? null;
    const finalAuthorityState = brandSelection?.observation?.state ?? null;
    const abstentionReason = brandSelection?.abstentionReason ?? null;
    const selectedMatches = brandPresent
      ? brandNormalizedMatch(selectedValue, acceptableValues)
      : false;
    const selectedCorrectness = brandPresent
      ? selectedMatches
        ? "correct"
        : "incorrect"
      : selectedValue === null
        ? "absent-no-selection"
        : "absent-false-certainty";

    return {
      opaqueItemId: entry.opaqueItemId,
      historicalCaseId: entry.historicalCaseId,
      historicalImagePath: entry.historicalImagePath,
      sourceImageSha256: entry.sourceImageSha256,
      sourceImageByteSize: entry.sourceImageByteSize,
      brandPresent,
      acceptableValues,
      knownAmbiguous: brand.genuinelyAmbiguous ?? false,
      truthInRawOcr,
      truthOnReconstructedLine,
      truthBearingCandidateFormed: truthBearingCandidates.length > 0,
      truthBearingCandidateFormedStatus:
        candidateAmbiguities.length === 0 ? "evaluated" : "CANNOT_COMPARE_SEMANTICALLY",
      truthBearingCandidateKept: truthBearingCandidates.some((candidate) => candidate.kept),
      truthBearingCandidateEnteredFinalRanking: rankedPositions.length > 0,
      truthBearingCandidates: truthBearingCandidates.map((candidate) => ({
        stableCandidateId: candidate.stableCandidateId,
        candidateOrdinal: candidate.candidateOrdinal,
        rawText: candidate.rawText,
        cleanedValue: candidate.cleanedValue,
        kept: candidate.kept,
        rankedPosition: candidate.rankedPosition,
        activeRejectionReasons: candidate.activeRejectionReasons,
        filterReason: candidate.filterReason,
        filterChecks: candidate.filterChecks,
        passId: candidate.passId,
        passKind: candidate.passKind,
        assembly: candidate.assembly,
      })),
      filtersRejectingEachTruthBearingCandidate: rejectedTruthCandidates.map((candidate) => ({
        stableCandidateId: candidate.stableCandidateId,
        candidateOrdinal: candidate.candidateOrdinal,
        activeRejectionReasons: candidate.activeRejectionReasons,
        filterReason: candidate.filterReason,
        filterChecks: candidate.filterChecks,
        passId: candidate.passId,
        passKind: candidate.passKind,
        assembly: candidate.assembly,
      })),
      truthRank: {
        rankedPositions,
        bestRankedPosition: rankedPositions[0] ?? null,
      },
      selectedCorrectness,
      finalAuthorityResult: {
        selectedValue,
        finalAuthorityState,
        abstentionReason,
        supportingPassIds: brandSelection?.supportingPassIds ?? [],
        supportingPassInformation:
          brandSelection?.source ?? brandSelection?.observation?.candidateProvenance ?? null,
      },
      absentCaseDiagnostics: brandPresent
        ? null
        : {
            rawOcrContainedBrandLikeText: words.some((word) => normalizeKey(word.text).length >= 4),
            anyCandidateFormed: candidates.length > 0,
            anyCandidateKept: candidates.some((candidate) => candidate.kept),
            brandValueSelected: selectedValue !== null,
            finalAuthorityState,
            abstentionReason,
            falseCertainty: selectedCorrectness === "absent-false-certainty",
          },
      ...(candidateAmbiguities.length === 0 ? {} : { contractAmbiguities: candidateAmbiguities }),
    };
  });
}

function comparePrimaryRepeat(primary: CaseEvaluation[], repeat: CaseEvaluation[]): string[] {
  const differences: string[] = [];
  for (let i = 0; i < primary.length; i += 1) {
    const a = { ...primary[i], sourceImageByteSize: 0 };
    const b = { ...repeat[i], sourceImageByteSize: 0 };
    if (stableStringify(a as unknown as Json) !== stableStringify(b as unknown as Json)) {
      differences.push(primary[i].opaqueItemId);
    }
  }
  return differences;
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>,
  );
}

function aggregate(cases: CaseEvaluation[], primaryRepeatSemanticDifferences: string[]): Json {
  const present = cases.filter((entry) => entry.brandPresent);
  const absent = cases.filter((entry) => !entry.brandPresent);
  assert(present.length === 105, `BRAND_PRESENT_COUNT_NOT_105:${present.length}`);
  assert(absent.length === 10, `BRAND_ABSENT_COUNT_NOT_10:${absent.length}`);
  const rejectionReasons = present.flatMap((entry) =>
    entry.filtersRejectingEachTruthBearingCandidate.flatMap(
      (candidate) => candidate.activeRejectionReasons,
    ),
  );
  const bestRanks = present.map((entry) => entry.truthRank.bestRankedPosition);
  return {
    artifact: "issue-149-brand-post-freeze-aggregate-evaluation",
    status: present.some((entry) => entry.truthBearingCandidateFormedStatus !== "evaluated")
      ? "HALTED_FIELD_CONTRACT_AMBIGUITY"
      : "COMPLETE",
    runId: RUN_ID,
    caseCount: cases.length,
    brandPresent: {
      denominator: present.length,
      truthPresentInRawOcr: present.filter((entry) => entry.truthInRawOcr).length,
      truthPresentOnReconstructedLine: present.filter((entry) => entry.truthOnReconstructedLine)
        .length,
      truthBearingCandidateFormed: present.filter((entry) => entry.truthBearingCandidateFormed)
        .length,
      truthBearingCandidateFormedCannotCompareSemantically: present.filter(
        (entry) => entry.truthBearingCandidateFormedStatus !== "evaluated",
      ).length,
      truthBearingCandidateKept: present.filter((entry) => entry.truthBearingCandidateKept).length,
      truthBearingCandidateEnteredFinalRanking: present.filter(
        (entry) => entry.truthBearingCandidateEnteredFinalRanking,
      ).length,
      acceptableBrandSelected: present.filter((entry) => entry.selectedCorrectness === "correct")
        .length,
      finalAuthorityStateCounts: countBy(
        present.map((entry) => entry.finalAuthorityResult.finalAuthorityState ?? "null"),
      ),
      selectedCorrectnessCounts: countBy(present.map((entry) => entry.selectedCorrectness)),
      bestTruthRankDistribution: countBy(
        bestRanks.map((rank) => (rank === null ? "null" : String(rank))),
      ),
      rejectionReasonFrequencies: countBy(rejectionReasons),
      abstentionReasonFrequencies: countBy(
        present.map((entry) => entry.finalAuthorityResult.abstentionReason ?? "null"),
      ),
    },
    brandAbsent: {
      denominator: absent.length,
      rawOcrContainedBrandLikeText: absent.filter(
        (entry) => entry.absentCaseDiagnostics?.rawOcrContainedBrandLikeText,
      ).length,
      anyCandidateFormed: absent.filter((entry) => entry.absentCaseDiagnostics?.anyCandidateFormed)
        .length,
      anyCandidateKept: absent.filter((entry) => entry.absentCaseDiagnostics?.anyCandidateKept)
        .length,
      brandValueSelected: absent.filter((entry) => entry.absentCaseDiagnostics?.brandValueSelected)
        .length,
      falseCertainty: absent.filter((entry) => entry.absentCaseDiagnostics?.falseCertainty).length,
      finalAuthorityStateCounts: countBy(
        absent.map((entry) => entry.finalAuthorityResult.finalAuthorityState ?? "null"),
      ),
      abstentionReasonFrequencies: countBy(
        absent.map((entry) => entry.finalAuthorityResult.abstentionReason ?? "null"),
      ),
    },
    primaryRepeatSemanticDifferenceCount: primaryRepeatSemanticDifferences.length,
    primaryRepeatSemanticDifferences,
  };
}

function priorArray(file: string): Array<Record<string, unknown>> {
  const value = readJson<unknown>(file);
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (value && typeof value === "object" && Array.isArray((value as { cases?: unknown }).cases)) {
    return (value as { cases: Array<Record<string, unknown>> }).cases;
  }
  throw new Error(`PRIOR_SHAPE_UNSUPPORTED:${file}`);
}

function historicalCrossCheck(cases: CaseEvaluation[]): Json {
  const sources = [
    { name: "brand-evidence-path-diagnosis", rows: priorArray(PRIOR_EVIDENCE) },
    { name: "current-baseline-failure-decomposition", rows: priorArray(PRIOR_BASELINE) },
    { name: "candidate-construction-filter-decomposition", rows: priorArray(PRIOR_STAGE) },
  ];
  const comparisons: Json[] = [];
  const codes: DifferenceCode[] = [];
  for (const source of sources) {
    const byCase = new Map(source.rows.map((row) => [String(row.caseId), row]));
    for (const current of cases) {
      const prior = byCase.get(current.historicalCaseId);
      if (!prior) {
        codes.push("CANNOT_COMPARE_SEMANTICALLY");
        comparisons.push({
          source: source.name,
          historicalCaseId: current.historicalCaseId,
          code: "CANNOT_COMPARE_SEMANTICALLY",
          field: "case-presence",
        });
        continue;
      }
      const checks: Array<[string, unknown, unknown]> = [
        [
          "truthInRawOcr",
          prior.truthInRawOcr ??
            (prior.rawOcrEvidence as { truthPresentInRawOcr?: unknown } | undefined)
              ?.truthPresentInRawOcr,
          current.truthInRawOcr,
        ],
        [
          "truthOnReconstructedLine",
          prior.truthOnReconstructedLine ??
            (prior.rawOcrEvidence as { truthOnReconstructedLine?: unknown } | undefined)
              ?.truthOnReconstructedLine,
          current.truthOnReconstructedLine,
        ],
        [
          "truthBearingCandidateKept",
          prior.truthAmongKeptCandidates,
          current.truthBearingCandidateKept,
        ],
        ["truthRank", prior.truthRank, current.truthRank.bestRankedPosition],
      ];
      for (const [field, priorValue, currentValue] of checks) {
        const code: DifferenceCode =
          priorValue === undefined
            ? "CANNOT_COMPARE_SEMANTICALLY"
            : stableStringify(priorValue as Json) === stableStringify(currentValue as Json)
              ? "CURRENT_RERUN_CONFIRMS_PRIOR_FIELD"
              : "CURRENT_PIPELINE_DIFFERENCE";
        codes.push(code);
        comparisons.push({
          source: source.name,
          historicalCaseId: current.historicalCaseId,
          field,
          code,
          priorValue: priorValue as Json,
          currentValue: currentValue as Json,
          pipelineChange:
            code === "CURRENT_PIPELINE_DIFFERENCE"
              ? "Current evaluation uses the complete preserved run 30775581351 raw words, lines and candidate arrays plus debug.finalSelections authority; prior artifacts were earlier diagnostic decompositions."
              : null,
        });
      }
    }
  }
  return {
    artifact: "issue-149-brand-post-freeze-historical-cross-check",
    currentResultHashFrozenBeforeLoadingPrior: true,
    comparisonCodeCounts: countBy(codes),
    comparisons,
  };
}

function validateInputs(): Json {
  const rawVerification = readJson<{ rawVerification: { ok: boolean } }>(
    `${EVIDENCE_ROOT}/raw-evidence/raw-verification-report.json`,
  );
  const identity = readJson<{ identityVerification: { ok: boolean; hits: unknown[] } }>(
    `${EVIDENCE_ROOT}/raw-evidence/identity-leak-report.json`,
  );
  const outcome = readJson<{ outcomeClass: string; finalDecision: string }>(
    `${EVIDENCE_ROOT}/raw-evidence/acquisition-outcome-report.json`,
  );
  assert(rawVerification.rawVerification.ok === true, "RAW_VERIFICATION_NOT_OK");
  assert(identity.identityVerification.ok === true, "IDENTITY_NOT_OK");
  assert(identity.identityVerification.hits.length === 0, "IDENTITY_HITS_NOT_EMPTY");
  assert(
    outcome.outcomeClass === "SCIENTIFIC_RESULT_COMPLETE",
    "RUN_NOT_SCIENTIFIC_RESULT_COMPLETE",
  );
  assert(outcome.finalDecision === "SCIENTIFIC_RESULT_COMPLETE", "RUN_FINAL_DECISION_NOT_COMPLETE");
  const excluded = readJson<{ classification: string }>(
    "artifacts/issue-149-brand-complete-evidence-acquisition/governed-attempt-30772967991-truth-isolation-failure.json",
  );
  return {
    rawVerificationOk: rawVerification.rawVerification.ok,
    identityVerificationOk: identity.identityVerification.ok,
    identityHits: identity.identityVerification.hits as Json,
    acquisitionOutcomeClass: outcome.outcomeClass,
    excludedRun30772967991: excluded.classification ?? "INCOMPLETE_EVIDENCE",
  };
}

export function runEvaluation(outputRoot = RESULT_ROOT): void {
  assert(
    !path.resolve(outputRoot).startsWith(path.resolve(EVIDENCE_ROOT)),
    "OUTPUT_INSIDE_IMMUTABLE_EVIDENCE",
  );
  if (existsSync(outputRoot)) rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });

  const inputValidation = validateInputs();
  const idMap = loadIdMap();
  const truth = loadTruth();
  validateJoin(idMap, truth);

  const primary = evaluateRun("primary", idMap, truth);
  const repeat = evaluateRun("repeat", idMap, truth);
  const semanticDifferences = comparePrimaryRepeat(primary, repeat);
  assert(
    semanticDifferences.length === 0,
    `PRIMARY_REPEAT_SEMANTIC_DIFFERENCES:${semanticDifferences.join(",")}`,
  );

  const current: CurrentResult = {
    artifact: "issue-149-brand-post-freeze-current-per-case-evaluation",
    runId: RUN_ID,
    baseSha: BASE_SHA,
    executeSha: EXECUTE_SHA,
    currentResultFrozenBeforeHistoricalComparison: true,
    cases: primary,
  };
  const currentText = stablePretty(current);
  writeFileSync(`${outputRoot}/current-per-case-evaluation.json`, currentText);
  writeFileSync(
    `${outputRoot}/current-per-case-evaluation.sha256`,
    `${sha256(currentText)}  current-per-case-evaluation.json\n`,
  );

  const aggregateResult = aggregate(primary, semanticDifferences);
  writeJson(`${outputRoot}/aggregate-evaluation.json`, aggregateResult);
  writeJson(`${outputRoot}/historical-cross-check.json`, historicalCrossCheck(primary));
  writeJson(`${outputRoot}/evaluation-provenance.json`, {
    artifact: "issue-149-brand-post-freeze-evaluation-provenance",
    runId: RUN_ID,
    baseSha: BASE_SHA,
    executeSha: EXECUTE_SHA,
    rawRoot: RAW_ROOT,
    idMap: ID_MAP,
    truthManifest: TRUTH_MANIFEST,
    normalizationImports: [
      "src/fixtures/eval/metrics.ts#normalizeKey",
      "src/fixtures/eval/metrics.ts#brandNormalizedMatch",
      "src/fixtures/eval/metrics.ts#normalizedIncludes",
    ],
    actor3Authorization: true,
    noOcr: true,
    noAcquisition: true,
    noReplay: true,
    currentResultSha256: sha256(currentText),
  });
  writeJson(`${outputRoot}/evaluation-validation.json`, {
    artifact: "issue-149-brand-post-freeze-evaluation-validation",
    inputValidation,
    idMapCount: idMap.length,
    perCaseCount: primary.length,
    brandPresentCount: primary.filter((entry) => entry.brandPresent).length,
    brandAbsentCount: primary.filter((entry) => !entry.brandPresent).length,
    primaryRepeatSemanticDifferenceCount: semanticDifferences.length,
    contractAmbiguities: primary.flatMap((entry) =>
      "contractAmbiguities" in entry
        ? [
            {
              opaqueItemId: entry.opaqueItemId,
              field: "truthBearingCandidateFormed",
              detail: (entry as unknown as { contractAmbiguities: Json }).contractAmbiguities,
            },
          ]
        : [],
    ) as Json,
    haltedFields: primary
      .filter((entry) => entry.truthBearingCandidateFormedStatus !== "evaluated")
      .map((entry) => ({
        opaqueItemId: entry.opaqueItemId,
        field: "truthBearingCandidateFormed",
        status: entry.truthBearingCandidateFormedStatus,
      })),
    immutableEvidenceWritten: false,
  });
  writeFileSync(
    `${outputRoot}/limitations.md`,
    [
      "# Issue #149 Post-Freeze Evaluation Limitations",
      "",
      "This is one frozen 115-case corpus.",
      "",
      "The result evaluates the incumbent pipeline at the frozen base.",
      "",
      "Primary and repeat are determinism runs, not independent samples.",
      "",
      "Matching uses frozen normalization and governed acceptable values.",
      "",
      "No filter-removal counterfactual was performed.",
      "",
      "Rejection reasons explain why existing candidates were rejected but do not prove what a modified selector would produce.",
      "",
      "No treatment, production change, or successor configuration is recommended.",
      "",
      "Run `30772967991` contributed nothing.",
      "",
    ].join("\n"),
  );
}

const outputArgIndex = process.argv.indexOf("--output");
if (process.argv[1]?.endsWith("issue-149-post-freeze-evaluate-30775581351.ts")) {
  runEvaluation(outputArgIndex === -1 ? RESULT_ROOT : process.argv[outputArgIndex + 1]);
}
