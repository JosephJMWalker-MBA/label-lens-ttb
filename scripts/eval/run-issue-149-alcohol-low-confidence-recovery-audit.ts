import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadCaseImage, loadEvalManifest } from "@/fixtures/eval/eval-loader";
import { alcoholParsedAccurate, parseObservedPercent } from "@/fixtures/eval/metrics";
import { selectAlcoholObservation } from "@/pipeline/extractor/field-selection";
import { createLocalOcrEngine } from "@/pipeline/extractor/ocr-engine";
import {
  planPrimaryOcrPass,
  planRecoveryOcrPasses,
  runOcrPass,
} from "@/pipeline/extractor/regions";
import { verifyAndDecode } from "@/pipeline/extractor/image-integrity";
import type { RegionOcrResult } from "@/pipeline/extractor/extractor.types";

// Evaluation-only. Does not import, call, or modify:
//   - src/pipeline/extractor/extractor.ts (production trigger + reselection wiring)
//   - the final `alcohol =` selection branch
//   - any parser, threshold, Brand, or Government Warning logic
//   - PR #195
//
// This script forces the EXISTING recovery-pass planner to run for cases whose
// primary Alcohol state is LOW_CONFIDENCE (never eligible in production today),
// captures the raw evidence, and independently computes what an all-pass
// reselection *would* yield, purely for case-level classification. Production
// behavior is not exercised or changed by this script.

const FROZEN_CASE_IDS = [
  "patricia-green-cellars",
  "approved-wine-020",
  "approved-wine-023",
  "approved-wine-034",
  "approved-wine-079",
  "approved-wine-097",
] as const;

const OUTPUT_ROOT = path.join(
  process.cwd(),
  "artifacts/issue-149-alcohol-low-confidence-recovery-audit",
);

type RunKind = "primary" | "repeat";

interface CaseRunResult {
  caseId: string;
  expectedSha256: string;
  observedSha256: string;
  primaryValue: string | null;
  primaryState: string;
  primaryConfidence: number;
  primaryOcrEvidenceScore: number;
  truthAcceptablePercents: number[];
  truthAcceptableStatements: string[];
  primaryCorrect: boolean;
  primaryRawTranscript: string[];
  recoveryPasses: Array<{
    passId: string;
    passKind: string;
    templateReasons: string[];
    rawWords: string[];
    rawTranscript: string;
  }>;
  bestRecoveryValue: string | null;
  bestRecoveryState: string;
  bestRecoveryCorrect: boolean;
  allPassSelectionValue: string | null;
  allPassSelectionState: string;
  allPassSelectionCorrect: boolean;
  classification:
    | "recovery-truth-present-and-better"
    | "recovery-truth-present-not-better"
    | "recovery-output-wrong"
    | "ocr-miss-no-useful-text"
    | "nondeterministic";
}

function gitSha(): string {
  return execSync("git rev-parse HEAD").toString().trim();
}

