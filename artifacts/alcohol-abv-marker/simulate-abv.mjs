/**
 * READ-ONLY simulation for Experiment C3 (ABV as explicit alcohol-by-volume).
 *
 * Transcribes the CURRENT canonicalization + acceptance chain from
 * src/pipeline/extractor/field-selection.ts, applies one candidate change, and
 * reports recoveries and control outcomes. Runs no OCR, changes no production code.
 *
 * Candidate treatment: expand the standalone token `abv` to `by vol` during
 * canonicalization, BEFORE the existing split-percent-by rule so "13.5%abv"
 * also lands on "13.5% by vol".
 */
import { readFileSync, writeFileSync } from "node:fs";

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;

function canon(raw, withAbv) {
  let t = raw.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  t = t.replace(/\ba[1il]c\.?(?=[0-9oOil])/g, "alc ");
  t = t.replace(/\ba[1il]c(?=\b|\d)/g, "alc");
  t = t.replace(/\bv[o0][l1i]ume\b/g, "volume");
  t = t.replace(/\bv[o0][l1i]\b/g, "vol");
  // TREATMENT: whole-token ABV only. Placed before split-percent-by so a
  // percentage fused to the marker still gains its space.
  if (withAbv) t = t.replace(/\babv\b/g, "by vol");
  t = t.replace(/%\s*by\b/g, "% by");
  t = t.replace(/\bbyvol(?:ume)?\b/g, (v) => (v.includes("ume") ? "by volume" : "by vol"));
  t = t.replace(/\balc\s*[.]*\s*\/\s*vol(?:ume)?\.?\b/g, "alc / vol");
  const comma = /(\d{1,3})\s*,\s*(\d{1,2})/g;
  if (comma.test(t)) t = t.replace(comma, "$1.$2");
  const dot = /(\d{1,3})\s*\.\s*(\d{1,2})/g;
  if (dot.test(t)) t = t.replace(dot, "$1.$2");
  return t.replace(/\s+/g, " ").trim();
}

const RES = [
  new RegExp(`^${NUM}\\s*%\\s+by\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+${NUM}\\s*%\\s+by\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+%\\s+${NUM}\\s+by\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^${NUM}\\s*%\\s+alc\\.?\\s*(?:\\/|by)\\s*vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+${NUM}\\s*%\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+${NUM}\\s+by\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+${NUM}\\s+vol(?:ume)?\\.?$`),
];

function gate(t) {
  return (
    /\bby\s+vol(?:ume)?\b/.test(t) ||
    /\balc\s*(?:\/|by)\s*vol(?:ume)?\b/.test(t) ||
    /\bvol(?:ume)?\b/.test(t)
  );
}

function accept(raw, withAbv) {
  const t = canon(raw, withAbv);
  if (!/[0-9oOil]/i.test(t)) return { value: null, reason: "no-supported-number", text: t };
  if (/\bproof\b/.test(t) && !gate(t)) return { value: null, reason: "proof-only", text: t };
  if (!gate(t)) return { value: null, reason: "missing-volume-marker", text: t };
  for (const re of RES) {
    const m = t.match(re);
    if (m) {
      const n = Number(String(m[1]).replace(",", "."));
      if (Number.isFinite(n) && n > 0 && n <= 100) return { value: n, reason: "accepted", text: t };
    }
  }
  return { value: null, reason: "unsupported-pattern", text: t };
}

// ---- Required form-by-form evaluation ------------------------------------
const FORMS = [
  ["13.5% ABV", "positive"],
  ["13.5%ABV", "positive"],
  ["ABV 13.5%", "prefix form — expected NOT supported in this experiment"],
  ["ABV", "negative: bare marker"],
  ["ABVX", "negative: partial-token noise"],
  ["CABVERNET 13.5%", "negative: letters abv inside a word"],
  ["ABVOCADO 13.5%", "negative: word starting with abv"],
  ["13.5.5% ABV", "negative: malformed decimal beside ABV"],
  ["ABV %", "negative: marker with no number"],
  ["13.5% BY VOL", "existing form must be unchanged"],
  ["13.5% ALC./VOL.", "existing form must be unchanged"],
  ["ALC.13% BY VOL", "existing fused form (C1) must be unchanged"],
  ["80 PROOF", "negative: proof-only"],
  ["750 mL", "negative: net contents"],
  ["EST. 1985", "negative: date"],
  ["1-800-555-0199", "negative: phone"],
  ["123 MAIN ST.", "negative: address"],
  ["MAY CAUSE HEALTH PROBLEMS. CONTAINS SULFITES", "negative: government warning"],
];

