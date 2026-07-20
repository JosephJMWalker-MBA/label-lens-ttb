/** Diff the baseline and treatment corpus reports. Emits metrics + changed-cases.csv. */
import { readFileSync, writeFileSync } from "node:fs";

const base = JSON.parse(readFileSync(process.argv[2], "utf8"));
const treat = JSON.parse(readFileSync(process.argv[3], "utf8"));
const outCsv = process.argv[4];

const B = new Map(base.cases.map((c) => [c.caseId, c]));
const T = new Map(treat.cases.map((c) => [c.caseId, c]));

const pct = (n, d) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);
const percentile = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

function metrics(rep) {
  const cs = rep.cases;
  const present = cs.filter((c) => c.alcohol.present === true);
  const absent = cs.filter((c) => c.alcohol.present === false);
  const states = {};
  for (const c of cs)
    states[c.alcohol.state ?? "null"] = (states[c.alcohol.state ?? "null"] ?? 0) + 1;
  const lat = cs.map((c) => c.latencyMs ?? 0);
  return {
    cases: cs.length,
    presentAlcohol: present.length,
    absentAlcohol: absent.length,
    detected: present.filter((c) => c.alcohol.detected).length,
    parsedAccurate: present.filter((c) => c.alcohol.parsedAccurate).length,
    // False certainty: an OBSERVED alcohol statement that is not accurate against truth,
    // plus any accepted statement on a label with no alcohol statement at all.
    falseCertainty:
      present.filter((c) => c.alcohol.state === "OBSERVED" && !c.alcohol.parsedAccurate).length +
      absent.filter((c) => c.alcohol.value !== null).length,
    absentFalsePositives: absent.filter((c) => c.alcohol.value !== null).length,
    states,
    brandExact: cs.filter((c) => c.brand.exactMatch).length,
    brandNormalized: cs.filter((c) => c.brand.normalizedMatch).length,
    latencyMedian: Math.round(percentile(lat, 0.5)),
    latencyP95: Math.round(percentile(lat, 0.95)),
  };
}

const mb = metrics(base);
const mt = metrics(treat);

const rows = [];
for (const [id, b] of B) {
  const t = T.get(id);
  if (!t) continue;
  const changed =
    b.alcohol.state !== t.alcohol.state ||
    b.alcohol.value !== t.alcohol.value ||
    b.brand.state !== t.brand.state ||
    b.brand.value !== t.brand.value;
  if (!changed) continue;
  const wasCorrect = b.alcohol.parsedAccurate === true;
  const nowCorrect = t.alcohol.parsedAccurate === true;
  rows.push({
    case_id: id,
    truth_percent: (t.alcohol.acceptablePercents ?? [])[0] ?? "",
    alcohol_state_before: b.alcohol.state,
    alcohol_state_after: t.alcohol.state,
    alcohol_value_before: b.alcohol.value ?? "",
    alcohol_value_after: t.alcohol.value ?? "",
    parsed_accurate_before: b.alcohol.parsedAccurate,
    parsed_accurate_after: t.alcohol.parsedAccurate,
    failure_class_before: b.alcohol.failureClass,
    failure_class_after: t.alcohol.failureClass,
    brand_changed: b.brand.state !== t.brand.state || b.brand.value !== t.brand.value,
    verdict:
      !wasCorrect && nowCorrect
        ? "IMPROVED"
        : wasCorrect && !nowCorrect
          ? "REGRESSED"
          : "CHANGED-STATE-ONLY",
    alcohol_present: t.alcohol.present,
  });
}

const headers = Object.keys(rows[0] ?? { case_id: "" });
writeFileSync(
  outCsv,
  [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n") + "\n",
);

const fmt = (m) => ({
  ...m,
  detectionRecall: pct(m.detected, m.presentAlcohol),
  parsedValueAccuracy: pct(m.parsedAccurate, m.presentAlcohol),
});

console.log("BASELINE :", JSON.stringify(fmt(mb), null, 1));
console.log("TREATMENT:", JSON.stringify(fmt(mt), null, 1));
console.log("\nDELTAS");
console.log(
  "  detected            ",
  mb.detected,
  "->",
  mt.detected,
  `(${mt.detected - mb.detected >= 0 ? "+" : ""}${mt.detected - mb.detected})`,
);
console.log(
  "  parsedAccurate      ",
  mb.parsedAccurate,
  "->",
  mt.parsedAccurate,
  `(${mt.parsedAccurate - mb.parsedAccurate >= 0 ? "+" : ""}${mt.parsedAccurate - mb.parsedAccurate})`,
);
console.log("  falseCertainty      ", mb.falseCertainty, "->", mt.falseCertainty);
console.log("  absentFalsePositives", mb.absentFalsePositives, "->", mt.absentFalsePositives);
console.log("  brandExact          ", mb.brandExact, "->", mt.brandExact);
console.log("  brandNormalized     ", mb.brandNormalized, "->", mt.brandNormalized);
console.log(
  "  latency median/p95  ",
  `${mb.latencyMedian}/${mb.latencyP95}`,
  "->",
  `${mt.latencyMedian}/${mt.latencyP95}`,
);
console.log("\nCHANGED CASES:", rows.length);
for (const r of rows)
  console.log(
    `  ${r.verdict.padEnd(19)} ${r.case_id.padEnd(24)} truth=${String(r.truth_percent).padEnd(5)} ${r.alcohol_state_before}->${r.alcohol_state_after}  ${JSON.stringify(r.alcohol_value_before)} -> ${JSON.stringify(r.alcohol_value_after)}`,
  );
console.log("\nregressions:", rows.filter((r) => r.verdict === "REGRESSED").length);
console.log("brand changes:", rows.filter((r) => r.brand_changed).length);
console.log(
  "absent-alcohol cases among changes:",
  rows.filter((r) => r.alcohol_present === false).length,
);
