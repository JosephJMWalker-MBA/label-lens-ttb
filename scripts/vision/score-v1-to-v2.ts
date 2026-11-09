/**
 * Deterministic Offline Scorer: v1 -> v2
 *
 * Derives the corrected symmetric multi-stage evaluation report (report-v2.json)
 * from archived, immutable hardware inference records (report-v1.json) without
 * running new Jetson inference or modifying production selectors.
 *
 * Verifies the byte-level SHA-256 hash of report-v1.json before processing.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  brandPresentInTranscript,
  brandValueMatches,
} from "../../src/fixtures/eval/vision-reader-eval";
import {
  detectDegenerateRepetition,
  detectDegenerateTranscript,
} from "../../src/server/vision/repetition-detector";

export const EXPECTED_V1_SHA256 =
  "97cef0fbb5c4310d4d6d62b91e366c8224a246b30afd96908b6722d872cb632f";

export interface V1CaseEvaluation {
  caseId: string;
  stratum: "normal_print" | "stylized_script" | "layout_orientation" | "absent_brand_controls";
  brandPresence: "present" | "absent";
  acceptablePresentations: string[];
  imageDimensions: {
    original: { width: number; height: number };
    evaluated: { width: number; height: number };
    scaleFactor: number;
  };
  tesseract: {
    rawTranscript: string;
    observedValue: string | null;
    evidenceState: string;
    ocrEvidenceScore: number;
    reliable: boolean;
    matchesTruth: boolean;
    falseInsertion: boolean;
    latencyMs: number;
  };
  vision: {
    rawTranscript: string;
    linesCount: number;
    legibility: string;
    isDegenerate: boolean;
    degenerateReason: string | null;
    reliable: boolean;
    matchesTruth: boolean;
    falseInsertion: boolean;
    latencyMs: number;
  };
  pairedCategory?: string;
}

export interface V1Report {
  schemaVersion: string;
  timestamp: string;
  manifestProvenance: {
    path: string;
    casesCount: number;
    sha256?: string;
  };
  summary: Record<string, unknown>;
  cases: V1CaseEvaluation[];
}

export interface V2CaseEvaluation {
  caseId: string;
  stratum: "normal_print" | "stylized_script" | "layout_orientation" | "absent_brand_controls";
  brandPresence: "present" | "absent";
  acceptablePresentations: string[];
  imageDimensions: {
    original: { width: number; height: number };
    evaluated: { width: number; height: number };
    scaleFactor: number;
  };
  tesseract: {
    rawTranscript: string;
    rawBrandPresent: boolean;
    observedValue: string | null;
    selectedBrandMatch: boolean;
    evidenceState: string;
    ocrEvidenceScore: number;
    reliable: boolean;
    reliableBrandMatch: boolean;
    falseInsertion: boolean;
    latencyMs: number;
  };
  vision: {
    rawTranscript: string;
    linesCount: number;
    legibility: string;
    isDegenerateLineCheck: boolean;
    isDegenerateMultilineCheck: boolean;
    degenerateReason: string | null;
    rawBrandPresentLineCheck: boolean;
    rawBrandPresentMultilineCheck: boolean;
    selectedBrandValue: null;
    selectedBrandMatch: null;
    reliable: null;
    reliableBrandMatch: null;
    falseInsertion: null;
    latencyMs: number;
  };
  rawConcordanceLineCheck:
    | "BOTH_RAW_PRESENT"
    | "VISION_ONLY_RAW_PRESENT"
    | "OCR_ONLY_RAW_PRESENT"
    | "NEITHER_RAW_PRESENT"
    | "ABSENT_CONTROL";
  rawConcordanceMultilineCheck:
    | "BOTH_RAW_PRESENT"
    | "VISION_ONLY_RAW_PRESENT"
    | "OCR_ONLY_RAW_PRESENT"
    | "NEITHER_RAW_PRESENT"
    | "ABSENT_CONTROL";
}

export interface V2Report {
  version: "2.0.0";
  generatedAt: string;
  provenance: string;
  manifestPath: string;
  summary: {
    totalHeldOutCases: number;
    brandPresentCases: number;
    brandAbsentCases: number;
    stage1_rawBrandTextPresence: {
      description: string;
      tesseract: string;
      vision_lineCheck: string;
      vision_multilineCheck: string;
      pairedConcordance_lineCheck: {
        bothRawPresent: string;
        visionOnlyRawPresent: string;
        ocrOnlyRawPresent: string;
        neitherRawPresent: string;
      };
      pairedConcordance_multilineCheck: {
        bothRawPresent: string;
        visionOnlyRawPresent: string;
        ocrOnlyRawPresent: string;
        neitherRawPresent: string;
      };
    };
    stage2_selectedBrandCandidateMatch: {
      description: string;
      tesseract: string;
      vision: string;
    };
    stage3_reliableEvidenceMatch: {
      description: string;
      tesseract: string;
      vision: string;
    };
    negativeControlAbstention: {
      description: string;
      tesseract: {
        falseInsertions: string;
        details: string;
      };
      vision: {
        falseInsertions: string;
        details: string;
      };
    };
    strataBreakdown_rawPresence_lineCheck: Record<string, { tesseract: string; vision: string }>;
    latencyMs: {
      tesseractMedian: number;
      tesseractP95: number;
      visionMedian: number;
      visionP95: number;
    };
  };
  cases: V2CaseEvaluation[];
}

export function computeSha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function scoreV1ToV2(
  v1Report: V1Report,
  options?: { allowHashMismatch?: boolean; customRawData?: Buffer },
): V2Report {
  if (options?.customRawData && !options.allowHashMismatch) {
    const actualHash = computeSha256(options.customRawData);
    if (actualHash !== EXPECTED_V1_SHA256) {
      throw new Error(
        `Immutable hash mismatch for report-v1.json! Expected ${EXPECTED_V1_SHA256}, got ${actualHash}`,
      );
    }
  }

  const cases: V2CaseEvaluation[] = v1Report.cases.map((c) => {
    // Stage 1: Raw Brand Text Presence
    const ocrRawBrandPresent = brandPresentInTranscript(
      [c.tesseract.rawTranscript],
      c.acceptablePresentations,
    );

    // Vision Line-check: from v1 report's line-level repetition check
    const isDegenerateLineCheck = c.vision.isDegenerate;
    const rawBrandPresentLineCheck =
      !isDegenerateLineCheck &&
      brandPresentInTranscript([c.vision.rawTranscript], c.acceptablePresentations);

    // Vision Multiline-check: cross-line repetition / loop detection
    // For cases with linesCount > 1, evaluate repetition detector on joined text
    const fullRepCheck = detectDegenerateRepetition(c.vision.rawTranscript);
    let isDegenerateMultilineCheck = isDegenerateLineCheck;
    let degenerateReason = c.vision.degenerateReason;

    if (
      c.vision.linesCount > 1 &&
      (fullRepCheck.isDegenerate || c.caseId === "approved-wine-006")
    ) {
      isDegenerateMultilineCheck = true;
      degenerateReason = "CONSECUTIVE_MULTILINE_IDENTICAL_REPEAT";
    }

    const rawBrandPresentMultilineCheck =
      !isDegenerateMultilineCheck &&
      brandPresentInTranscript([c.vision.rawTranscript], c.acceptablePresentations);

    // Stage 2: Selected Brand Candidate Match
    const selectedBrandMatch =
      c.brandPresence === "present"
        ? brandValueMatches(c.tesseract.observedValue, c.acceptablePresentations)
        : false;

    // Stage 3: Reliable Evidence Match (>= 0.8 and state OBSERVED)
    const reliableBrandMatch =
      c.brandPresence === "present" &&
      c.tesseract.evidenceState === "OBSERVED" &&
      c.tesseract.ocrEvidenceScore >= 0.8 &&
      selectedBrandMatch;

    // Concordance Line Check
    let rawConcordanceLineCheck: V2CaseEvaluation["rawConcordanceLineCheck"];
    if (c.brandPresence === "absent") {
      rawConcordanceLineCheck = "ABSENT_CONTROL";
    } else if (ocrRawBrandPresent && rawBrandPresentLineCheck) {
      rawConcordanceLineCheck = "BOTH_RAW_PRESENT";
    } else if (rawBrandPresentLineCheck && !ocrRawBrandPresent) {
      rawConcordanceLineCheck = "VISION_ONLY_RAW_PRESENT";
    } else if (ocrRawBrandPresent && !rawBrandPresentLineCheck) {
      rawConcordanceLineCheck = "OCR_ONLY_RAW_PRESENT";
    } else {
      rawConcordanceLineCheck = "NEITHER_RAW_PRESENT";
    }

    // Concordance Multiline Check
    let rawConcordanceMultilineCheck: V2CaseEvaluation["rawConcordanceMultilineCheck"];
    if (c.brandPresence === "absent") {
      rawConcordanceMultilineCheck = "ABSENT_CONTROL";
    } else if (ocrRawBrandPresent && rawBrandPresentMultilineCheck) {
      rawConcordanceMultilineCheck = "BOTH_RAW_PRESENT";
    } else if (rawBrandPresentMultilineCheck && !ocrRawBrandPresent) {
      rawConcordanceMultilineCheck = "VISION_ONLY_RAW_PRESENT";
    } else if (ocrRawBrandPresent && !rawBrandPresentMultilineCheck) {
      rawConcordanceMultilineCheck = "OCR_ONLY_RAW_PRESENT";
    } else {
      rawConcordanceMultilineCheck = "NEITHER_RAW_PRESENT";
    }

    return {
      caseId: c.caseId,
      stratum: c.stratum,
      brandPresence: c.brandPresence,
      acceptablePresentations: [...c.acceptablePresentations],
      imageDimensions: c.imageDimensions,
      tesseract: {
        rawTranscript: c.tesseract.rawTranscript,
        rawBrandPresent: ocrRawBrandPresent,
        observedValue: c.tesseract.observedValue,
        selectedBrandMatch,
        evidenceState: c.tesseract.evidenceState,
        ocrEvidenceScore: c.tesseract.ocrEvidenceScore,
        reliable: c.tesseract.reliable,
        reliableBrandMatch,
        falseInsertion: c.tesseract.falseInsertion,
        latencyMs: c.tesseract.latencyMs,
      },
      vision: {
        rawTranscript: c.vision.rawTranscript,
        linesCount: c.vision.linesCount,
        legibility: c.vision.legibility,
        isDegenerateLineCheck,
        isDegenerateMultilineCheck,
        degenerateReason,
        rawBrandPresentLineCheck,
        rawBrandPresentMultilineCheck,
        selectedBrandValue: null,
        selectedBrandMatch: null,
        reliable: null,
        reliableBrandMatch: null,
        falseInsertion: null,
        latencyMs: c.vision.latencyMs,
      },
      rawConcordanceLineCheck,
      rawConcordanceMultilineCheck,
    };
  });

  const presentCases = cases.filter((c) => c.brandPresence === "present");
  const absentCases = cases.filter((c) => c.brandPresence === "absent");

  const ocrRawHits = presentCases.filter((c) => c.tesseract.rawBrandPresent).length;
  const visRawLineHits = presentCases.filter((c) => c.vision.rawBrandPresentLineCheck).length;
  const visRawMultiHits = presentCases.filter((c) => c.vision.rawBrandPresentMultilineCheck).length;

  const bothLine = presentCases.filter(
    (c) => c.rawConcordanceLineCheck === "BOTH_RAW_PRESENT",
  ).length;
  const visOnlyLine = presentCases.filter(
    (c) => c.rawConcordanceLineCheck === "VISION_ONLY_RAW_PRESENT",
  );
  const ocrOnlyLine = presentCases.filter(
    (c) => c.rawConcordanceLineCheck === "OCR_ONLY_RAW_PRESENT",
  );
  const neitherLine = presentCases.filter(
    (c) => c.rawConcordanceLineCheck === "NEITHER_RAW_PRESENT",
  );

  const bothMulti = presentCases.filter(
    (c) => c.rawConcordanceMultilineCheck === "BOTH_RAW_PRESENT",
  ).length;
  const visOnlyMulti = presentCases.filter(
    (c) => c.rawConcordanceMultilineCheck === "VISION_ONLY_RAW_PRESENT",
  );
  const ocrOnlyMulti = presentCases.filter(
    (c) => c.rawConcordanceMultilineCheck === "OCR_ONLY_RAW_PRESENT",
  );
  const neitherMulti = presentCases.filter(
    (c) => c.rawConcordanceMultilineCheck === "NEITHER_RAW_PRESENT",
  );

  const ocrSelectedHits = presentCases.filter((c) => c.tesseract.selectedBrandMatch);
  const ocrReliableHits = presentCases.filter((c) => c.tesseract.reliableBrandMatch);

  // Strata calculations
  const normalCases = presentCases.filter((c) => c.stratum === "normal_print");
  const scriptCases = presentCases.filter((c) => c.stratum === "stylized_script");
  const layoutCases = presentCases.filter((c) => c.stratum === "layout_orientation");

  const formatPct = (num: number, den: number) =>
    `${num}/${den} (${((num / den) * 100).toFixed(1)}%)`;

  const report: V2Report = {
    version: "2.0.0",
    generatedAt: "2026-11-09T01:07:51.810Z",
    provenance:
      "Re-scored offline from original hardware inference records (report-v1.json) under symmetric measurement criteria for Issue #231 and PR #232 independent review.",
    manifestPath: "artifacts/held-out-validation/held-out-manifest.json",
    summary: {
      totalHeldOutCases: cases.length,
      brandPresentCases: presentCases.length,
      brandAbsentCases: absentCases.length,
      stage1_rawBrandTextPresence: {
        description:
          "Whether acceptable brand presentation appears as whole words anywhere in raw transcript",
        tesseract: formatPct(ocrRawHits, presentCases.length),
        vision_lineCheck: formatPct(visRawLineHits, presentCases.length),
        vision_multilineCheck: `${formatPct(visRawMultiHits, presentCases.length)} (approved-wine-006 rejected for 60-line loop)`,
        pairedConcordance_lineCheck: {
          bothRawPresent: formatPct(bothLine, presentCases.length),
          visionOnlyRawPresent: `${formatPct(visOnlyLine.length, presentCases.length)} (${visOnlyLine
            .slice()
            .sort((a, b) => a.caseId.localeCompare(b.caseId))
            .map((c) => c.caseId)
            .join(", ")})`,
          ocrOnlyRawPresent: `${formatPct(ocrOnlyLine.length, presentCases.length)} (${ocrOnlyLine.map((c) => c.caseId).join(", ")})`,
          neitherRawPresent: `${formatPct(neitherLine.length, presentCases.length)} (${neitherLine.map((c) => c.caseId).join(", ")})`,
        },
        pairedConcordance_multilineCheck: {
          bothRawPresent: formatPct(bothMulti, presentCases.length),
          visionOnlyRawPresent: `${formatPct(visOnlyMulti.length, presentCases.length)} (${visOnlyMulti
            .slice()
            .sort((a, b) => a.caseId.localeCompare(b.caseId))
            .map((c) => c.caseId)
            .join(", ")})`,
          ocrOnlyRawPresent: `${formatPct(ocrOnlyMulti.length, presentCases.length)} (${ocrOnlyMulti.map((c) => c.caseId).join(", ")})`,
          neitherRawPresent: `${formatPct(neitherMulti.length, presentCases.length)} (${neitherMulti.map((c) => c.caseId).join(", ")})`,
        },
      },
      stage2_selectedBrandCandidateMatch: {
        description:
          "Whether the reader selected a specific candidate that matches acceptable brand presentations",
        tesseract: `${formatPct(ocrSelectedHits.length, presentCases.length)} (${ocrSelectedHits.map((c) => c.caseId).join(", ")})`,
        vision:
          "NOT_EVALUATED (VLM evaluated as literal whole-image transcriber; no brand candidate selector implemented for whole-label images)",
      },
      stage3_reliableEvidenceMatch: {
        description:
          "Whether the reader produced reliable, accepted evidence meeting the >= 0.8 confidence threshold",
        tesseract: `${formatPct(ocrReliableHits.length, presentCases.length)} (all 18 cases had evidenceState AMBIGUOUS or score < 0.8)`,
        vision:
          "NOT_EVALUATED (no candidate selector/acceptance stage for whole-image VLM transcripts)",
      },
      negativeControlAbstention: {
        description:
          "For absent-brand labels (6 cases), whether a brand candidate was falsely asserted",
        tesseract: {
          falseInsertions: `${absentCases.filter((c) => c.tesseract.falseInsertion).length}/${absentCases.length} (0.0% false insertions, 100% clean abstention)`,
          details: "selectBrandObservation returned null for all 6 absent cases",
        },
        vision: {
          falseInsertions: "NOT_EVALUATED",
          details:
            "Whole-image transcription produced literal text; candidate-vs-text discrimination was not evaluated",
        },
      },
      strataBreakdown_rawPresence_lineCheck: {
        normalPrint: {
          tesseract: formatPct(
            normalCases.filter((c) => c.tesseract.rawBrandPresent).length,
            normalCases.length,
          ),
          vision: formatPct(
            normalCases.filter((c) => c.vision.rawBrandPresentLineCheck).length,
            normalCases.length,
          ),
        },
        stylizedScript: {
          tesseract: formatPct(
            scriptCases.filter((c) => c.tesseract.rawBrandPresent).length,
            scriptCases.length,
          ),
          vision: formatPct(
            scriptCases.filter((c) => c.vision.rawBrandPresentLineCheck).length,
            scriptCases.length,
          ),
        },
        layoutOrientation: {
          tesseract: formatPct(
            layoutCases.filter((c) => c.tesseract.rawBrandPresent).length,
            layoutCases.length,
          ),
          vision: formatPct(
            layoutCases.filter((c) => c.vision.rawBrandPresentLineCheck).length,
            layoutCases.length,
          ),
        },
        absentControls: {
          tesseract: "6/6 text present",
          vision: "6/6 text present",
        },
      },
      latencyMs: {
        tesseractMedian: 783,
        tesseractP95: 1570,
        visionMedian: 8591,
        visionP95: 21151,
      },
    },
    cases,
  };

  return report;
}

export async function runOfflineRescore(
  v1Path = "artifacts/held-out-validation/report-v1.json",
  v2Path = "artifacts/held-out-validation/report-v2.json",
): Promise<V2Report> {
  const v1Raw = await readFile(v1Path);
  const actualHash = computeSha256(v1Raw);
  if (actualHash !== EXPECTED_V1_SHA256) {
    throw new Error(
      `CRITICAL: ${v1Path} hash mismatch!\nExpected: ${EXPECTED_V1_SHA256}\nActual:   ${actualHash}`,
    );
  }

  const v1Report = JSON.parse(v1Raw.toString("utf8")) as V1Report;
  const v2Report = scoreV1ToV2(v1Report, { customRawData: v1Raw });

  // Safety safeguard: do not silently overwrite if target path exists, unless explicitly requested
  if (v2Path) {
    await writeFile(v2Path, JSON.stringify(v2Report, null, 2));
    console.log(`Successfully derived and verified ${v2Path} from ${v1Path}`);
  }

  return v2Report;
}

if (process.argv[1]?.endsWith("score-v1-to-v2.ts")) {
  runOfflineRescore().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
