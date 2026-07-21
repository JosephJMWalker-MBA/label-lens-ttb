/**
 * READ-ONLY evaluation of nine candidate abstention triggers over all 115 cases.
 *
 * Input: reread-evidence.json — for every case that produced an accepted alcohol
 * candidate, two re-reads of the candidate's own token-union crop (psm 8 / 11)
 * and one re-read of an independently derived full-width line band (psm 7), each
 * parsed by the REAL production selector.
 *
 * No trigger may use fixture identity, truth values, or a plausibility bound.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const rows = JSON.parse(readFileSync(path.join(OUT, "reread-evidence.json"), "utf8"));

/**
 * Mirror of production `canonicalizeAlcoholNumber` (field-selection.ts). Kept in
 * the artifact — production is not modified — so re-read numerals are canonicalized
 * exactly as the selected numeral was.
 */
function canonNumber(raw, allowImplicitDecimal) {
  const t = String(raw).trim();
  if (!/^[0-9oOil.,]+$/i.test(t)) return null;
  let v = t.replace(/[o]/gi, "0").replace(/[il]/gi, "1").replace(/,/g, ".");
  if (/^\d{1,2}(?:\.\d{1,2})?$/.test(v)) return { value: Number(v), implicit: false };
  if (allowImplicitDecimal && /^\d{3}$/.test(v))
    return { value: Number(`${v.slice(0, -1)}.${v.slice(-1)}`), implicit: true };
  return null;
}

/** First canonicalizable numeric token in a word list, with its confidence. */
function numeralOf(words) {
  if (!words) return null;
  for (const w of words) {
    const bare = w.text.replace(/%$/, "");
    if (!/\d/.test(bare)) continue;
    const explicitPercent = w.text.endsWith("%");
    const c = canonNumber(bare, true);
    if (!c) continue;
    return {
      token: w.text,
      value: c.value,
      impliedDecimal: c.implicit,
      explicitSeparator: /[.,]/.test(bare),
      explicitPercent,
      confidence: w.conf,
    };
  }
  return null;
}

const eq = (a, b) => a != null && b != null && Math.abs(a - b) < 0.05;

for (const r of rows) {
  if (!r.eligible) continue;
  r.numerals = {
    selected: numeralOf(
      (r.selected.rawText ?? "")
        .split(/\s+/)
        .map((t) => ({ text: t, conf: r.selected.minTokenConfidence })),
    ),
    a8: numeralOf(r.reread.a8.words),
    a11: numeralOf(r.reread.a11.words),
    b7: numeralOf(r.reread.b7.words),
  };
}

/**
 * Each trigger states a perceptual claim, not merely a filter. The rationale is
 * recorded so a trigger cannot be justified by its corpus effect alone.
 */
const TRIGGERS = [
  {
    id: "T1-agree-and-contradict",
    rationale:
      "Two independent recognitions of the same pixels read the same different number: the digits themselves are unstable, so the asserted value is not supported by its own evidence.",
    test: (r) => {
      const { selected, a8, a11 } = r.numerals;
      return (
        !!selected && !!a8 && !!a11 && eq(a8.value, a11.value) && !eq(a8.value, selected.value)
      );
    },
  },
  {
    id: "T2-plus-explicit-decimal-separator",
    rationale:
      "A re-read that shows the decimal point itself has resolved the punctuation, so its disagreement is about digit identity rather than about a lost separator — the dominant re-read artefact.",
    test: (r, t1) => t1 && r.numerals.a8.explicitSeparator && r.numerals.a11.explicitSeparator,
  },
  {
    id: "T3-plus-no-implicit-decimal",
    rationale:
      "If neither re-read needed implicit-decimal recovery, the disagreement is not manufactured by the recovery rule that re-reads most often trip.",
    test: (r, t1) => t1 && !r.numerals.a8.impliedDecimal && !r.numerals.a11.impliedDecimal,
  },
  {
    id: "T4-plus-complete-statement-both",
    rationale:
      "A re-read that assembles a complete, accepted alcohol statement is evidence of equal kind to the selected one; a bare numeral is not.",
    test: (r, t1) => t1 && r.reread.a8.state === "OBSERVED" && r.reread.a11.state === "OBSERVED",
  },
  {
    id: "T5-plus-exceeds-selected-confidence",
    rationale:
      "A contradiction carries weight only when the contradicting recognition is at least as well resolved as the one it contradicts.",
    test: (r, t1) =>
      t1 &&
      r.selected.minTokenConfidence != null &&
      Math.min(r.numerals.a8.confidence, r.numerals.a11.confidence) > r.selected.minTokenConfidence,
  },
  {
    id: "T6-two-independent-geometries",
    rationale:
      "Agreement between a token-union crop and an independently derived full-width line band cannot be an artefact of one crop's framing.",
    test: (r) => {
      const { selected, a8, b7 } = r.numerals;
      return !!selected && !!a8 && !!b7 && eq(a8.value, b7.value) && !eq(a8.value, selected.value);
    },
  },
  {
    id: "T7-cross-psm-without-punctuation-loss",
    rationale:
      "Two different page-segmentation modes agree AND both retain whatever separator the selected reading had, so no punctuation was dropped on the way to the disagreement.",
    test: (r, t1) => {
      if (!t1) return false;
      const selHadSep = !!r.numerals.selected.explicitSeparator;
      return !selHadSep || (r.numerals.a8.explicitSeparator && r.numerals.a11.explicitSeparator);
    },
  },
  {
    id: "T8-plus-inverted-polarity",
    rationale:
      "Light-on-dark artwork is the condition under which the primary full-image pass is measurably least reliable, so a contradiction there is more likely to be real.",
    test: (r, t1) => t1 && r.cropA.stats.invertedPolarity,
  },
  {
    id: "T9-plus-line-crop-also-contradicts",
    rationale:
      "The line band recovers context the full-image pass loses; if it also disagrees, the disagreement survives a change of both framing and segmentation mode.",
    test: (r, t1) => t1 && !!r.numerals.b7 && !eq(r.numerals.b7.value, r.numerals.selected.value),
  },
];

