import { readFileSync, writeFileSync } from "node:fs";
const E = "artifacts/brand-evidence-path-diagnosis/e1a-too-many-words-simulation/";
const C = JSON.parse(readFileSync(E + "cases.json", "utf8"));
const P = C.filter((c) => c.present),
  A = C.filter((c) => !c.present);
const m = (k) => ({
  exactSelectedMatch: P.filter((c) => c[k].exactMatch).length,
  normalizedSelectedMatch: P.filter((c) => c[k].normalizedMatch).length,
  top3Recall: P.filter((c) => c[k].truthInTop3).length,
  truthReachingAnyCandidate: P.filter((c) => c[k].truthAmongKept).length,
  truthRankedFirst: P.filter((c) => c[k].truthRank === 1).length,
  truthRankedFirstNotObserved: P.filter((c) => c[k].truthRank === 1 && c[k].state !== "OBSERVED")
    .length,
  stateOBSERVED: C.filter((c) => c[k].state === "OBSERVED").length,
  stateAMBIGUOUS: C.filter((c) => c[k].state === "AMBIGUOUS").length,
  stateNOT_OBSERVED: C.filter((c) => c[k].state === "NOT_OBSERVED").length,
  wrongSelectedCandidates: P.filter(
    (c) => c[k].value !== null && !c[k].normalizedMatch && !c[k].exactMatch,
  ).length,
  wrongObservedCandidates: P.filter(
    (c) => c[k].state === "OBSERVED" && !c[k].normalizedMatch && !c[k].exactMatch,
  ).length,
  absentBrandEmittingValue: A.filter((c) => c[k].value !== null).length,
});
const b = m("baseline"),
  t = m("treatment");
const changed = C.filter(
  (c) => c.baseline.value !== c.treatment.value || c.baseline.state !== c.treatment.state,
);
const gain = [],
  neutral = [],
  regress = [];
for (const c of changed) {
  const wasCorrect = c.baseline.normalizedMatch || c.baseline.exactMatch;
  const nowCorrect = c.treatment.normalizedMatch || c.treatment.exactMatch;
  let verdict, reason;
  if (!c.present) {
    verdict = c.treatment.value !== null ? "regression" : "neutral";
    reason = "absent-brand case";
  } else if (!wasCorrect && nowCorrect) {
    verdict = "gain";
    reason = "a generated sub-span became the selected value and matches truth";
  } else if (wasCorrect && !nowCorrect) {
    verdict = "regression";
    reason = "a generated sub-span displaced a correct selection";
  } else if (c.baseline.state !== c.treatment.state && c.baseline.value === c.treatment.value) {
    verdict = "neutral";
    reason = `state changed ${c.baseline.state}->${c.treatment.state} with the same value`;
  } else {
    verdict = "neutral";
    reason = "selected value changed between two incorrect values";
  }
  const rec = {
    caseId: c.caseId,
    present: c.present,
    knownAmbiguous: c.knownAmbiguous,
    truth: c.acceptable,
    baseline: { value: c.baseline.value, state: c.baseline.state, truthRank: c.baseline.truthRank },
    treatment: {
      value: c.treatment.value,
      state: c.treatment.state,
      truthRank: c.treatment.truthRank,
    },
    generatedSpans: c.generatedSpans,
    verdict,
    reason,
  };
  (verdict === "gain" ? gain : verdict === "regression" ? regress : neutral).push(rec);
}
const volOf = (k) => {
  const v = C.map((c) => c[k].candidateCount).sort((x, y) => x - y);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
  return {
    min: v[0],
    median: q(0.5),
    p95: q(0.95),
    max: v.at(-1),
    total: v.reduce((x, y) => x + y, 0),
  };
};
const out = {
  baseline: b,
  treatment: t,
  delta: Object.fromEntries(Object.keys(b).map((k) => [k, t[k] - b[k]])),
  changedCaseCount: changed.length,
  gains: gain.length,
  neutral: neutral.length,
  regressions: regress.length,
  currentlyCorrectCasesChanged: changed.filter(
    (c) => c.baseline.normalizedMatch || c.baseline.exactMatch,
  ).length,
  knownAmbiguousCasesChanged: changed.filter((c) => c.knownAmbiguous).length,
  candidateVolume: {
    baseline: volOf("baseline"),
    treatment: volOf("treatment"),
    generatedSubSpansTotal: C.reduce((s, c) => s + c.generatedSpans, 0),
    casesWithTriggerLine: C.filter((c) => c.triggeredLines > 0).length,
    triggerLinesTotal: C.reduce((s, c) => s + c.triggeredLines, 0),
  },
};
writeFileSync(
  E + "baseline.json",
  JSON.stringify(
    { metrics: b, perCase: C.map((c) => ({ caseId: c.caseId, ...c.baseline })) },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  E + "treatment.json",
  JSON.stringify(
    { metrics: t, perCase: C.map((c) => ({ caseId: c.caseId, ...c.treatment })) },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  E + "changed-cases.json",
  JSON.stringify(
    {
      summary: { gains: gain.length, neutral: neutral.length, regressions: regress.length },
      gains: gain,
      neutral,
      regressions: regress,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(E + "candidate-volume.json", JSON.stringify(out.candidateVolume, null, 2) + "\n");
writeFileSync(E + "metrics.json", JSON.stringify(out, null, 2) + "\n");
console.log("metric".padEnd(30), "base", "treat", "delta");
for (const k of Object.keys(b))
  console.log(
    k.padEnd(30),
    String(b[k]).padStart(4),
    String(t[k]).padStart(5),
    (t[k] - b[k] >= 0 ? "+" : "") + (t[k] - b[k]),
  );
console.log(
  "\nchanged",
  changed.length,
  "| gains",
  gain.length,
  "| neutral",
  neutral.length,
  "| regressions",
  regress.length,
);
console.log(
  "currently-correct changed:",
  out.currentlyCorrectCasesChanged,
  "| knownAmbiguous changed:",
  out.knownAmbiguousCasesChanged,
);
console.log("\nvolume baseline :", JSON.stringify(out.candidateVolume.baseline));
console.log("volume treatment:", JSON.stringify(out.candidateVolume.treatment));
console.log(
  "generated:",
  out.candidateVolume.generatedSubSpansTotal,
  "| trigger lines:",
  out.candidateVolume.triggerLinesTotal,
  "in",
  out.candidateVolume.casesWithTriggerLine,
  "cases",
);
