import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

import { createLocalOcrEngine } from "../../src/pipeline/extractor/ocr-engine";
import { planPrimaryOcrPass, runOcrPass } from "../../src/pipeline/extractor/regions";
import type { OcrWord, RegionOcrResult } from "../../src/pipeline/extractor/extractor.types";
import { selectBrandObservationWithCompleteFilterDiagnostics } from "../../src/pipeline/extractor/field-selection";
import {
  brandPresentInTranscript,
  brandValueMatches,
} from "../../src/fixtures/eval/vision-reader-eval";

export interface HeldOutCase {
  caseId: string;
  stratum: "normal_print" | "stylized_script" | "layout_orientation" | "absent_brand_controls";
  imagePath: string;
  imageDimensions: { width: number; height: number };
  brandPresence: "present" | "absent";
  acceptablePresentations: string[];
  expectedOutcome: "MATCH" | "ABSTAIN_ABSENT";
}

export interface HeldOutManifest {
  schemaVersion: string;
  preRegisteredAt: string;
  totalCases: number;
  strataDistribution: Record<string, number>;
  resizePolicy: {
    maxEdgePx: number;
    minEdgePx: number;
    kernel: string;
    rationale: string;
  };
  cases: HeldOutCase[];
}

export interface CandidateLossDiagnosisCase {
  caseId: string;
  stratum: string;
  expectedBrand: string[];
  rawBrandPresent: boolean;
  candidateConstructed: boolean;
  candidateKept: boolean;
  candidateInTopThree: boolean;
  selectedBrandMatch: boolean;
  reliableBrandMatch: boolean;
  lossStage:
    | "RAW_OCR_MISS"
    | "CANDIDATE_FORMATION_LOSS"
    | "FILTER_REJECTION"
    | "RANKING_DISPLACEMENT"
    | "CONSERVATIVE_AUTHORITY_GATE"
    | "CORRECT_AND_RELIABLE";
  primaryPass: {
    rawTranscriptPreview: string;
    selectedCandidate: {
      value: string | null;
      score: number | null;
      state: string;
    };
    exactBrandCandidate?: {
      rawText: string;
      cleanedValue: string | null;
      kept: boolean;
      filterReason?: string;
      activeRejectionReasons?: string[];
      totalScore?: number;
      rank?: number;
    };
    competingCandidates: Array<{
      value: string | null;
      score: number;
      rank: number;
    }>;
    diagnosisNotes: string;
  };
}

export interface CandidateLossDiagnosisReport {
  version: "1.0.0";
  generatedAt: string;
  manifestPath: string;
  scopeNotice: string;
  totalBrandPresentCases: number;
  stageSummary: {
    rawBrandPresent: number;
    candidateConstructed: number;
    candidateKept: number;
    candidateInTopThree: number;
    selectedBrandMatch: number;
    reliableBrandMatch: number;
  };
  lossTaxonomy: {
    rawOcrMiss: number;
    candidateFormationLoss: number;
    filterRejection: number;
    rankingDisplacement: number;
    conservativeAuthorityGate: number;
    correctAndReliable: number;
  };
  cases: CandidateLossDiagnosisCase[];
}

function wordsInOriginalOrder(result: RegionOcrResult): OcrWord[] {
  return [...result.words].sort((a, b) => {
    const ay = a.originalGeometry
      ? a.originalGeometry.y + a.originalGeometry.height / 2
      : a.bbox.y0;
    const by = b.originalGeometry
      ? b.originalGeometry.y + b.originalGeometry.height / 2
      : b.bbox.y0;
    if (Math.abs(ay - by) > 20) return ay - by;
    const ax = a.originalGeometry ? a.originalGeometry.x : a.bbox.x0;
    const bx = b.originalGeometry ? b.originalGeometry.x : b.bbox.x0;
    return ax - bx;
  });
}

