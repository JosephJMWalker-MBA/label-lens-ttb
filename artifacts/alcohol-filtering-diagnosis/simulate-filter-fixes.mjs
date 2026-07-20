/**
 * READ-ONLY simulation of bounded alcohol-filter fixes.
 * Re-implements the extractor's canonicalization + acceptance regexes exactly as
 * they exist today, applies ONE candidate change at a time, and reports:
 *   - how many of the 34 candidate-filtering failures would newly yield the truth
 *   - how many absent-alcohol cases would newly produce a FALSE POSITIVE
 * No production code is modified and no OCR is run.
 */
import { readFileSync } from "node:fs";
const report = JSON.parse(readFileSync(process.argv[2], "utf8"));

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;

// --- canonicalization, transcribed from canonicalizeAlcoholWindowText -------
function canon(raw, fix) {
  let t = raw.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  // E1 changes ONLY this first operation (adds an optional separator).
  t =
    fix === "E1"
      ? t.replace(/\ba[1il]c[.°]?\s*(?=[0-9oOil])/g, "alc ")
      : t.replace(/\ba[1il]c(?=[0-9oOil])/g, "alc ");
  t = t.replace(/\ba[1il]c(?=\b|\d)/g, "alc");
  t = t.replace(/\bv[o0][l1i]ume\b/g, "volume");
  t = t.replace(/\bv[o0][l1i]\b/g, "vol");
  t = t.replace(/%\s*by\b/g, "% by");
  t = t.replace(/\bbyvol(?:ume)?\b/g, (v) => (v.includes("ume") ? "by volume" : "by vol"));
  t = t.replace(/\balc\s*[.]*\s*\/\s*vol(?:ume)?\.?\b/g, "alc / vol");
  // E2: split a percentage fused to a bare volume word ("13.5%vol" -> "13.5% vol")
  if (fix === "E2") t = t.replace(/%(?=vol(?:ume)?\b)/g, "% ");
  // E3: treat ABV as an explicit alcohol-by-volume marker
  if (fix === "E3") t = t.replace(/\babv\b/g, "by vol");
  return t;
}

// --- acceptance regexes, transcribed from field-selection.ts ---------------
const RES = [
  new RegExp(`^${NUM}\\s*%\\s+by\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+${NUM}\\s*%\\s+by\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+%\\s+${NUM}\\s+by\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^${NUM}\\s*%\\s+alc\\.?\\s*(?:\\/|by)\\s*vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+${NUM}\\s*%\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+${NUM}\\s+by\\s+vol(?:ume)?\\.?$`),
  new RegExp(`^(?:alcohol|alc\\.?)\\s+${NUM}\\s+vol(?:ume)?\\.?$`),
];

function volumeGate(t) {
  const hasByVolume = /\bby\s+vol(?:ume)?\b/.test(t);
  const hasAlcVol = /\balc\s*(?:\/|by)\s*vol(?:ume)?\b/.test(t);
  const hasBareVol = /\bvol(?:ume)?\b/.test(t);
  return hasByVolume || hasAlcVol || hasBareVol;
}

function accept(raw, fix) {
  const t = canon(raw, fix);
  if (!/[0-9oOil]/i.test(t)) return null;
  if (/\bproof\b/.test(t) && !volumeGate(t)) return null;
  if (!volumeGate(t)) return null;
  for (const re of RES) {
    const m = t.match(re);
    if (m) {
      const n = Number(String(m[1]).replace(",", "."));
      if (Number.isFinite(n) && n > 0 && n <= 100) return n;
    }
  }
  return null;
}

const cases = report.cases ?? [];
const failures = cases.filter((c) => c.alcohol?.failureClass === "candidate-filtering-failure");
const absent = cases.filter((c) => c.alcohol && c.alcohol.present === false);
const correct = cases.filter((c) => c.alcohol?.failureClass === "correct");

function evaluate(fix) {
  const recovered = [];
  for (const c of failures) {
    const truth = c.alcohol.acceptablePercents ?? [];
    const decs = c.diagnostics?.alcoholCandidateDecisions ?? [];
    const base = decs.some((d) => accept(d.rawText ?? "", null) !== null);
    const hit = decs.find((d) => {
      const v = accept(d.rawText ?? "", fix);
      return v !== null && truth.includes(v);
    });
    if (hit && !base) recovered.push({ caseId: c.caseId, truth: truth[0], rawText: hit.rawText });
  }
  const falsePos = [];
  for (const c of absent) {
    const decs = c.diagnostics?.alcoholCandidateDecisions ?? [];
    const before = decs.some((d) => accept(d.rawText ?? "", null) !== null);
    const after = decs.find((d) => accept(d.rawText ?? "", fix) !== null);
    if (after && !before)
      falsePos.push({
        caseId: c.caseId,
        rawText: after.rawText,
        value: accept(after.rawText, fix),
      });
  }
  const disturbed = [];
  for (const c of correct) {
    const decs = c.diagnostics?.alcoholCandidateDecisions ?? [];
    const truth = c.alcohol.acceptablePercents ?? [];
    const newVals = new Set();
    for (const d of decs) {
      const v = accept(d.rawText ?? "", fix);
      if (v !== null) newVals.add(v);
    }
    const wrongNew = [...newVals].filter((v) => !truth.includes(v));
    if (wrongNew.length) disturbed.push({ caseId: c.caseId, truth: truth[0], wrongNew });
  }
  return { recovered, falsePos, disturbed };
}

console.log(
  `corpus: ${cases.length} cases | filtering failures: ${failures.length} | absent-alcohol: ${absent.length} | currently-correct: ${correct.length}\n`,
);
for (const fix of ["E1", "E2", "E3"]) {
  const { recovered, falsePos, disturbed } = evaluate(fix);
  const label = {
    E1: "E1 fused alc-prefix w/ separator (alc.13 -> alc 13)",
    E2: "E2 split percent fused to bare vol (13.5%vol)",
    E3: "E3 ABV as volume marker",
  }[fix];
  console.log(`### ${label}`);
  console.log(`  recovers: ${recovered.length} of 34`);
  for (const r of recovered)
    console.log(`     + ${r.caseId} truth=${r.truth} via ${JSON.stringify(r.rawText)}`);
  console.log(`  NEW false positives on absent-alcohol cases: ${falsePos.length}`);
  for (const f of falsePos)
    console.log(`     ! ${f.caseId} -> ${f.value} via ${JSON.stringify(f.rawText)}`);
  console.log(`  currently-correct cases gaining a NEW wrong candidate value: ${disturbed.length}`);
  for (const d of disturbed.slice(0, 5))
    console.log(`     ~ ${d.caseId} truth=${d.truth} new=${JSON.stringify(d.wrongNew)}`);
  console.log();
}
