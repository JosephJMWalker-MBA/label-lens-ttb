#!/usr/bin/env node
/**
 * Issue #149 — decomposition of current Brand failures across OCR, candidate
 * construction, ranking/selection and authority.
 *
 * DIAGNOSTIC AND EVALUATION-ONLY. It runs no OCR, executes no recognizer,
 * changes no production code, and reads only committed artifacts.
 *
 * Every case is classified from the underlying stage booleans under this
 * sprint's own frozen precedence. The source artifact's own failure-class labels
 * are read only for cross-check and are never copied into a result.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-current-baseline-failure-decomposition";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);

/** Committed evidence. Read-only. */
const DIAGNOSIS = "artifacts/brand-evidence-path-diagnosis/cases.json";
const DIAGNOSIS_BASE = "a9fe943a7293230af88d857104f4e6e2aa74ae02";
const EVAL_MANIFEST = "src/fixtures/eval/eval-manifest.json";
const BASELINE_REPORT = "docs/extraction-baseline/report.json";
const CURRENT_BASE = "7c34ef2a5f94cd3736599fdfca39c38928094729";

const EXPECTED_CASES = 115;
const EXPECTED_BRAND_PRESENT = 105;
const EXPECTED_BRAND_ABSENT = 10;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));
const writeJson = (p, v) => writeFileSync(path.join(ROOT, p), `${JSON.stringify(v, null, 2)}\n`);
const pct = (n, d) => (d === 0 ? null : Number(((n / d) * 100).toFixed(1)));

function fail(reason, detail) {
  console.error(JSON.stringify({ status: "HALTED", reason, detail }, null, 2));
  process.exit(1);
}

/**
 * The frozen precedence. Order matters and is applied top-down; the first
 * matching clause wins and no case receives two classifications.
 */
function classify(c) {
  const truthPresent = Boolean(c.truth?.present);
  const observed = c.state === "OBSERVED";
  const selectedCorrect = Boolean(c.selectedNormalizedMatch);

  // 1. An incorrect candidate accepted as OBSERVED. Evaluated for brand-absent
  //    cases too: emitting any brand there is also a wrong acceptance.
  if (observed && !selectedCorrect) return "WRONG_ACCEPTED_CANDIDATE";
  if (!truthPresent) return null; // brand-absent, handled separately

  // 2. Selected matches truth and state is OBSERVED.
  if (selectedCorrect && observed) return "CORRECT_OBSERVED";

  // 3. Selected or top-ranked matches truth but the state is not OBSERVED.
  if ((selectedCorrect || c.truthInTop1) && !observed) return "CORRECT_CONSERVATIVE_STATE";

  // 4. A truth-bearing candidate exists but something else ranks or is selected
  //    above it.
  if (c.truthAmongKeptCandidates) return "RANKING_OR_SELECTION_MISS";

  // 5. Truth-bearing text is in raw OCR evidence but no candidate preserves it.
  if (c.truthInRawOcr) return "CANDIDATE_GROUPING_MISS";

  // 6. Truth is absent from all relevant raw OCR evidence.
  if (!c.truthInRawOcr) return "OCR_RECOGNITION_MISS";

  return "INSUFFICIENT_EVIDENCE_TO_ATTRIBUTE";
}

/**
 * Ranking and selection are separable only when the ranked output shows where
 * the truth candidate landed. Where it does not, the subcause is left unknown
 * rather than invented.
 */
function rankingSubcause(c) {
  if (!c.truthAmongKeptCandidates) return null;
  if (c.truthRank === null || c.truthRank === undefined) {
    return {
      subcause: "TRUTH_CANDIDATE_KEPT_BUT_ABSENT_FROM_RANKED_OUTPUT",
      distinguishable: true,
      evidence:
        "the truth survived candidate filtering (truthAmongKeptCandidates) but appears in neither the selected value nor the alternates (truthRank null), so it was dropped at or before ranked-output assembly rather than out-ranked",
    };
  }
  if (c.truthRank > 1) {
    return {
      subcause: "TRUTH_CANDIDATE_RANKED_BELOW_ANOTHER",
      truthRank: c.truthRank,
      distinguishable: true,
      evidence: `the truth candidate is present in the ranked output at position ${c.truthRank}, so a different candidate out-ranked it`,
    };
  }
  return null;
}