export async function runCandidateLossDiagnosis(): Promise<CandidateLossDiagnosisReport> {
  const manifestPath = "artifacts/held-out-validation/held-out-manifest.json";
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as HeldOutManifest;
  const brandPresentCases = manifest.cases.filter((c) => c.brandPresence === "present");

  const engine = await createLocalOcrEngine();
  const cases: CandidateLossDiagnosisCase[] = [];

  try {
    for (const testCase of brandPresentCases) {
      const imageBytes = new Uint8Array(await readFile(testCase.imagePath));
      const meta = await sharp(imageBytes).metadata();
      const origWidth = meta.width ?? testCase.imageDimensions.width;
      const origHeight = meta.height ?? testCase.imageDimensions.height;

      const primaryPass = planPrimaryOcrPass(origWidth, origHeight);
      const ocrResult = await runOcrPass(imageBytes, primaryPass, engine);
      const words = wordsInOriginalOrder(ocrResult);
      const rawTranscript = words
        .map((w) => w.text)
        .join(" ")
        .trim();

      const selection = selectBrandObservationWithCompleteFilterDiagnostics([ocrResult]);
      const obs = selection.observation;
      const rawBrandPresent = brandPresentInTranscript(
        [rawTranscript],
        testCase.acceptablePresentations,
      );
      const selectedBrandMatch = brandValueMatches(obs.value, testCase.acceptablePresentations);
      const reliableBrandMatch =
        obs.state === "OBSERVED" && obs.ocrEvidenceScore >= 0.8 && selectedBrandMatch;

      const allCandidates = selection.brandDiagnostics?.candidates ?? [];
      const exactCandidate = allCandidates.find((c) =>
        brandValueMatches(c.cleanedValue, testCase.acceptablePresentations),
      );

      const candidateConstructed = exactCandidate !== undefined;
      const candidateKept = exactCandidate?.kept ?? false;

      const keptCandidates = allCandidates
        .filter((c) => c.kept)
        .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

      const candidateRank =
        exactCandidate && exactCandidate.kept
          ? keptCandidates.findIndex((c) => c === exactCandidate) + 1
          : null;

      const candidateInTopThree = candidateRank !== null && candidateRank <= 3;

      // Determine loss stage
      let lossStage: CandidateLossDiagnosisCase["lossStage"];
      let diagnosisNotes = "";

      if (!rawBrandPresent) {
        lossStage = "RAW_OCR_MISS";
        diagnosisNotes = "Tesseract raw OCR tokens did not contain the brand name as whole words.";
      } else if (!candidateConstructed) {
        lossStage = "CANDIDATE_FORMATION_LOSS";
        diagnosisNotes =
          "Brand words present in raw OCR tokens, but line grouping / window segmentation never formed an exact candidate span.";
      } else if (!candidateKept) {
        lossStage = "FILTER_REJECTION";
        diagnosisNotes = `Exact candidate formed ("${exactCandidate.cleanedValue}") but rejected by filter rule: ${exactCandidate.filterReason} (active: ${exactCandidate.activeRejectionReasons?.join(", ")}).`;
      } else if (!selectedBrandMatch) {
        lossStage = "RANKING_DISPLACEMENT";
        diagnosisNotes = `Exact candidate kept (rank #${candidateRank}, score ${exactCandidate.score?.total?.toFixed(2)}), but outranked by "${obs.value}".`;
      } else if (!reliableBrandMatch) {
        lossStage = "CONSERVATIVE_AUTHORITY_GATE";
        diagnosisNotes = `Exact candidate was selected ("${obs.value}"), but conservative authority gate held state as ${obs.state} (score: ${obs.ocrEvidenceScore}).`;
      } else {
        lossStage = "CORRECT_AND_RELIABLE";
        diagnosisNotes =
          "Exact candidate selected and accepted as authoritative OBSERVED evidence.";
      }

      const competing = keptCandidates.slice(0, 3).map((c, i) => ({
        value: c.cleanedValue,
        score: Math.round((c.score?.total ?? 0) * 100) / 100,
        rank: i + 1,
      }));

      cases.push({
        caseId: testCase.caseId,
        stratum: testCase.stratum,
        expectedBrand: [...testCase.acceptablePresentations],
        rawBrandPresent,
        candidateConstructed,
        candidateKept,
        candidateInTopThree,
        selectedBrandMatch,
        reliableBrandMatch,
        lossStage,
        primaryPass: {
          rawTranscriptPreview: rawTranscript.slice(0, 300),
          selectedCandidate: {
            value: obs.value,
            score: obs.ocrEvidenceScore,
            state: obs.state,
          },
          exactBrandCandidate: exactCandidate
            ? {
                rawText: exactCandidate.rawText,
                cleanedValue: exactCandidate.cleanedValue,
                kept: exactCandidate.kept,
                filterReason: exactCandidate.filterReason,
                activeRejectionReasons: exactCandidate.activeRejectionReasons,
                totalScore: exactCandidate.score?.total,
                rank: candidateRank ?? undefined,
              }
            : undefined,
          competingCandidates: competing,
          diagnosisNotes,
        },
      });
    }
  } finally {
    await engine.terminate();
  }

  const report: CandidateLossDiagnosisReport = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    manifestPath,
    scopeNotice:
      "Evaluates the primary-pass OCR selector (selectBrandObservation([primaryPass])), not the complete multi-pass production pipeline. Used for offline candidate loss tracing only.",
    totalBrandPresentCases: cases.length,
    stageSummary: {
      rawBrandPresent: cases.filter((c) => c.rawBrandPresent).length,
      candidateConstructed: cases.filter((c) => c.candidateConstructed).length,
      candidateKept: cases.filter((c) => c.candidateKept).length,
      candidateInTopThree: cases.filter((c) => c.candidateInTopThree).length,
      selectedBrandMatch: cases.filter((c) => c.selectedBrandMatch).length,
      reliableBrandMatch: cases.filter((c) => c.reliableBrandMatch).length,
    },
    lossTaxonomy: {
      rawOcrMiss: cases.filter((c) => c.lossStage === "RAW_OCR_MISS").length,
      candidateFormationLoss: cases.filter((c) => c.lossStage === "CANDIDATE_FORMATION_LOSS")
        .length,
      filterRejection: cases.filter((c) => c.lossStage === "FILTER_REJECTION").length,
      rankingDisplacement: cases.filter((c) => c.lossStage === "RANKING_DISPLACEMENT").length,
      conservativeAuthorityGate: cases.filter((c) => c.lossStage === "CONSERVATIVE_AUTHORITY_GATE")
        .length,
      correctAndReliable: cases.filter((c) => c.lossStage === "CORRECT_AND_RELIABLE").length,
    },
    cases,
  };

  return report;
}

async function main() {
  const report = await runCandidateLossDiagnosis();
  const outPath = "artifacts/held-out-validation/candidate-selection-diagnosis.json";
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`Saved candidate selection diagnosis report to ${outPath}`);
  console.log("Summary:", JSON.stringify(report.stageSummary, null, 2));
  console.log("Taxonomy:", JSON.stringify(report.lossTaxonomy, null, 2));
}

if (process.argv[1]?.endsWith("diagnose-candidate-loss.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