const cls = (r) => r.alcohol?.failureClass ?? null;
const buckets = (ids) => ({
  targetCases: ids.filter((i) => ["approved-wine-018", "approved-wine-037"].includes(i)),
  currentlyCorrect: ids.filter((i) => cls(byId[i]) === "correct"),
  lowConfidence: ids.filter((i) => byId[i].alcohol?.state === "LOW_CONFIDENCE"),
  absentAlcohol: ids.filter((i) => byId[i].alcohol?.present === false),
  ocrRecognitionFailures: ids.filter((i) => cls(byId[i]) === "ocr-recognition-failure"),
});
const byId = Object.fromEntries(rows.map((r) => [r.caseId, r]));

const results = [];
for (const t of TRIGGERS) {
  const fired = [];
  for (const r of rows) {
    if (!r.eligible) continue;
    const t1 = TRIGGERS[0].test(r);
    if (t.test(r, t1)) fired.push(r.caseId);
  }
  const b = buckets(fired);
  results.push({
    id: t.id,
    rationale: t.rationale,
    firedCases: fired,
    ...b,
    falseAlarms: b.currentlyCorrect.map((i) => ({
      caseId: i,
      truth: byId[i].alcohol.acceptablePercents,
      selected: byId[i].numerals.selected?.value ?? null,
      reread: [byId[i].numerals.a8?.value ?? null, byId[i].numerals.a11?.value ?? null],
      rereadText: [byId[i].reread.a8.rawWords, byId[i].reread.a11.rawWords],
    })),
    fires037: fired.includes("approved-wine-037"),
    additionalOcrCalls:
      t.id === "T6-two-independent-geometries"
        ? "2 per accepted case (1 token-union + 1 line band)"
        : "2 per accepted case (2 PSMs on one crop)",
  });
}

const out = {
  note: "Read-only. Re-read values are produced by the real production selector; numerals are canonicalized by a mirror of production canonicalizeAlcoholNumber.",
  eligibleCases: rows.filter((r) => r.eligible).length,
  totalCases: rows.length,
  results,
};
writeFileSync(path.join(OUT, "narrower-trigger-results.json"), JSON.stringify(out, null, 2) + "\n");

for (const r of results) {
  console.log(
    `${r.id.padEnd(38)} fired=${String(r.firedCases.length).padStart(2)} 037=${r.fires037 ? "YES" : "no "} correctFalseAlarms=${r.currentlyCorrect.length} lowConf=${r.lowConfidence.length} absent=${r.absentAlcohol.length} ocrFail=${r.ocrRecognitionFailures.length}`,
  );
  for (const f of r.falseAlarms)
    console.log(
      `      !! ${f.caseId} truth=${JSON.stringify(f.truth)} sel=${f.selected} reread=${JSON.stringify(f.reread)} ${JSON.stringify(f.rereadText)}`,
    );
}
