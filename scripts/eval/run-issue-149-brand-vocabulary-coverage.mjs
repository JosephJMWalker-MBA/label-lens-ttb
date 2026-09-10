/**
 * Issue #149 — semantic vocabulary coverage audit at candidate scope.
 * READ-ONLY. Adds no rule, regex, predicate, vocabulary, weight or model.
 * It replays the EXISTING vocabulary against already-captured candidate and line
 * text to establish where predicates fail and why.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const OUT = "artifacts/issue-149-brand-semantic-vocabulary-coverage";
const SRC = "artifacts/issue-149-brand-semantic-ranking-diagnosis/primary/case-level-arms.json";
mkdirSync(OUT, { recursive: true });

// --- vocabulary copied verbatim from field-selection.ts (read-only replay) ---
const PRODUCER_WORD = /^(?:produced|bottled|made|vinted|cellared|grown|packed|blended)$/i;
const NON_BRAND_LINE =
  /\b(?:alcohol|alc|vol|volume|proof|government|warning|surgeon|general|pregnancy|contains|sulfites|net|contents|ml|milliliters?|liters?|litres?|imported|distributed|appellation|produced|producer|bottled|cellared|grown|vinted|blended|packed|owned|operated|serving|temperature|health|problems?|alcoholic|beverages?|bebida|consumption|impairs?|machinery|defects?|drink|women|should|nacional|byvol)\b/i;
const BRAND_DESIGNATOR = new Set([
  "cellars",
  "cellar",
  "estate",
  "estates",
  "vineyard",
  "vineyards",
  "winery",
  "wineries",
]);
const strip = (t) => t.replace(/[^a-z]/gi, "");
const toks = (v) => v.split(/\s+/).map(strip).filter(Boolean);
const norm = (v) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const rows = JSON.parse(readFileSync(SRC, "utf8"));
const audit = [];
for (const r of rows) {
  const resolved = r.failureType === "RESOLVED_UNDER_SPRIME";
  const winner = r.winnerUnderSPrime ?? null;
  const line = r.winnerLineText ?? "";
  const brand = (r.governedBrand ?? [])[0] ?? "";
  if (winner === null) {
    audit.push({ caseId: r.caseId, resolved, classification: "UNDETERMINABLE" });
    continue;
  }

  const wTok = toks(winner);
  const designator = wTok.filter((t) => BRAND_DESIGNATOR.has(t.toLowerCase()));
  const producerInCandidate = wTok.filter((t) => PRODUCER_WORD.test(t));
  const producerInLine = toks(line).filter((t) => PRODUCER_WORD.test(t));
  const hasByInLine = toks(line).some((t) => /^by$/i.test(t));
  const nonBrandInCandidate = NON_BRAND_LINE.test(winner);
  const nonBrandInLine = NON_BRAND_LINE.test(line);
  const isSuperset = brand && norm(winner).includes(norm(brand)) && norm(winner) !== norm(brand);
  const anyVocabInCandidate =
    designator.length > 0 || producerInCandidate.length > 0 || nonBrandInCandidate;

  let classification, blockingCondition;
  if (resolved) {
    classification = "CONTROL_CORRECT";
    blockingCondition = null;
  } else if (isSuperset && designator.length > 0) {
    classification = "EXISTING_VOCABULARY_PREDICATE_FALSE_NEGATIVE";
    blockingCondition = `BRAND_DESIGNATOR ${JSON.stringify(designator)} has POSITIVE polarity via hasPositiveBrandSignal, so the superset scores brandClass=positive (+2.0) while the exact Brand is only plausible`;
  } else if (nonBrandInCandidate) {
    classification = "EXISTING_VOCABULARY_PREDICATE_FALSE_NEGATIVE";
    blockingCondition = "NON_BRAND_LINE matches the candidate value, yet the candidate was kept";
  } else if (producerInLine.length > 0 && producerInCandidate.length === 0) {
    classification = "CONTEXT_REQUIRED_BUT_NOT_PROPAGATED";
    blockingCondition = `producer word ${JSON.stringify(producerInLine)} present in the line but not in the candidate; isProducerLine is line-scope and also requires a literal "by" (present=${hasByInLine})`;
  } else if (nonBrandInLine && !nonBrandInCandidate) {
    classification = "CONTEXT_REQUIRED_BUT_NOT_PROPAGATED";
    blockingCondition = "NON_BRAND_LINE matches the containing line but not the candidate value";
  } else if (!anyVocabInCandidate) {
    classification = "VOCABULARY_ABSENT";
    blockingCondition = "no existing Brand vocabulary matches any token of the winner";
  } else {
    classification = "AMBIGUOUS_EVEN_WITH_CURRENT_CONTEXT";
    blockingCondition = null;
  }

  audit.push({
    caseId: r.caseId,
    resolved,
    governedBrand: brand,
    winner,
    winnerLine: line,
    isSupersetOfBrand: isSuperset,
    vocabInCandidate: {
      brandDesignator: designator,
      producerWord: producerInCandidate,
      nonBrandLineRegex: nonBrandInCandidate,
    },
    vocabInLine: {
      producerWord: producerInLine,
      hasByToken: hasByInLine,
      nonBrandLineRegex: nonBrandInLine,
    },
    winnerLineKept: r.winnerLineKept ?? null,
    winnerLineReason: r.winnerLineReason ?? null,
    classification,
    blockingCondition,
  });
}

const unresolved = audit.filter((a) => !a.resolved);
const control = audit.filter((a) => a.resolved);
const count = (xs, k) => xs.filter((a) => a.classification === k).length;
const rate = (xs, f) => (xs.length === 0 ? null : +(xs.filter(f).length / xs.length).toFixed(3));

const aggregate = {
  artifact: "aggregate",
  experimentId: "issue-149-brand-semantic-vocabulary-coverage",
  inventorySha256: createHash("sha256")
    .update(readFileSync(`${OUT}/vocabulary-inventory.md`))
    .digest("hex"),
  population: { unresolved: unresolved.length, control: control.length },
  classification: {
    EXISTING_VOCABULARY_PREDICATE_FALSE_NEGATIVE: count(
      unresolved,
      "EXISTING_VOCABULARY_PREDICATE_FALSE_NEGATIVE",
    ),
    CONTEXT_REQUIRED_BUT_NOT_PROPAGATED: count(unresolved, "CONTEXT_REQUIRED_BUT_NOT_PROPAGATED"),
    VOCABULARY_ABSENT: count(unresolved, "VOCABULARY_ABSENT"),
    AMBIGUOUS_EVEN_WITH_CURRENT_CONTEXT: count(unresolved, "AMBIGUOUS_EVEN_WITH_CURRENT_CONTEXT"),
    OTHER: count(unresolved, "OTHER"),
    UNDETERMINABLE: count(unresolved, "UNDETERMINABLE"),
  },
  triggerPrevalence: {
    note: "wrong-winner rate vs correct-Brand rate; a trigger firing equally on both is not usable negative evidence",
    brandDesignatorInCandidate: {
      wrong: rate(unresolved, (a) => (a.vocabInCandidate?.brandDesignator ?? []).length > 0),
      control: rate(control, (a) => (a.vocabInCandidate?.brandDesignator ?? []).length > 0),
    },
    nonBrandRegexInCandidate: {
      wrong: rate(unresolved, (a) => a.vocabInCandidate?.nonBrandLineRegex),
      control: rate(control, (a) => a.vocabInCandidate?.nonBrandLineRegex),
    },
    nonBrandRegexInLine: {
      wrong: rate(unresolved, (a) => a.vocabInLine?.nonBrandLineRegex),
      control: rate(control, (a) => a.vocabInLine?.nonBrandLineRegex),
    },
    producerWordInLine: {
      wrong: rate(unresolved, (a) => (a.vocabInLine?.producerWord ?? []).length > 0),
      control: rate(control, (a) => (a.vocabInLine?.producerWord ?? []).length > 0),
    },
  },
  productionBehaviorChanged: false,
};
writeFileSync(`${OUT}/case-level-audit.json`, `${JSON.stringify(audit, null, 2)}\n`);
writeFileSync(`${OUT}/aggregate.json`, `${JSON.stringify(aggregate, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