async function runOnce(runKind: RunKind): Promise<CaseRunResult[]> {
  const manifest = loadEvalManifest();
  const byId = new Map(manifest.cases.map((c) => [c.caseId, c]));

  const missing = FROZEN_CASE_IDS.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`frozen case set references unknown caseIds: ${missing.join(", ")}`);
  }

  const engine = await createLocalOcrEngine();
  const results: CaseRunResult[] = [];

  for (const caseId of FROZEN_CASE_IDS) {
    const evalCase = byId.get(caseId)!;
    const { bytes, sha256 } = loadCaseImage(evalCase);

    const decoded = await verifyAndDecode(bytes, evalCase.expectedSha256);
    if (!decoded.ok) {
      throw new Error(`image decode failed for ${caseId}: ${decoded.error.message}`);
    }

    // --- Primary pass: identical to production. No behavior change. ---
    const primaryPass = await runOcrPass(
      bytes,
      planPrimaryOcrPass(decoded.value.width, decoded.value.height),
      engine,
    );
    const primarySelection = selectAlcoholObservation([primaryPass]);
    const primaryValue = primarySelection.observation.value;
    const primaryState = primarySelection.observation.state;
    const primaryConfidence = primarySelection.observation.confidence;
    const primaryOcrEvidenceScore = primarySelection.observation.ocrEvidenceScore;

    if (primaryState !== "LOW_CONFIDENCE") {
      throw new Error(
        `frozen case ${caseId} no longer reproduces LOW_CONFIDENCE primary state ` +
          `(got ${primaryState}); baseline has drifted, halt and re-audit before proceeding`,
      );
    }

    const truth = evalCase.alcohol;
    const acceptablePercents = truth.present ? truth.acceptablePercents : [];
    const acceptableStatements = truth.present ? truth.acceptableText : [];
    const primaryCorrect = alcoholParsedAccurate(primaryValue, acceptablePercents);

    // --- Force the EXISTING recovery-pass planner. This is the only place ---
    // --- production's trigger condition is bypassed, and only inside this ---
    // --- standalone evaluation harness. No production file is edited. ---
    const recoveryPasses = planRecoveryOcrPasses({
      primary: primaryPass,
      needsBrandRecovery: false,
      needsAlcoholRecovery: true,
    });

    const recoveryResults: RegionOcrResult[] = [];
    for (const pass of recoveryPasses) {
      recoveryResults.push(await runOcrPass(bytes, pass, engine));
    }

    const recoveryPassRecords = recoveryResults.map((result) => ({
      passId: result.passId,
      passKind: result.passKind,
      templateReasons: result.triggerReasons,
      rawWords: result.words.map((w) => w.text),
      rawTranscript: result.words.map((w) => w.text).join(" "),
    }));

    // --- Evaluation-only: what would all-pass reselection yield? This value ---
    // --- is NEVER written back into production selection; it exists only to ---
    // --- classify whether recovery evidence is closer to truth than primary. ---
    const allPassSelection = selectAlcoholObservation([primaryPass, ...recoveryResults]);
    const allPassValue = allPassSelection.observation.value;
    const allPassState = allPassSelection.observation.state;
    const allPassCorrect = alcoholParsedAccurate(allPassValue, acceptablePercents);

    // Best individual recovery-pass-only selection (isolates recovery evidence
    // from the primary candidate, so we can tell recovery-only quality apart
    // from "primary still wins the tie-break").
    const recoveryOnlySelection =
      recoveryResults.length > 0 ? selectAlcoholObservation(recoveryResults) : null;
    const bestRecoveryValue = recoveryOnlySelection?.observation.value ?? null;
    const bestRecoveryState = recoveryOnlySelection?.observation.state ?? "NOT_OBSERVED";
    const bestRecoveryCorrect = alcoholParsedAccurate(bestRecoveryValue, acceptablePercents);

    let classification: CaseRunResult["classification"];
    const anyRecoveryText = recoveryResults.some((r) => r.words.length > 0);
    if (!anyRecoveryText) {
      classification = "ocr-miss-no-useful-text";
    } else if (allPassCorrect && !primaryCorrect) {
      classification = "recovery-truth-present-and-better";
    } else if (bestRecoveryCorrect || allPassCorrect) {
      classification = "recovery-truth-present-not-better";
    } else {
      classification = "recovery-output-wrong";
    }

    results.push({
      caseId,
      expectedSha256: evalCase.expectedSha256,
      observedSha256: sha256,
      primaryValue,
      primaryState,
      primaryConfidence,
      primaryOcrEvidenceScore,
      truthAcceptablePercents: acceptablePercents,
      truthAcceptableStatements: acceptableStatements,
      primaryCorrect,
      primaryRawTranscript: primaryPass.words.map((w) => w.text),
      recoveryPasses: recoveryPassRecords,
      bestRecoveryValue,
      bestRecoveryState,
      bestRecoveryCorrect,
      allPassSelectionValue: allPassValue,
      allPassSelectionState: allPassState,
      allPassSelectionCorrect: allPassCorrect,
      classification,
    });
  }

  return results;
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  const primary = await runOnce("primary");
  const repeat = await runOnce("repeat");

  const determinism = FROZEN_CASE_IDS.map((caseId) => {
    const p = primary.find((c) => c.caseId === caseId)!;
    const r = repeat.find((c) => c.caseId === caseId)!;
    const pass =
      p.primaryValue === r.primaryValue &&
      p.primaryState === r.primaryState &&
      JSON.stringify(p.recoveryPasses.map((x) => x.rawTranscript)) ===
        JSON.stringify(r.recoveryPasses.map((x) => x.rawTranscript)) &&
      p.allPassSelectionValue === r.allPassSelectionValue &&
      p.allPassSelectionState === r.allPassSelectionState;
    return { caseId, pass };
  });

  const finalResults = primary.map((p) => {
    const det = determinism.find((d) => d.caseId === p.caseId)!;
    return {
      ...p,
      classification: det.pass ? p.classification : ("nondeterministic" as const),
      determinismPass: det.pass,
    };
  });

  writeFileSync(path.join(OUTPUT_ROOT, "primary-run.json"), JSON.stringify(primary, null, 2));
  writeFileSync(path.join(OUTPUT_ROOT, "repeat-run.json"), JSON.stringify(repeat, null, 2));
  writeFileSync(path.join(OUTPUT_ROOT, "git-sha.txt"), `${gitSha()}\n`);

  const anyBetter = finalResults.some(
    (r) => r.classification === "recovery-truth-present-and-better",
  );
  const decision = anyBetter ? "PROCEED_TO_STAGE_2" : "STOP";

  writeFileSync(
    path.join(OUTPUT_ROOT, "decision.json"),
    JSON.stringify(
      {
        experimentId: "issue-149-alcohol-low-confidence-recovery-audit",
        frozenCaseIds: FROZEN_CASE_IDS,
        decision,
        rule:
          "PROCEED_TO_STAGE_2 if at least one of the six cases classifies as " +
          "recovery-truth-present-and-better with determinismPass=true; otherwise STOP. " +
          "This is a case-level diagnostic on n=6 and supports no population-level claim.",
        cases: finalResults.map((r) => ({
          caseId: r.caseId,
          classification: r.classification,
          determinismPass: r.determinismPass,
        })),
      },
      null,
      2,
    ),
  );

  const header =
    "case_id | primary_value | primary_state | primary_correct | best_recovery_value | recovery_closer_to_truth | determinism_pass | classification";
  const rows = finalResults.map((r) =>
    [
      r.caseId,
      r.primaryValue ?? "null",
      r.primaryState,
      r.primaryCorrect,
      r.bestRecoveryValue ?? "null",
      r.classification === "recovery-truth-present-and-better",
      r.determinismPass,
      r.classification,
    ].join(" | "),
  );
  writeFileSync(
    path.join(OUTPUT_ROOT, "results-table.md"),
    [
      "# Alcohol LOW_CONFIDENCE recovery evidence audit — results",
      "",
      header,
      ...rows,
      "",
      `Decision: ${decision}`,
    ].join("\n"),
  );

  console.log(`Decision: ${decision}`);
  console.table(
    finalResults.map((r) => ({
      caseId: r.caseId,
      primaryValue: r.primaryValue,
      primaryCorrect: r.primaryCorrect,
      bestRecoveryValue: r.bestRecoveryValue,
      classification: r.classification,
      determinismPass: r.determinismPass,
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
