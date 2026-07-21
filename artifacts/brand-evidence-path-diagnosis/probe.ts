/**
 * READ-ONLY brand evidence-path probe.
 *
 * Runs the REAL extractor over the governed fixed corpus on unmodified
 * production code, then classifies — AFTER the production candidate path has
 * run — the exact stage at which brand truth stops surviving.
 *
 * Truth is never used to steer extraction: `runCaseArtifacts` receives only the
 * image and its digest. Fixture ids, filenames, and expected answers are read
 * only in the classification block below.
 *
 * Production code is imported, never modified.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runCaseArtifacts } from "@/fixtures/eval/eval-harness";
import { loadEvalManifest } from "@/fixtures/eval/eval-loader";
import { brandExactMatch, brandNormalizedMatch, normalizeKey } from "@/fixtures/eval/metrics";
import type { CaseReport } from "@/fixtures/eval/eval-report.types";

const OUT = process.argv[2];

/** Rank of the first acceptable brand among ranked outputs (1-based), or null. */
function truthRank(report: CaseReport): number | null {
  const ranked = [report.brand.value, ...report.brand.alternates.map((a) => a.value)];
  for (const [i, v] of ranked.entries()) {
    if (typeof v === "string" && brandNormalizedMatch(v, report.brand.acceptable)) return i + 1;
  }
  return null;
}

/** Does any KEPT candidate normalize to an acceptable brand? */
function truthAmongKeptCandidates(report: CaseReport): boolean {
  return report.diagnostics.brandCandidateDecisions.some(
    (c) => c.kept && brandNormalizedMatch(c.cleanedValue, report.brand.acceptable),
  );
}

/** A candidate was built for the truth but the filter dropped it — with reason. */
function filteredTruthReasons(report: CaseReport): string[] {
  const hits = report.diagnostics.brandCandidateDecisions.filter(
    (c) =>
      !c.kept &&
      (brandNormalizedMatch(c.cleanedValue, report.brand.acceptable) ||
        normalizedIncludesLocal(c.rawText, report.brand.acceptable)),
  );
  return [...new Set(hits.map((c) => c.filterReason))];
}

function normalizedIncludesLocal(text: string, acceptable: string[]): boolean {
  const hay = normalizeKey(text);
  return acceptable.some((a) => {
    const n = normalizeKey(a);
    return n.length > 0 && hay.includes(n);
  });
}

/**
 * The first stage at which truth ceased to survive. Ordered: a later stage is
 * only reported when every earlier stage passed.
 */