const forms = FORMS.map(([raw, note]) => {
  const before = accept(raw, false);
  const after = accept(raw, true);
  return {
    input: raw,
    note,
    before: { value: before.value, reason: before.reason },
    after: { value: after.value, reason: after.reason, canonical: after.text },
    changed: before.value !== after.value || before.reason !== after.reason,
  };
});

// ---- Corpus effect -------------------------------------------------------
const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const cases = report.cases ?? [];
const failures = cases.filter((c) => c.alcohol?.failureClass === "candidate-filtering-failure");
const absent = cases.filter((c) => c.alcohol && c.alcohol.present === false);
const correct = cases.filter((c) => c.alcohol?.failureClass === "correct");

const recovered = [];
for (const c of failures) {
  const truth = c.alcohol.acceptablePercents ?? [];
  const decs = c.diagnostics?.alcoholCandidateDecisions ?? [];
  const baseHit = decs.some((d) => accept(d.rawText ?? "", false).value !== null);
  const hit = decs.find((d) => {
    const v = accept(d.rawText ?? "", true).value;
    return v !== null && truth.includes(v);
  });
  if (hit && !baseHit) recovered.push({ caseId: c.caseId, truth: truth[0], via: hit.rawText });
}

const falsePositives = [];
for (const c of absent) {
  const decs = c.diagnostics?.alcoholCandidateDecisions ?? [];
  const before = decs.some((d) => accept(d.rawText ?? "", false).value !== null);
  const after = decs.find((d) => accept(d.rawText ?? "", true).value !== null);
  if (after && !before)
    falsePositives.push({
      caseId: c.caseId,
      via: after.rawText,
      value: accept(after.rawText, true).value,
    });
}

const disturbed = [];
for (const c of correct) {
  const truth = c.alcohol.acceptablePercents ?? [];
  const decs = c.diagnostics?.alcoholCandidateDecisions ?? [];
  const beforeVals = new Set();
  const afterVals = new Set();
  for (const d of decs) {
    const b = accept(d.rawText ?? "", false).value;
    const a = accept(d.rawText ?? "", true).value;
    if (b !== null) beforeVals.add(b);
    if (a !== null) afterVals.add(a);
  }
  const newVals = [...afterVals].filter((v) => !beforeVals.has(v));
  const newWrong = newVals.filter((v) => !truth.includes(v));
  if (newVals.length) disturbed.push({ caseId: c.caseId, truth: truth[0], newVals, newWrong });
}

const out = {
  experiment: "alcohol-abv-marker (C3)",
  treatment: "canonicalize whole-token /\\babv\\b/ -> 'by vol' before split-percent-by",
  ranAnyOcr: false,
  corpus: {
    cases: cases.length,
    filteringFailures: failures.length,
    absentAlcohol: absent.length,
    currentlyCorrect: correct.length,
  },
  forms,
  corpusEffect: {
    recovered,
    newFalsePositivesOnAbsentAlcohol: falsePositives,
    currentlyCorrectCasesGainingNewValues: disturbed,
  },
};

writeFileSync(process.argv[3], JSON.stringify(out, null, 2) + "\n");

console.log("FORM-BY-FORM");
for (const f of forms) {
  const mark = f.changed ? "CHANGED" : "same   ";
  console.log(
    `  ${mark} ${JSON.stringify(f.input).padEnd(48)} before=${String(f.before.value ?? f.before.reason).padEnd(22)} after=${String(f.after.value ?? f.after.reason)}`,
  );
}
console.log("\nCORPUS EFFECT");
console.log("  recovered:", recovered.length, JSON.stringify(recovered));
console.log(
  "  new false positives (absent-alcohol):",
  falsePositives.length,
  JSON.stringify(falsePositives),
);
console.log(
  "  currently-correct cases gaining new values:",
  disturbed.length,
  JSON.stringify(disturbed),
);
