/**
 * Forensic corpus run for the alcohol false-certainty diagnosis.
 *
 * Runs the REAL extractor over the fixed manifest on current production code and
 * writes (a) a baseline summary using the repository's own metric definitions and
 * (b) full per-case forensic detail for every case whose accepted alcohol value is
 * wrong or unsupported. Writes only into this artifact directory; never touches
 * docs/extraction-full-corpus or any committed baseline.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runCaseArtifacts } from "@/fixtures/eval/eval-harness";
import { loadEvalManifest } from "@/fixtures/eval/eval-loader";
import type { CaseReport } from "@/fixtures/eval/eval-report.types";

const OUT = process.argv[2];

function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = loadEvalManifest();
  const cases: CaseReport[] = [];
  for (const [i, evalCase] of manifest.cases.entries()) {
    const a = await runCaseArtifacts(evalCase, { semanticScene: true });
    cases.push(a.report);
    if ((i + 1) % 25 === 0 || i + 1 === manifest.cases.length)
      process.stdout.write(`  ${i + 1}/${manifest.cases.length}\n`);
  }

  const present = cases.filter((c) => c.alcohol.present === true);
  const absent = cases.filter((c) => c.alcohol.present === false);
  const lat = cases.map((c) => c.latencyMs ?? 0);
  const states: Record<string, number> = {};
  const classes: Record<string, number> = {};
  for (const c of cases) {
    states[c.alcohol.state ?? "null"] = (states[c.alcohol.state ?? "null"] ?? 0) + 1;
    classes[c.alcohol.failureClass ?? "null"] =
      (classes[c.alcohol.failureClass ?? "null"] ?? 0) + 1;
  }

  // The repository's own definition: alcohol "false-certainty" is assigned ONLY
  // when the label has no alcohol statement and a value was still emitted.
  const repoFalseCertainty = cases.filter((c) => c.alcohol.failureClass === "false-certainty");
  // A value was accepted but disagrees with truth on a label that DOES carry a
  // statement. The evaluator calls this parser-failure, not false certainty.
  const wrongAcceptedValue = present.filter((c) => c.alcohol.detected && !c.alcohol.parsedAccurate);

  const summary = {
    gitShaNote: "see git-sha.txt",
    caseCount: cases.length,
    presentAlcohol: present.length,
    absentAlcohol: absent.length,
    alcoholDetectionRecall: {
      numerator: present.filter((c) => c.alcohol.detected).length,
      denominator: present.length,
    },
    alcoholParsedValueAccuracy: {
      numerator: present.filter((c) => c.alcohol.parsedAccurate).length,
      denominator: present.length,
    },
    alcoholFalseCertainty_repoDefinition: {
      count: repoFalseCertainty.length,
      cases: repoFalseCertainty.map((c) => c.caseId),
      definition:
        "classifyAlcohol: !truth.present && alcoholDetected(observed). Counts ONLY emitted values on labels with no alcohol statement.",
    },
    wrongAcceptedValueOnPresentTruth: {
      count: wrongAcceptedValue.length,
      cases: wrongAcceptedValue.map((c) => c.caseId),
      note: "Evaluator classifies these as parser-failure, NOT false-certainty.",
    },
    absentAlcoholFalsePositives: absent.filter((c) => c.alcohol.detected).length,
    alcoholStateHistogram: states,
    alcoholFailureClassHistogram: classes,
    brand: {
      exactMatch: cases.filter((c) => c.brand.exactMatch).length,
      normalizedMatch: cases.filter((c) => c.brand.normalizedMatch).length,
      falseCertainty: cases.filter((c) => c.brand.failureClass === "false-certainty").length,
    },
    latencyMs: { median: Math.round(percentile(lat, 0.5)), p95: Math.round(percentile(lat, 0.95)) },
  };
  writeFileSync(path.join(OUT, "baseline-summary.json"), JSON.stringify(summary, null, 2) + "\n");

  // Full forensic detail for the union of both populations.
  const targets = [...new Set([...repoFalseCertainty, ...wrongAcceptedValue])];
  const forensic = targets.map((c) => ({
    caseId: c.caseId,
    strata: c.strata,
    truth: { present: c.alcohol.present, acceptablePercents: c.alcohol.acceptablePercents },
    observed: {
      state: c.alcohol.state,
      value: c.alcohol.value,
      confidence: c.alcohol.confidence,
      ocrEvidenceScore: c.alcohol.ocrEvidenceScore,
      ocrConfidence: c.alcohol.ocrConfidence,
      candidateProvenance: c.alcohol.candidateProvenance,
      ranking: c.alcohol.ranking,
      alternates: c.alcohol.alternates,
      parsedValue: c.alcohol.parsedValue,
      parsedAccurate: c.alcohol.parsedAccurate,
      failureClass: c.alcohol.failureClass,
    },
    recovery: {
      passes: (c.diagnostics.recoveryPasses ?? []).map((p) => ({
        passId: p.passId,
        passKind: p.passKind,
        triggerReasons: p.triggerReasons,
        newOcrTokens: p.newOcrTokens,
        acceptedCandidateFields: p.acceptedCandidateFields,
        changedSelectedFields: p.changedSelectedFields,
        correctSelectedFields: p.correctSelectedFields,
      })),
      primarySelections: c.diagnostics.primarySelections,
      finalSelectionPasses: c.diagnostics.finalSelectionPasses,
    },
    regions: (c.diagnostics.regions ?? []).map((r) => ({
      passId: r.passId,
      passKind: r.passKind,
      wordCount: r.wordCount,
    })),
    candidateDecisions: c.diagnostics.alcoholCandidateDecisions,
    flags: {
      abstentionReason: c.diagnostics.alcoholAbstentionReason,
      numberInOcr: c.diagnostics.alcoholNumberInOcr,
      percentInOcr: c.diagnostics.alcoholPercentInOcr,
      alcoholMarkerInOcr: c.diagnostics.alcoholAlcoholMarkerInOcr,
      volumeMarkerInOcr: c.diagnostics.alcoholVolumeMarkerInOcr,
      candidateAccepted: c.diagnostics.alcoholCandidateAccepted,
      filterRejectedCandidate: c.diagnostics.alcoholFilterRejectedCandidate,
      parserRejectedCandidate: c.diagnostics.alcoholParserRejectedCandidate,
    },
  }));
  writeFileSync(path.join(OUT, "forensic-cases.json"), JSON.stringify(forensic, null, 2) + "\n");

  // Slim all-case record so counterfactuals can be evaluated against every case.
  const slim = cases.map((c) => ({
    caseId: c.caseId,
    strata: c.strata,
    alcohol: {
      present: c.alcohol.present,
      acceptablePercents: c.alcohol.acceptablePercents,
      state: c.alcohol.state,
      value: c.alcohol.value,
      detected: c.alcohol.detected,
      parsedAccurate: c.alcohol.parsedAccurate,
      failureClass: c.alcohol.failureClass,
    },
    candidateDecisions: c.diagnostics.alcoholCandidateDecisions,
  }));
  writeFileSync(path.join(OUT, "all-cases-slim.json"), JSON.stringify(slim) + "\n");

  console.log(JSON.stringify(summary, null, 2));
}

await main();