function classify(report: CaseReport): { failureClass: string; notes: string[] } {
  const notes: string[] = [];
  const b = report.brand;
  const d = report.diagnostics;

  if (!b.present) {
    return b.value !== null
      ? { failureClass: "WRONG_ACCEPTED_CANDIDATE", notes: ["absent-brand false positive"] }
      : { failureClass: "CORRECT", notes: [] };
  }

  const rank = truthRank(report);
  const matched = b.exactMatch || b.normalizedMatch;

  if (matched) {
    return b.state === "OBSERVED"
      ? { failureClass: "CORRECT", notes: [] }
      : {
          failureClass: "CORRECT_TOP_CANDIDATE_AUTHORITY_ABSTENTION",
          notes: [`selected value is correct but state is ${b.state}`],
        };
  }

  // Truth is not the selected value. Find the earliest stage that lost it.
  if (!d.brandOcrContainsAcceptable) {
    return { failureClass: "OCR_RECOGNITION_MISS", notes: ["truth absent from raw OCR text"] };
  }
  if (!d.brandLineContainsAcceptable) {
    notes.push("truth in raw OCR words but not on any reconstructed line");
    return { failureClass: "RECONSTRUCTION_MISS", notes };
  }
  if (!truthAmongKeptCandidates(report)) {
    const reasons = filteredTruthReasons(report);
    notes.push(
      reasons.length > 0
        ? `truth reached a line but no kept candidate; filter reasons: ${reasons.join(", ")}`
        : "truth reached a line but never assembled into a kept candidate",
    );
    return { failureClass: "CANDIDATE_GENERATION_MISS", notes };
  }
  if (rank === null) {
    notes.push("truth is a kept candidate but appears in neither the selection nor the alternates");
    return { failureClass: "RANKING_MISS", notes };
  }
  notes.push(`truth is a kept candidate at rank ${rank}; a different candidate was selected`);
  return {
    failureClass: b.state === "OBSERVED" ? "WRONG_ACCEPTED_CANDIDATE" : "WRONG_SELECTED_CANDIDATE",
    notes,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = loadEvalManifest();
  const cases: any[] = [];

  for (const [i, evalCase] of manifest.cases.entries()) {
    const { report } = await runCaseArtifacts(evalCase);
    const b = report.brand;
    const d = report.diagnostics;
    const rank = truthRank(report);
    const { failureClass, notes } = classify(report);

    // Top candidates as ranked by production, with their score components.
    const rankedCandidates = d.brandCandidateDecisions
      .filter((c) => c.kept && c.ranking)
      .sort((x, y) => (y.ranking!.rankingScore ?? 0) - (x.ranking!.rankingScore ?? 0))
      .slice(0, 6)
      .map((c) => ({
        cleanedValue: c.cleanedValue,
        rawText: c.rawText,
        assembly: c.assembly,
        decision: c.decision ?? null,
        prominence: c.prominence,
        ocrEvidenceScore: Number(c.ocrEvidenceScore.toFixed(4)),
        rankingScore: c.ranking?.rankingScore ?? null,
        orderingMode: c.ranking?.orderingMode ?? null,
        positiveSignal: c.score?.positiveSignal ?? null,
        lowInformationPenalty: c.score?.lowInformationPenalty ?? null,
        residualPenalty: c.score?.residualPenalty ?? null,
        isTruth: brandNormalizedMatch(c.cleanedValue, b.acceptable),
      }));

    // Authority-gate attribution, re-derived from the full candidate list (not
    // the truncated ranked sample) using the same conditions buildBrandObservation
    // applies. LOW_CONFIDENCE_THRESHOLD is 0.6; BRAND_PROMINENCE_RATIO is 0.8.
    const all = d.brandCandidateDecisions;
    const selected = all.find((c) => c.decision === "selected") ?? null;
    const hasProminenceRival = all.some((c) => c.decision === "ambiguous-rival");
    const selectedPositive = selected?.score?.positiveSignal === 1;
    const selectedEvidence = selected?.ocrEvidenceScore ?? 0;
    const weakContestedLead = selectedEvidence < 0.6 && b.alternates.length > 0;
    const gateReasons: string[] = [];
    if (b.state !== "NOT_OBSERVED") {
      if (hasProminenceRival) gateReasons.push("competing-prominence-rival");
      if (weakContestedLead) gateReasons.push("weak-contested-lead");
      if (!selectedPositive) gateReasons.push("no-positive-brand-signal");
      if (selectedPositive && selectedEvidence < 0.6) gateReasons.push("below-confidence-floor");
    }

    cases.push({
      caseId: report.caseId,
      strata: report.strata,
      truth: { present: b.present, acceptable: b.acceptable, knownAmbiguous: b.knownAmbiguous },
      // Stage survival
      truthInRawOcr: d.brandOcrContainsAcceptable,
      truthOnReconstructedLine: d.brandLineContainsAcceptable,
      truthReachedCandidate: d.brandCandidateContainsAcceptable,
      truthAmongKeptCandidates: truthAmongKeptCandidates(report),
      truthFilterReasons: filteredTruthReasons(report),
      truthRank: rank,
      truthInTop1: rank === 1,
      truthInTop3: rank !== null && rank <= 3,
      truthOnlyInRecoveryPass:
        d.brandRecoveryOcrContainsAcceptable && !d.brandPrimaryOcrContainsAcceptable,
      // Selection
      selectedValue: b.value,
      selectedExactMatch: b.exactMatch,
      selectedNormalizedMatch: b.normalizedMatch,
      selectedIsWrong: b.present && b.value !== null && !b.exactMatch && !b.normalizedMatch,
      // Authority — measured separately from selection correctness
      state: b.state,
      confidence: Number(b.confidence.toFixed(4)),
      ocrEvidenceScore: Number(b.ocrEvidenceScore.toFixed(4)),
      abstentionReason: d.brandAbstentionReason ?? null,
      authorityGate: {
        selectedHasPositiveBrandSignal: selectedPositive,
        selectedOcrEvidenceScore: Number(selectedEvidence.toFixed(4)),
        hasProminenceRival,
        weakContestedLead,
        reasons: gateReasons,
      },
      alternateCount: b.alternates.length,
      wrongAndObserved: b.present && b.state === "OBSERVED" && !b.exactMatch && !b.normalizedMatch,
      correctButNotObserved:
        b.present && (b.exactMatch || b.normalizedMatch) && b.state !== "OBSERVED",
      evaluatorFailureClass: b.failureClass,
      failureClass,
      notes,
      lineTexts: d.brandLineTexts.slice(0, 12),
      rankedCandidates,
    });

    if ((i + 1) % 25 === 0 || i + 1 === manifest.cases.length)
      process.stdout.write(`  ${i + 1}/${manifest.cases.length}\n`);
  }

  writeFileSync(path.join(OUT, "cases.json"), JSON.stringify(cases, null, 2) + "\n");
  console.log(`wrote ${cases.length} cases`);
}

void main();
