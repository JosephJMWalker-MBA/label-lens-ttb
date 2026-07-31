#!/usr/bin/env node
/**
 * Issue #149 — decomposition of the PR #217 CANDIDATE_GROUPING_MISS umbrella
 * into line reconstruction, candidate formation and filter rejection, plus a
 * counterfactual-evidence inventory for one-rule filter relaxations.
 *
 * READ-ONLY, ZERO-OCR, EVALUATION-ONLY. No recognizer runs, no production code
 * changes, no filter is relaxed or modified, and no treatment is implemented.
 *
 * The 44-case population is frozen by reading the merged PR #217 case IDs, not
 * by recomputing it from a looser predicate.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-candidate-construction-filter-decomposition";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);

const PR217 = "artifacts/issue-149-brand-current-baseline-failure-decomposition";
const PR217_ATTRIBUTION = `${PR217}/per-case-attribution.json`;
const DIAGNOSIS = "artifacts/brand-evidence-path-diagnosis/cases.json";
const BASE = "5cc8adb09042f017e76fb9361ce639a527413bf1";

const EXPECTED_FROZEN = 44;
const EXPECTED_TOTAL = 115;
/** lineTexts was committed capped at 12 by the original probe. */
const LINE_TEXTS_CAP = 12;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));
const writeJson = (p, v) => writeFileSync(path.join(ROOT, p), `${JSON.stringify(v, null, 2)}\n`);
const format = (files) =>
  execFileSync("npx", ["prettier", "--write", "--log-level", "warn", ...files], {
    stdio: "inherit",
  });

function halt(reason, detail) {
  console.error(JSON.stringify({ status: "HALTED", reason, detail }, null, 2));
  process.exit(1);
}

/** The governed Brand normalization, transcribed from src/fixtures/eval/metrics.ts. */
const normalizeKey = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
const normalizedIncludes = (text, acceptable) => {
  const hay = normalizeKey(text);
  return acceptable.some((a) => {
    const n = normalizeKey(a);
    return n.length > 0 && hay.includes(n);
  });
};

/**
 * Frozen stage-location precedence. Applied top-down, mutually exclusive.
 *
 * `truthReachedCandidate` in the committed evidence is computed over KEPT
 * candidates only, so it is NOT a formation signal and is not used as one. The
 * only committed signal that a truth-bearing candidate OBJECT was formed is a
 * non-empty truthFilterReasons, which is derived from rejected candidate
 * decisions that carried the truth.
 */
function classifyStage(c, lineEvidence) {
  if (lineEvidence.contradiction) return "EVIDENCE_CONTRADICTION";
  if (!c.truthOnReconstructedLine) return "LINE_RECONSTRUCTION_LOSS";
  if ((c.truthFilterReasons ?? []).length > 0) return "FILTER_REJECTION";
  return "CANDIDATE_FORMATION_LOSS";
}