function main() {
  mkdirSync(ROOT, { recursive: true });

  const cases = readJson(DIAGNOSIS);
  const manifest = readJson(EVAL_MANIFEST);
  const baseline = readJson(BASELINE_REPORT);
  const byManifestId = new Map(manifest.records.map((r) => [r.caseId, r]));

  if (cases.length !== EXPECTED_CASES) {
    fail("POPULATION_DISCREPANCY", { expected: EXPECTED_CASES, observed: cases.length });
  }
  const brandPresent = cases.filter((c) => c.truth?.present);
  const brandAbsent = cases.filter((c) => !c.truth?.present);
  if (
    brandPresent.length !== EXPECTED_BRAND_PRESENT ||
    brandAbsent.length !== EXPECTED_BRAND_ABSENT
  ) {
    fail("POPULATION_DISCREPANCY", {
      expectedPresent: EXPECTED_BRAND_PRESENT,
      observedPresent: brandPresent.length,
      expectedAbsent: EXPECTED_BRAND_ABSENT,
      observedAbsent: brandAbsent.length,
    });
  }
  for (const c of cases) {
    if (!byManifestId.has(c.caseId)) fail("CASE_NOT_IN_MANIFEST", c.caseId);
  }

  /* ---------------- per-case attribution ---------------- */
  const attributed = cases.map((c) => {
    const classification = classify(c);
    const record = byManifestId.get(c.caseId);
    const ranked = (c.rankedCandidates ?? []).map((r) => ({
      cleanedValue: r.cleanedValue,
      decision: r.decision,
      rankingScore: r.rankingScore,
      prominence: r.prominence,
      isTruth: r.isTruth,
    }));
    const stageLost = !c.truth?.present
      ? "not applicable — no governed Brand truth for this case"
      : !c.truthInRawOcr
        ? "raw OCR: governed truth never appeared in the recognized text"
        : !c.truthAmongKeptCandidates
          ? `candidate construction: truth reached the OCR text but no kept candidate preserved it${
              c.truthFilterReasons?.length
                ? ` (filter reasons: ${c.truthFilterReasons.join(", ")})`
                : ""
            }`
          : !(c.truthInTop1 || c.selectedNormalizedMatch)
            ? "ranking or selection: a truth-bearing candidate was kept but another candidate was ranked or selected above it"
            : c.state !== "OBSERVED"
              ? `authority: the correct candidate was selected or top-ranked but the state is ${c.state} (abstention reason: ${c.abstentionReason ?? "none recorded"})`
              : "no loss — the correct candidate was selected and reported as OBSERVED";

    return {
      caseId: c.caseId,
      imagePath: record?.imagePath ?? null,
      imageSha256: record?.expectedSha256 ?? null,
      strata: c.strata ?? [],
      governedTruth: {
        present: Boolean(c.truth?.present),
        acceptableValues: c.truth?.acceptable ?? [],
        knownAmbiguous: Boolean(c.truth?.knownAmbiguous),
      },
      rawOcrEvidence: {
        truthPresentInRawOcr: c.truthInRawOcr,
        truthOnReconstructedLine: c.truthOnReconstructedLine,
        reconstructedLineTexts: c.lineTexts ?? [],
        completeWordListCommitted: false,
        completeWordListNote:
          "The committed evidence retains reconstructed line texts, not the complete per-word OCR list, so truthPresentInRawOcr is carried forward as the probe derived it and is not independently re-derived here.",
      },
      candidateList: {
        constructedAndKept: c.truthAmongKeptCandidates,
        filterReasons: c.truthFilterReasons ?? [],
        rankedCandidateCount: ranked.length,
        rankedCandidates: ranked,
      },
      topThreeOrder: ranked.slice(0, 3).map((r) => r.cleanedValue),
      truthRank: c.truthRank,
      truthInTop1: c.truthInTop1,
      truthInTop3: c.truthInTop3,
      selectedCandidate: c.selectedValue,
      selectedExactMatch: c.selectedExactMatch,
      selectedNormalizedMatch: c.selectedNormalizedMatch,
      finalAuthorityState: c.state,
      authorityGate: c.authorityGate ?? null,
      abstentionReason: c.abstentionReason ?? null,
      classification,
      classificationIsFrozenVocabulary: true,
      rankingSelectionSubcause: rankingSubcause(c),
      stageWhereTruthWasLost: stageLost,
      governedFailureClassInSourceArtifact: c.evaluatorFailureClass,
      sourceArtifactOwnClassification: c.failureClass,
      uncertainty:
        c.truth?.knownAmbiguous === true
          ? "The governed truth for this case is recorded as genuinely ambiguous, so a non-OBSERVED state may be the correct behaviour rather than a failure."
          : null,
      evidenceReference: `${DIAGNOSIS}#${c.caseId}`,
    };
  });

  /* ---------------- counts ---------------- */
  const counts = {};
  for (const a of attributed) {
    if (a.classification === null) continue;
    counts[a.classification] = (counts[a.classification] ?? 0) + 1;
  }
  const VOCAB = [
    "WRONG_ACCEPTED_CANDIDATE",
    "CORRECT_OBSERVED",
    "CORRECT_CONSERVATIVE_STATE",
    "RANKING_OR_SELECTION_MISS",
    "CANDIDATE_GROUPING_MISS",
    "OCR_RECOGNITION_MISS",
    "INSUFFICIENT_EVIDENCE_TO_ATTRIBUTE",
  ];
  const classificationTable = VOCAB.map((k) => ({
    classification: k,
    cases: counts[k] ?? 0,
    percentOfBrandPresent: pct(counts[k] ?? 0, EXPECTED_BRAND_PRESENT),
  }));

  /* ---------------- independence ---------------- */
  const truthKey = (c) =>
    (c.governedTruth.acceptableValues ?? [])
      .map((v) => v.toLowerCase())
      .sort()
      .join(" | ");
  const byBrandIdentity = new Map();
  for (const a of attributed) {
    if (!a.governedTruth.present) continue;
    const key = truthKey(a);
    const list = byBrandIdentity.get(key) ?? [];
    list.push(a);
    byBrandIdentity.set(key, list);
  }
  const distinctImages = new Set(attributed.map((a) => a.imageSha256)).size;

  /** A brand identity counts once; its group class is the worst outcome in it. */
  const SEVERITY = [
    "WRONG_ACCEPTED_CANDIDATE",
    "OCR_RECOGNITION_MISS",
    "CANDIDATE_GROUPING_MISS",
    "RANKING_OR_SELECTION_MISS",
    "CORRECT_CONSERVATIVE_STATE",
    "CORRECT_OBSERVED",
  ];
  const identityGroups = [...byBrandIdentity.entries()].map(([key, members]) => {
    const classes = members.map((m) => m.classification);
    const worst = SEVERITY.find((s) => classes.includes(s)) ?? "INSUFFICIENT_EVIDENCE_TO_ATTRIBUTE";
    return {
      brandIdentity: key,
      caseCount: members.length,
      cases: members.map((m) => m.caseId),
      memberClassifications: classes,
      groupClassification: worst,
    };
  });
  const identityCounts = {};
  for (const g of identityGroups) {
    identityCounts[g.groupClassification] = (identityCounts[g.groupClassification] ?? 0) + 1;
  }

  /* ---------------- top-k, states, false certainty ---------------- */
  const stateHistogram = {};
  for (const a of attributed)
    stateHistogram[a.finalAuthorityState] = (stateHistogram[a.finalAuthorityState] ?? 0) + 1;

  const exact = brandPresent.filter((c) => c.selectedExactMatch).length;
  const normalized = brandPresent.filter((c) => c.selectedNormalizedMatch).length;
  const inRaw = brandPresent.filter((c) => c.truthInRawOcr).length;
  const inCandidates = brandPresent.filter((c) => c.truthAmongKeptCandidates).length;
  const top3 = brandPresent.filter((c) => c.truthInTop3).length;
  const top1 = brandPresent.filter((c) => c.truthInTop1).length;
  const wrongObserved = attributed.filter((a) => a.classification === "WRONG_ACCEPTED_CANDIDATE");

  /* ---------------- slices by governed failure class ---------------- */
  const slices = {};
  for (const a of attributed) {
    const g = a.governedFailureClassInSourceArtifact ?? "unclassified";
    slices[g] ??= { cases: 0, classifications: {} };
    slices[g].cases += 1;
    if (a.classification) {
      slices[g].classifications[a.classification] =
        (slices[g].classifications[a.classification] ?? 0) + 1;
    }
  }

  /* ---------------- diagnostic conclusion, computed ---------------- */
  const reachable = {
    RANKING_OR_SELECTION_MISS: counts.RANKING_OR_SELECTION_MISS ?? 0,
    CANDIDATE_GROUPING_MISS: counts.CANDIDATE_GROUPING_MISS ?? 0,
    OCR_RECOGNITION_MISS: counts.OCR_RECOGNITION_MISS ?? 0,
    CORRECT_CONSERVATIVE_STATE: counts.CORRECT_CONSERVATIVE_STATE ?? 0,
  };
  const byCases = Object.entries(reachable).sort((a, b) => b[1] - a[1]);
  const identityReachable = {
    RANKING_OR_SELECTION_MISS: identityCounts.RANKING_OR_SELECTION_MISS ?? 0,
    CANDIDATE_GROUPING_MISS: identityCounts.CANDIDATE_GROUPING_MISS ?? 0,
    OCR_RECOGNITION_MISS: identityCounts.OCR_RECOGNITION_MISS ?? 0,
    CORRECT_CONSERVATIVE_STATE: identityCounts.CORRECT_CONSERVATIVE_STATE ?? 0,
  };
  const byIdentity = Object.entries(identityReachable).sort((a, b) => b[1] - a[1]);

  const CONCLUSION_OF = {
    RANKING_OR_SELECTION_MISS: "RANKING_SELECTION_HEADROOM",
    CANDIDATE_GROUPING_MISS: "CANDIDATE_CONSTRUCTION_HEADROOM",
    OCR_RECOGNITION_MISS: "OCR_HEADROOM",
    CORRECT_CONSERVATIVE_STATE: "AUTHORITY_HEADROOM",
  };
  /** A category dominates only if it leads on BOTH units and by a clear margin. */
  const DOMINANCE_MARGIN = 1.25;
  const leadsCases = byCases[0][1] >= byCases[1][1] * DOMINANCE_MARGIN;
  const leadsIdentity = byIdentity[0][1] >= byIdentity[1][1] * DOMINANCE_MARGIN;
  const sameLeader = byCases[0][0] === byIdentity[0][0];
  const insufficient =
    (counts.INSUFFICIENT_EVIDENCE_TO_ATTRIBUTE ?? 0) > EXPECTED_BRAND_PRESENT * 0.1;

  const conclusion = insufficient
    ? "INSUFFICIENT_COMMITTED_EVIDENCE"
    : sameLeader && leadsCases && leadsIdentity
      ? CONCLUSION_OF[byCases[0][0]]
      : "MIXED_HEADROOM";

  /* ---------------- artifacts ---------------- */
  writeJson("population-freeze.json", {
    artifact: "population-freeze",
    experimentId: EXPERIMENT_ID,
    diagnosticEvaluationOnly: true,
    corpusSource: EVAL_MANIFEST,
    corpusRoot: manifest.corpusRoot,
    manifestRecords: manifest.records.length,
    includedCases: EXPECTED_CASES,
    brandPresentCases: EXPECTED_BRAND_PRESENT,
    brandAbsentCases: EXPECTED_BRAND_ABSENT,
    excludedFromManifest: manifest.records.filter((r) => r.status !== "included").length,
    corpusExpanded: false,
    corpusSubstituted: false,
    truthRevised: false,
    aliasesAdded: false,
    evidenceArtifact: DIAGNOSIS,
    evidenceArtifactBase: DIAGNOSIS_BASE,
    analysisBase: CURRENT_BASE,
  });

  writeJson("per-case-attribution.json", {
    artifact: "per-case-attribution",
    experimentId: EXPERIMENT_ID,
    caseCount: attributed.length,
    classificationVocabularyFrozenBeforeScoring: true,
    sourceArtifactLabelsCopied: false,
    sourceArtifactLabelsUsedForCrossCheckOnly: true,
    cases: attributed,
  });

  writeJson("attribution-summary.json", {
    artifact: "attribution-summary",
    experimentId: EXPERIMENT_ID,
    totalGovernedCasesEvaluated: EXPECTED_CASES,
    brandPresentCases: EXPECTED_BRAND_PRESENT,
    brandAbsentCases: EXPECTED_BRAND_ABSENT,
    metrics: {
      brandRawExactMatch: {
        cases: exact,
        percentOfBrandPresent: pct(exact, EXPECTED_BRAND_PRESENT),
      },
      brandNormalizedMatch: {
        cases: normalized,
        percentOfBrandPresent: pct(normalized, EXPECTED_BRAND_PRESENT),
      },
      truthPresentInRawOcr: {
        cases: inRaw,
        percentOfBrandPresent: pct(inRaw, EXPECTED_BRAND_PRESENT),
      },
      truthPresentInCandidateList: {
        cases: inCandidates,
        percentOfBrandPresent: pct(inCandidates, EXPECTED_BRAND_PRESENT),
      },
      brandTop3Recall: { cases: top3, percentOfBrandPresent: pct(top3, EXPECTED_BRAND_PRESENT) },
      brandTop1Recall: { cases: top1, percentOfBrandPresent: pct(top1, EXPECTED_BRAND_PRESENT) },
      selectedCandidateAccuracy: {
        cases: normalized,
        percentOfBrandPresent: pct(normalized, EXPECTED_BRAND_PRESENT),
      },
    },
    survivalCascade: [
      { stage: "governed truth exists", cases: EXPECTED_BRAND_PRESENT, lostHere: 0 },
      { stage: "truth present in raw OCR", cases: inRaw, lostHere: EXPECTED_BRAND_PRESENT - inRaw },
      { stage: "truth kept as a candidate", cases: inCandidates, lostHere: inRaw - inCandidates },
      { stage: "truth in top 3", cases: top3, lostHere: inCandidates - top3 },
      { stage: "truth top-ranked", cases: top1, lostHere: top3 - top1 },
      { stage: "truth selected", cases: normalized, lostHere: top1 - normalized },
      {
        stage: "reported OBSERVED",
        cases: counts.CORRECT_OBSERVED ?? 0,
        lostHere: normalized - (counts.CORRECT_OBSERVED ?? 0),
      },
    ],
    classificationCounts: classificationTable,
    classificationCountsByDistinctBrandIdentity: Object.entries(identityCounts)
      .map(([classification, groups]) => ({ classification, brandIdentities: groups }))
      .sort((a, b) => b.brandIdentities - a.brandIdentities),
    slicesByGovernedFailureClass: slices,
    crossCheckAgainstSourceArtifact: {
      note: "The source artifact uses a different vocabulary, so divergence is expected and is not an error. Reported for transparency.",
      sourceClassCounts: attributed.reduce((acc, a) => {
        acc[a.sourceArtifactOwnClassification] = (acc[a.sourceArtifactOwnClassification] ?? 0) + 1;
        return acc;
      }, {}),
    },
  });

  writeJson("state-histogram.json", {
    artifact: "state-histogram",
    experimentId: EXPERIMENT_ID,
    allCases: stateHistogram,
    brandPresentOnly: attributed
      .filter((a) => a.governedTruth.present)
      .reduce((acc, a) => {
        acc[a.finalAuthorityState] = (acc[a.finalAuthorityState] ?? 0) + 1;
        return acc;
      }, {}),
    brandAbsentOnly: attributed
      .filter((a) => !a.governedTruth.present)
      .reduce((acc, a) => {
        acc[a.finalAuthorityState] = (acc[a.finalAuthorityState] ?? 0) + 1;
        return acc;
      }, {}),
    authorityThresholdsChanged: false,
    stateSemanticsChanged: false,
  });

  writeJson("top-k-report.json", {
    artifact: "top-k-report",
    experimentId: EXPERIMENT_ID,
    brandPresentCases: EXPECTED_BRAND_PRESENT,
    truthPresentInRawOcr: inRaw,
    truthKeptAsCandidate: inCandidates,
    top3Recall: { cases: top3, percent: pct(top3, EXPECTED_BRAND_PRESENT) },
    top1Recall: { cases: top1, percent: pct(top1, EXPECTED_BRAND_PRESENT) },
    selectedAccuracy: { cases: normalized, percent: pct(normalized, EXPECTED_BRAND_PRESENT) },
    conditionalRecall: {
      note: "Recall conditioned on the truth having survived the previous stage. This separates a ranking problem from an upstream supply problem.",
      top3GivenKeptCandidate: pct(top3, inCandidates),
      top1GivenTop3: pct(top1, top3),
      selectedGivenTop1: pct(normalized, top1),
      keptCandidateGivenInRawOcr: pct(inCandidates, inRaw),
    },
    truthRankDistribution: attributed
      .filter((a) => a.governedTruth.present && a.truthRank !== null)
      .reduce((acc, a) => {
        acc[String(a.truthRank)] = (acc[String(a.truthRank)] ?? 0) + 1;
        return acc;
      }, {}),
  });

  writeJson("false-certainty-report.json", {
    artifact: "false-certainty-report",
    experimentId: EXPERIMENT_ID,
    definition:
      "An incorrect Brand candidate accepted as OBSERVED, evaluated across all 115 cases including the 10 brand-absent ones.",
    wrongAcceptedCandidateCount: wrongObserved.length,
    wrongAcceptedCandidateCases: wrongObserved.map((a) => a.caseId),
    observedStateCount: stateHistogram.OBSERVED ?? 0,
    observedAndCorrect: counts.CORRECT_OBSERVED ?? 0,
    brandAbsentReportedObserved: attributed.filter(
      (a) => !a.governedTruth.present && a.finalAuthorityState === "OBSERVED",
    ).length,
    interpretation:
      "Zero here is a measured count of wrong OBSERVED acceptances on this corpus under the current authority gate. It is not a calibration claim and does not mean the gate is correctly tuned: the same gate also withholds OBSERVED on correct answers, which is counted separately as CORRECT_CONSERVATIVE_STATE.",
  });

  writeJson("independence-report.json", {
    artifact: "independence-report",
    experimentId: EXPERIMENT_ID,
    historicalCases: EXPECTED_CASES,
    brandPresentCases: EXPECTED_BRAND_PRESENT,
    distinctSourceImages: distinctImages,
    distinctImagesEqualCases: distinctImages === EXPECTED_CASES,
    distinctCropClustersAvailable: false,
    distinctCropClustersNote:
      "No crop-cluster mapping exists for this corpus in committed artifacts. The crop clusters recorded elsewhere in Issue #149 belong to a different five-case subset and are not applicable here.",
    distinctVisualDesignClustersAvailable: false,
    distinctVisualDesignClustersNote:
      "No verified visual-design clustering exists for this corpus. Distinct Brand IDENTITY is used as the available proxy and is labelled as a proxy wherever it is reported.",
    distinctBrandIdentities: byBrandIdentity.size,
    brandIdentitiesWithMultipleCases: identityGroups.filter((g) => g.caseCount > 1).length,
    casesInRepeatedBrandIdentities: identityGroups
      .filter((g) => g.caseCount > 1)
      .reduce((n, g) => n + g.caseCount, 0),
    proxyCaveat:
      "Distinct brand identity is not the same as distinct visual design. Two cases of one brand may use different label artwork, and two different brands may share a template. Treat identity-level counts as a duplication control, not as a design-diversity measurement.",
    groups: identityGroups.sort((a, b) => b.caseCount - a.caseCount),
    countingRule:
      "Repeated brand identities count once at identity level; a group takes the worst outcome among its members.",
  });

  writeJson("decision.json", {
    artifact: "decision",
    experimentId: EXPERIMENT_ID,
    issue: 149,
    diagnosticOnly: true,
    keepsOrKillsAProductionChange: false,
    diagnosticConclusion: conclusion,
    conclusionComputedFromCounts: true,
    conclusionHandAsserted: false,
    dominanceRule: `A category is the conclusion only when it leads on BOTH historical cases and distinct brand identities, by a factor of at least ${DOMINANCE_MARGIN}. Otherwise MIXED_HEADROOM.`,
    byHistoricalCases: byCases.map(([classification, cases]) => ({ classification, cases })),
    byDistinctBrandIdentity: byIdentity.map(([classification, identities]) => ({
      classification,
      identities,
    })),
    leaderByCases: byCases[0][0],
    leaderByIdentity: byIdentity[0][0],
    sameLeaderOnBothUnits: sameLeader,
    marginSatisfiedByCases: leadsCases,
    marginSatisfiedByIdentity: leadsIdentity,
    insufficientEvidenceCases: counts.INSUFFICIENT_EVIDENCE_TO_ATTRIBUTE ?? 0,
    ocrRun: false,
    alternativeRecognizerExecuted: false,
    productionChanged: false,
    truthAltered: false,
    normalizationChanged: false,
    authorityThresholdsChanged: false,
    corpusExpanded: false,
    pr195Touched: false,
    pr214Reinterpreted: false,
    pr216Reinterpreted: false,
    authorizes: [],
    doesNotAuthorize: [
      "any production change",
      "any ranking, selection or authority change",
      "any threshold change",
      "any truth or normalization change",
      "corpus expansion",
      "implementing the suggested successor experiment",
    ],
  });

  /* ---------------- summary ---------------- */
  const summary = {
    conclusion,
    totalCases: EXPECTED_CASES,
    brandPresent: EXPECTED_BRAND_PRESENT,
    classificationCounts: classificationTable.filter((r) => r.cases > 0),
    byIdentity: byIdentity,
    metrics: {
      exact,
      normalized,
      inRaw,
      inCandidates,
      top3,
      top1,
      wrongAccepted: wrongObserved.length,
    },
    stateHistogram,
  };
  writeJson("analysis-summary.json", {
    artifact: "analysis-summary",
    experimentId: EXPERIMENT_ID,
    ...summary,
  });

  // Format before hashing so the manifest records the committed bytes.
  const written = readdirSync(ROOT).filter((f) => f.endsWith(".json"));
  execFileSync(
    "npx",
    ["prettier", "--write", "--log-level", "warn", ...written.map((f) => path.join(ROOT, f))],
    { stdio: "inherit" },
  );

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
  const entries = files.map((f) => ({
    path: f,
    byteSize: statSync(path.join(ROOT, f)).size,
    sha256: sha256(readFileSync(path.join(ROOT, f))),
  }));
  writeJson("artifact-manifest.json", {
    artifact: "artifact-manifest",
    experimentId: EXPERIMENT_ID,
    issue: 149,
    diagnosticEvaluationOnly: true,
    ocrRun: false,
    alternativeRecognizerExecuted: false,
    productionChanged: false,
    diagnosticConclusion: conclusion,
    fileCount: entries.length,
    files: entries,
  });
  execFileSync(
    "npx",
    ["prettier", "--write", "--log-level", "warn", path.join(ROOT, "artifact-manifest.json")],
    { stdio: "inherit" },
  );
  writeFileSync(
    path.join(ROOT, "artifact-manifest.sha256"),
    `${sha256(readFileSync(path.join(ROOT, "artifact-manifest.json")))}  artifact-manifest.json\n`,
  );

  console.log(JSON.stringify(summary, null, 2));
}

main();