function main() {
  mkdirSync(ROOT, { recursive: true });

  const pr217 = readJson(PR217_ATTRIBUTION);
  const diagnosis = readJson(DIAGNOSIS);
  const byId = new Map(diagnosis.map((c) => [c.caseId, c]));

  const frozenIds = pr217.cases
    .filter((c) => c.classification === "CANDIDATE_GROUPING_MISS")
    .map((c) => c.caseId);
  if (frozenIds.length !== EXPECTED_FROZEN) {
    halt("FROZEN_POPULATION_DISCREPANCY", {
      expected: EXPECTED_FROZEN,
      observed: frozenIds.length,
    });
  }
  if (pr217.cases.length !== EXPECTED_TOTAL) {
    halt("TOTAL_POPULATION_DISCREPANCY", {
      expected: EXPECTED_TOTAL,
      observed: pr217.cases.length,
    });
  }
  for (const id of frozenIds) if (!byId.has(id)) halt("CASE_NOT_IN_EVIDENCE", id);

  const pr217ById = new Map(pr217.cases.map((c) => [c.caseId, c]));

  /* -------- per-case stage attribution -------- */
  const attributed = frozenIds.map((id) => {
    const c = byId.get(id);
    const p = pr217ById.get(id);
    const acceptable = c.truth.acceptable ?? [];
    const lines = c.lineTexts ?? [];

    // Independent re-derivation from the retained lines. Asymmetric on purpose:
    // finding the truth CONFIRMS the flag; not finding it cannot refute the flag,
    // because the committed line list is capped.
    const foundInRetainedLines = lines.some((l) => normalizedIncludes(l, acceptable));
    const retainedLinesPossiblyTruncated = lines.length >= LINE_TEXTS_CAP;
    const lineEvidence = {
      committedLineCount: lines.length,
      retainedLinesPossiblyTruncated,
      truthFoundInRetainedLines: foundInRetainedLines,
      flagTruthOnReconstructedLine: c.truthOnReconstructedLine,
      independentlyConfirmed: c.truthOnReconstructedLine && foundInRetainedLines,
      // A contradiction requires the retained evidence to be COMPLETE and to
      // disagree with the flag. When the list may be truncated, disagreement is
      // unverifiable, not contradictory.
      contradiction:
        c.truthOnReconstructedLine && !foundInRetainedLines && !retainedLinesPossiblyTruncated,
      unverifiable:
        c.truthOnReconstructedLine && !foundInRetainedLines && retainedLinesPossiblyTruncated,
    };

    const stage = classifyStage(c, lineEvidence);
    const reasons = [...(c.truthFilterReasons ?? [])].sort();

    return {
      caseId: id,
      imageSha256: p?.imageSha256 ?? null,
      acceptableGovernedTruthValues: acceptable,
      pr217Classification: p?.classification ?? null,
      truthInRawOcr: c.truthInRawOcr,
      truthOnReconstructedLine: c.truthOnReconstructedLine,
      supportingReconstructedLineTexts: lines,
      truthReachedCandidate: c.truthReachedCandidate,
      truthReachedCandidateNote:
        "Committed as brandCandidateContainsAcceptable, which the harness computes over KEPT candidates only. It is therefore a synonym for truthAmongKeptCandidates and is NOT evidence of candidate-object formation. It is reported because the brief asks for it, and it is not used to classify.",
      truthAmongKeptCandidates: c.truthAmongKeptCandidates,
      truthFilterReasons: reasons,
      truthFilterReasonCount: reasons.length,
      soleReason: reasons.length === 1 ? reasons[0] : null,
      stageClassification: stage,
      stageEvidence:
        stage === "LINE_RECONSTRUCTION_LOSS"
          ? "truthInRawOcr is true but truthOnReconstructedLine is false: the words were recognized but never assembled onto a line carrying the brand"
          : stage === "FILTER_REJECTION"
            ? `a truth-bearing candidate object was formed and rejected; the rejection reasons recorded against it are: ${reasons.join(", ")}`
            : stage === "CANDIDATE_FORMATION_LOSS"
              ? "truth is on a reconstructed line, yet no rejected candidate decision carries the truth, so no truth-bearing candidate object appears to have been formed at all"
              : "committed fields disagree in a way that prevents reliable attribution",
      lineEvidence,
      uncertainty: lineEvidence.unverifiable
        ? `truthOnReconstructedLine is true but the truth is not visible in the ${lines.length} retained lines, which are capped at ${LINE_TEXTS_CAP}. The flag cannot be independently confirmed or refuted for this case.`
        : stage === "CANDIDATE_FORMATION_LOSS"
          ? "The absence of a recorded rejection reason is consistent with no candidate object being formed, but the complete candidate decision list is not committed, so a formed-then-silently-dropped candidate cannot be excluded."
          : null,
      missingEvidence: [
        "the complete per-word raw OCR list (only reconstructed lines are committed)",
        "the complete brandCandidateDecisions array, including every non-truth candidate and its rejection reason",
      ],
    };
  });

  /* -------- identity grouping -------- */
  const identityOf = (a) =>
    (a.acceptableGovernedTruthValues ?? [])
      .map((v) => v.toLowerCase())
      .sort()
      .join(" | ");
  const identities = (list) => new Set(list.map(identityOf)).size;

  const stageCounts = {};
  const stageIdentities = {};
  for (const stage of [
    "EVIDENCE_CONTRADICTION",
    "LINE_RECONSTRUCTION_LOSS",
    "CANDIDATE_FORMATION_LOSS",
    "FILTER_REJECTION",
    "UNATTRIBUTABLE_WITH_COMMITTED_EVIDENCE",
  ]) {
    const members = attributed.filter((a) => a.stageClassification === stage);
    stageCounts[stage] = members.length;
    stageIdentities[stage] = identities(members);
  }

  /* -------- filter reasons -------- */
  const filterCases = attributed.filter((a) => a.stageClassification === "FILTER_REJECTION");
  const reasonFrequency = {};
  for (const a of filterCases) {
    for (const r of a.truthFilterReasons) {
      reasonFrequency[r] ??= { cases: [], soleBlockerCases: [], coBlockerCases: [] };
      reasonFrequency[r].cases.push(a.caseId);
      if (a.truthFilterReasonCount === 1) reasonFrequency[r].soleBlockerCases.push(a.caseId);
      else reasonFrequency[r].coBlockerCases.push(a.caseId);
    }
  }
  const reasonRows = Object.entries(reasonFrequency)
    .map(([reason, v]) => {
      const caseSet = attributed.filter((a) => v.cases.includes(a.caseId));
      const soleSet = attributed.filter((a) => v.soleBlockerCases.includes(a.caseId));
      return {
        filterReason: reason,
        historicalCases: v.cases.length,
        distinctBrandIdentities: identities(caseSet),
        soleBlockerCases: v.soleBlockerCases.length,
        soleBlockerDistinctBrandIdentities: identities(soleSet),
        coBlockerCases: v.coBlockerCases.length,
        casesStillBlockedIfOnlyThisReasonRemoved: v.coBlockerCases.length,
        casesStillBlockedList: v.coBlockerCases,
        isDirectSoleBlockerForCases: v.soleBlockerCases,
        oneRuleRecoverableCases: v.soleBlockerCases.length,
        oneRuleRecoverableNote:
          "Counted only where this reason is the sole recorded blocker. A reason appearing beside another blocker is not credited with a recoverable case, and no case is credited to more than one one-rule relaxation.",
      };
    })
    .sort(
      (a, b) => b.soleBlockerCases - a.soleBlockerCases || b.historicalCases - a.historicalCases,
    );

  const combinationCounts = {};
  for (const a of filterCases) {
    const key = a.truthFilterReasons.join(" + ");
    combinationCounts[key] ??= { cases: [], reasonCount: a.truthFilterReasonCount };
    combinationCounts[key].cases.push(a.caseId);
  }
  const combinationRows = Object.entries(combinationCounts)
    .map(([combination, v]) => ({
      combination,
      reasonCount: v.reasonCount,
      isSoleReason: v.reasonCount === 1,
      historicalCases: v.cases.length,
      distinctBrandIdentities: identities(attributed.filter((a) => v.cases.includes(a.caseId))),
      cases: v.cases,
    }))
    .sort((a, b) => b.historicalCases - a.historicalCases);

  const doubleCountCheck =
    filterCases.length === combinationRows.reduce((n, r) => n + r.historicalCases, 0);

  /* -------- stage conclusion -------- */
  const attributable = {
    FILTER_REJECTION: stageCounts.FILTER_REJECTION,
    CANDIDATE_FORMATION_LOSS: stageCounts.CANDIDATE_FORMATION_LOSS,
    LINE_RECONSTRUCTION_LOSS: stageCounts.LINE_RECONSTRUCTION_LOSS,
  };
  const byCases = Object.entries(attributable).sort((a, b) => b[1] - a[1]);
  const byIdentity = Object.entries(attributable)
    .map(([k]) => [k, stageIdentities[k]])
    .sort((a, b) => b[1] - a[1]);
  const DOMINANCE = 1.25;
  const unattributable =
    stageCounts.EVIDENCE_CONTRADICTION + stageCounts.UNATTRIBUTABLE_WITH_COMMITTED_EVIDENCE;
  const CONCLUSION_OF = {
    FILTER_REJECTION: "FILTER_REJECTION_DOMINATES",
    CANDIDATE_FORMATION_LOSS: "CANDIDATE_FORMATION_DOMINATES",
    LINE_RECONSTRUCTION_LOSS: "LINE_RECONSTRUCTION_DOMINATES",
  };
  const leadCases = byCases[0][1] >= (byCases[1][1] || 0) * DOMINANCE;
  const leadIdentity = byIdentity[0][1] >= (byIdentity[1][1] || 0) * DOMINANCE;
  const sameLeader = byCases[0][0] === byIdentity[0][0];
  const stageConclusion =
    unattributable > EXPECTED_FROZEN * 0.1
      ? "INSUFFICIENT_STAGE_EVIDENCE"
      : sameLeader && leadCases && leadIdentity
        ? CONCLUSION_OF[byCases[0][0]]
        : "MIXED_CONSTRUCTION_FAILURE";

  /* -------- counterfactual evidence inventory -------- */
  const inventory = {
    artifact: "counterfactual-evidence-inventory",
    experimentId: EXPERIMENT_ID,
    question:
      "Can the COST of removing exactly one filter rule be computed from committed evidence across all 115 cases?",
    requiredEvidence: [
      {
        requirement:
          "all candidate windows or candidate objects considered, including non-truth candidates",
        available: false,
        why: "The committed 115-case artifact stores rankedCandidates = brandCandidateDecisions.filter(kept && ranking).slice(0, 6). Rejected candidates are not committed at all, and kept candidates are capped at six.",
      },
      {
        requirement: "all rejection reasons for those candidates",
        available: false,
        why: "Only truthFilterReasons is committed, which is the reason set attached to REJECTED candidates that carried the truth. No rejection reason is committed for any non-truth candidate.",
      },
      {
        requirement: "values and provenance for all candidates",
        available: false,
        why: "Available for up to six kept candidates per case; absent for every rejected candidate.",
      },
      {
        requirement:
          "ranking inputs to determine whether newly admitted candidates could enter top 3, top 1 or selection",
        available: false,
        why: "Ranking inputs are committed only for candidates that were already kept and ranked. A newly admitted candidate has no committed prominence, score components or ordering mode, so its rank cannot be computed without re-running the pipeline.",
      },
      {
        requirement: "evidence for all 10 Brand-absent cases",
        available: false,
        why: "The same limitation applies: their rejected candidates and rejection reasons are not committed, so newly admitted candidates in absent cases cannot be enumerated.",
      },
      {
        requirement: "evidence for all currently correct and correctly withheld cases",
        available: false,
        why: "Their kept candidates are committed, but displacement requires knowing which currently-rejected candidates would newly compete, which is not committed.",
      },
    ],
    priorSimulationArtifactsChecked: {
      "artifacts/brand-evidence-path-diagnosis/e1a-too-many-words-simulation": {
        reusableForThisCostAnalysis: false,
        why: "Its filter-results.json records the rejection-reason distribution of sub-spans generated UNDER the E1a treatment, not the unmodified pipeline's full candidate decision list. It cannot answer what removing producer-line, non-brand-keyword, domain-like or sentence-fragment would admit.",
      },
      "artifacts/brand-evidence-path-diagnosis/e1b-prominence-gated-simulation": {
        reusableForThisCostAnalysis: false,
        why: "Same scope limitation, and Phase 2 was never run.",
      },
    },
    completeCostEvidenceAvailable: false,
    consequence:
      "The counterfactual cost analysis is not performed and counterfactual-results.json is deliberately absent. No relaxation is described as safe, and no benefit figure is presented without its cost.",
    ocrRerunRequestedToFillGap: false,
  };

  const costConclusion = "INSUFFICIENT_COST_EVIDENCE";

  /* -------- artifacts -------- */
  writeJson("population-freeze.json", {
    artifact: "population-freeze",
    experimentId: EXPERIMENT_ID,
    frozenBy: "reading the case IDs classified CANDIDATE_GROUPING_MISS in merged PR #217",
    recomputedFromLooserPredicate: false,
    sourceArtifact: PR217_ATTRIBUTION,
    sourceArtifactVerified: `${PR217}/artifact-manifest.sha256`,
    base: BASE,
    frozenCaseCount: frozenIds.length,
    frozenCaseIds: frozenIds,
    fullCorpusCount: EXPECTED_TOTAL,
    distinctBrandIdentitiesInFrozenSet: identities(attributed),
    casesExpanded: false,
    casesSubstituted: false,
    corpusRegenerated: false,
    aliasesAdded: false,
  });

  writeJson("per-case-stage-attribution.json", {
    artifact: "per-case-stage-attribution",
    experimentId: EXPERIMENT_ID,
    umbrellaLabelUsedAsResult: false,
    umbrellaLabelNote:
      "The PR #217 CANDIDATE_GROUPING_MISS label is carried per case for traceability and is never the substage result.",
    caseCount: attributed.length,
    cases: attributed,
  });

  writeJson("stage-summary.json", {
    artifact: "stage-summary",
    experimentId: EXPERIMENT_ID,
    frozenCases: EXPECTED_FROZEN,
    byHistoricalCases: stageCounts,
    byDistinctBrandIdentity: stageIdentities,
    percentOfFrozen: Object.fromEntries(
      Object.entries(stageCounts).map(([k, v]) => [
        k,
        Number(((v / EXPECTED_FROZEN) * 100).toFixed(1)),
      ]),
    ),
    independentLineVerification: {
      method:
        "Each case's retained reconstructed lines were re-tested against the governed normalization, transcribed from src/fixtures/eval/metrics.ts.",
      asymmetryNote:
        "Finding the truth confirms truthOnReconstructedLine. Not finding it cannot refute the flag, because the committed line list is capped at 12. Disagreement on a possibly-truncated list is recorded as unverifiable, not as a contradiction.",
      independentlyConfirmed: attributed.filter((a) => a.lineEvidence.independentlyConfirmed)
        .length,
      unverifiable: attributed.filter((a) => a.lineEvidence.unverifiable).length,
      contradictions: attributed.filter((a) => a.lineEvidence.contradiction).length,
    },
  });

  writeJson("filter-reason-frequency.json", {
    artifact: "filter-reason-frequency",
    experimentId: EXPERIMENT_ID,
    filterRejectionCases: filterCases.length,
    distinctFilterReasons: reasonRows.length,
    reasons: reasonRows,
    otherPipelineFilterReasonsNeverBlockingTruthHere: [
      "low-information-fragment",
      "no-letters-or-too-short",
      "location-or-appellation",
      "generic-product-language",
      "varietal-or-designation",
    ],
    otherReasonsNote:
      "These rules exist in the pipeline — they appear in the E1a simulation's reason distribution — but no case in this frozen set records them as a truth blocker. Their absence here is not evidence that they never block truth elsewhere.",
  });

  writeJson("filter-reason-combinations.json", {
    artifact: "filter-reason-combinations",
    experimentId: EXPERIMENT_ID,
    combinations: combinationRows,
    everyFilterRejectionCaseAppearsInExactlyOneCombination: doubleCountCheck,
    doubleCountingPrevented: true,
  });

  writeJson("sole-blocker-analysis.json", {
    artifact: "sole-blocker-analysis",
    experimentId: EXPERIMENT_ID,
    definition:
      "A rule is a DIRECT_SOLE_BLOCKER for a case only when it is the only recorded reason preventing that truth-bearing candidate from being kept.",
    coBlockerRule:
      "A reason occurring alongside another blocker is not credited with a recoverable case under a one-rule treatment.",
    noDoubleCounting:
      "No case is credited as recoverable under more than one independent one-rule relaxation; each FILTER_REJECTION case belongs to exactly one reason combination.",
    rules: reasonRows.map((r) => ({
      filterReason: r.filterReason,
      directSoleBlockerCases: r.soleBlockerCases,
      directSoleBlockerDistinctBrandIdentities: r.soleBlockerDistinctBrandIdentities,
      coBlockerCases: r.coBlockerCases,
      casesStillBlockedIfOnlyThisRuleRemoved: r.casesStillBlockedIfOnlyThisReasonRemoved,
      meetsThreeCaseThreeIdentityBar:
        r.soleBlockerCases >= 3 && r.soleBlockerDistinctBrandIdentities >= 3,
      costEvidenceAvailable: false,
      eligibleForBoundedCandidate: false,
      eligibilityNote:
        "Meeting the upside bar is necessary but not sufficient. Every rule fails eligibility here because the cost side cannot be computed from committed evidence.",
    })),
    inconsistentReasonCases: attributed
      .filter((a) => a.lineEvidence.contradiction)
      .map((a) => a.caseId),
    inconsistentReasonNote:
      "A recorded reason is treated as inconsistent only when the retained evidence is complete and disagrees with it. None met that bar.",
  });

  writeJson("counterfactual-evidence-inventory.json", inventory);

  writeJson("benefit-cost-summary.json", {
    artifact: "benefit-cost-summary",
    experimentId: EXPERIMENT_ID,
    costEvidenceComplete: false,
    counterfactualPerformed: false,
    benefitOnlyFiguresPublishedAsRecoverable: false,
    benefitSideUpperBound: reasonRows.map((r) => ({
      filterReason: r.filterReason,
      maximumHistoricalCasesRecoverableUnderAOneRuleRemoval: r.soleBlockerCases,
      maximumDistinctBrandIdentities: r.soleBlockerDistinctBrandIdentities,
      isAnUpperBoundNotAnEstimate:
        "It assumes every sole-blocked truth candidate, once kept, would also survive ranking, selection and the unchanged authority gate. None of that is computed here, so the real recovery is at most this and probably less.",
      costUnknown: true,
    })),
    costSideStatus:
      "NOT COMPUTED. Non-truth candidate exposure, displacement of currently-correct top-1 and selected values, Brand-absent case exposure and candidate-volume growth are all uncomputable from committed evidence.",
    priorArt: {
      note: "Two treatments targeting the largest sole blocker have already been simulated and killed. This sprint does not reinterpret them; it records that the largest upside category is not an open question.",
      e1a: "too-many-words sub-span generation — KILLED. 17 of 23 targeted cases recovered truth as a kept candidate, but 8 of 10 Brand-absent cases emitted a value, 2 wrong values reached OBSERVED, and 12 currently-correct selections broke.",
      e1b: "the same, gated by production's prominence-eligibility rule — KILLED in Phase 1, and recorded as closing the brand sub-span-generation family.",
    },
  });

  writeJson("independence-report.json", {
    artifact: "independence-report",
    experimentId: EXPERIMENT_ID,
    frozenCases: EXPECTED_FROZEN,
    distinctBrandIdentitiesInFrozenSet: identities(attributed),
    distinctSourceImages: new Set(attributed.map((a) => a.imageSha256)).size,
    proxyCaveat:
      "Distinct brand identity is the acceptable-truth-value set. It is a duplication control, not a measurement of visual-design diversity, and it is carried forward from PR #217 with the same caveat.",
    repeatedIdentities: Object.entries(
      attributed.reduce((acc, a) => {
        const k = identityOf(a);
        (acc[k] ??= []).push(a.caseId);
        return acc;
      }, {}),
    )
      .filter(([, v]) => v.length > 1)
      .map(([identity, cases]) => ({ brandIdentity: identity, caseCount: cases.length, cases })),
    countingRule: "A repeated brand identity counts once at identity level.",
  });

  writeJson("decision.json", {
    artifact: "decision",
    experimentId: EXPERIMENT_ID,
    issue: 149,
    readOnly: true,
    zeroOcr: true,
    evaluationOnly: true,
    stageConclusion,
    stageConclusionSeparateFromCostConclusion: true,
    stageConclusionEvidence: {
      byHistoricalCases: byCases.map(([stage, cases]) => ({ stage, cases })),
      byDistinctBrandIdentity: byIdentity.map(([stage, brandIdentities]) => ({
        stage,
        brandIdentities,
      })),
      dominanceRule: `The leader must lead on BOTH historical cases and distinct brand identities by at least ${DOMINANCE}x.`,
      leaderByCases: byCases[0][0],
      leaderByIdentity: byIdentity[0][0],
      sameLeaderOnBothUnits: sameLeader,
      marginSatisfiedByCases: leadCases,
      marginSatisfiedByIdentity: leadIdentity,
      contradictoryOrUnattributableCases: unattributable,
      insufficientStageEvidenceThreshold: "more than 10% of the frozen 44",
    },
    costConclusion,
    costConclusionEvidence: {
      completeCostEvidenceAvailable: false,
      missing: inventory.requiredEvidence.filter((r) => !r.available).map((r) => r.requirement),
      counterfactualResultsArtifactWritten: false,
      anyRelaxationDescribedAsSafe: false,
      ocrRerunRequested: false,
    },
    filterRelaxationImplemented: false,
    productionChanged: false,
    filtersModified: false,
    truthChanged: false,
    normalizationChanged: false,
    thresholdsChanged: false,
    corpusRegenerated: false,
    pr195Touched: false,
    pr214Reinterpreted: false,
    pr216Reinterpreted: false,
    pr217Reinterpreted: false,
    authorizes: [],
    doesNotAuthorize: [
      "any production code change",
      "relaxing or modifying any filter",
      "any candidate-construction, ranking, selection or authority change",
      "any threshold or state-semantics change",
      "implementing any treatment",
      "describing any relaxation as safe",
    ],
  });

  /* -------- summary + manifest -------- */
  const summary = {
    stageConclusion,
    costConclusion,
    frozenCases: EXPECTED_FROZEN,
    stageCounts,
    stageIdentities,
    soleBlockers: reasonRows.map((r) => ({
      reason: r.filterReason,
      sole: r.soleBlockerCases,
      soleIdentities: r.soleBlockerDistinctBrandIdentities,
      total: r.historicalCases,
      co: r.coBlockerCases,
    })),
    combinations: combinationRows.map((r) => ({
      combination: r.combination,
      cases: r.historicalCases,
    })),
  };
  writeJson("analysis-summary.json", {
    artifact: "analysis-summary",
    experimentId: EXPERIMENT_ID,
    ...summary,
  });

  const written = readdirSync(ROOT).filter((f) => f.endsWith(".json"));
  format(written.map((f) => path.join(ROOT, f)));

  const walk = (dir, base = dir) =>
    readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name), base)
          : [path.relative(base, path.join(dir, e.name))],
      );
  const files = walk(ROOT).filter(
    (f) => f !== "artifact-manifest.json" && f !== "artifact-manifest.sha256",
  );
  writeJson("artifact-manifest.json", {
    artifact: "artifact-manifest",
    experimentId: EXPERIMENT_ID,
    issue: 149,
    readOnly: true,
    zeroOcr: true,
    productionChanged: false,
    stageConclusion,
    costConclusion,
    counterfactualResultsPresent: false,
    counterfactualResultsAbsentReason: costConclusion,
    fileCount: files.length,
    files: files.map((f) => ({
      path: f,
      byteSize: statSync(path.join(ROOT, f)).size,
      sha256: sha256(readFileSync(path.join(ROOT, f))),
    })),
  });
  format([path.join(ROOT, "artifact-manifest.json")]);
  writeFileSync(
    path.join(ROOT, "artifact-manifest.sha256"),
    `${sha256(readFileSync(path.join(ROOT, "artifact-manifest.json")))}  artifact-manifest.json\n`,
  );

  console.log(JSON.stringify(summary, null, 2));
}

main();
