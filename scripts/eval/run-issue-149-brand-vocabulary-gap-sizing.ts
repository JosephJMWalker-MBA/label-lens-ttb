/**
 * Issue #149 — vocabulary gap sizing. READ-ONLY.
 * Captures all kept Brand candidates across the frozen corpus so collisions are
 * measured against real candidate evidence, not only against governed truth.
 * Adds no vocabulary, designs no predicate.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionInput } from "@/pipeline/extractor/extractor.types";
import { selectBrandObservationWithCompleteFilterDiagnostics } from "@/pipeline/extractor/field-selection";

const OUT = "artifacts/issue-149-brand-semantic-vocabulary-gap-sizing";
const POPULATION = "artifacts/brand-evidence-path-diagnosis/cases.json";
const AUDIT =
  "artifacts/issue-149-brand-semantic-vocabulary-coverage/primary/case-level-audit.json";
const MANIFEST = "src/fixtures/eval/eval-manifest.json";

const ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
const norm = (v: string): string =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const tokens = (v: string): string[] =>
  norm(v)
    .split(" ")
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

/** Frozen phrase -> concept assignment, transcribed from method.md. */
const CONCEPT: Record<string, string> = {
  vanni: "OCR_FRAGMENT_OF_BRAND",
  "juliette vril": "OCR_FRAGMENT_OF_BRAND",
  "azienda agricola terre sparse": "PRODUCER_ENTITY_DESIGNATION",
  "azienda agricola": "PRODUCER_ENTITY_DESIGNATION",
  "indigenous blend": "PRODUCT_DESCRIPTOR",
  "red wine blend curious": "PRODUCT_DESCRIPTOR",
  winemaker: "WINEMAKING_ROLE",
  "tre fichi": "OTHER_PROPER_NAME",
  "muscoline-italia": "APPELLATION_OR_GEOGRAPHY",
  "buta distributors inc": "DISTRIBUTOR_IMPORTER",
  gavi: "APPELLATION_OR_GEOGRAPHY",
  taburno: "APPELLATION_OR_GEOGRAPHY",
  california: "APPELLATION_OR_GEOGRAPHY",
  collio: "APPELLATION_OR_GEOGRAPHY",
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const population = JSON.parse(readFileSync(POPULATION, "utf8")) as Array<{
    caseId: string;
    truth: { present: boolean; acceptable: string[] };
  }>;
  const audit = JSON.parse(readFileSync(AUDIT, "utf8")) as Array<{
    caseId: string;
    resolved: boolean;
    classification: string;
    winner?: string;
    governedBrand?: string;
  }>;
  const eighteen = audit.filter((a) => !a.resolved && a.classification === "VOCABULARY_ABSENT");
  if (eighteen.length !== 18) throw new Error(`expected 18, found ${eighteen.length}`);
  const controls = audit.filter((a) => a.resolved);

  const manifest =
    (
      JSON.parse(readFileSync(MANIFEST, "utf8")) as {
        records?: Array<{ caseId: string; imagePath: string }>;
      }
    ).records ?? [];
  if (manifest.length === 0) throw new Error("empty manifest");
  const imageById = new Map(manifest.map((r) => [r.caseId, r.imagePath]));

  // --- capture all kept Brand candidates across the frozen corpus ---
  const keptCandidates: Array<{ caseId: string; value: string; brandPresent: boolean }> = [];
  for (const entry of population) {
    const p = imageById.get(entry.caseId);
    if (!p) continue;
    const bytes = readFileSync(p);
    const input: ExtractionInput = {
      imageBytes: new Uint8Array(bytes),
      artifactRef: entry.caseId,
      derivativeSha256: createHash("sha256").update(bytes).digest("hex"),
      processedAt: "2026-07-12T00:00:00Z",
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: ENGINE,
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
    };
    const res = await extractLabelEvidenceDetailed(input);
    if (!res.ok) continue;
    const sel = selectBrandObservationWithCompleteFilterDiagnostics(
      res.value.debug.passes.filter((x) => x.fieldEligibility.brand),
    );
    for (const c of sel.brandDiagnostics?.candidates ?? []) {
      if (c.kept)
        keptCandidates.push({
          caseId: entry.caseId,
          value: c.cleanedValue ?? c.rawText,
          brandPresent: entry.truth?.present === true,
        });
    }
  }

  const governedBrands = population
    .filter((p) => p.truth?.present)
    .flatMap((p) => p.truth.acceptable);
  const brandAbsentCases = new Set(
    population.filter((p) => !p.truth?.present).map((p) => p.caseId),
  );
  const controlBrands = controls.map((c) => c.governedBrand ?? "").filter(Boolean);

  // --- lexical + concept tables ---
  const phrases = eighteen.map((c) => norm(c.winner ?? ""));
  const phraseFreq: Record<string, number> = {};
  for (const p of phrases) phraseFreq[p] = (phraseFreq[p] ?? 0) + 1;
  const conceptFreq: Record<string, number> = {};
  for (const p of phrases) {
    const k = CONCEPT[p];
    if (!k) throw new Error(`unmapped phrase: ${p}`);
    conceptFreq[k] = (conceptFreq[k] ?? 0) + 1;
  }
  const conceptTokens: Record<string, Set<string>> = {};
  for (const p of phrases) {
    const k = CONCEPT[p];
    conceptTokens[k] = conceptTokens[k] ?? new Set();
    for (const t of tokens(p)) conceptTokens[k].add(t);
  }

  const collide = (needleTokens: string[], corpus: string[]) => {
    const exact = corpus.filter((v) => needleTokens.join(" ") === tokens(v).join(" ")).length;
    const token = corpus.filter((v) => {
      const s = new Set(tokens(v));
      return needleTokens.some((t) => s.has(t));
    }).length;
    return { exact, token, total: corpus.length };
  };

  const phraseCollisions = Object.keys(phraseFreq).map((p) => ({
    phrase: p,
    concept: CONCEPT[p],
    occurrencesAmong18: phraseFreq[p],
    vsGovernedBrands: collide(tokens(p), governedBrands),
    vsControlBrands: collide(tokens(p), controlBrands),
    vsAllKeptCandidates: collide(
      tokens(p),
      keptCandidates.map((c) => c.value),
    ),
    vsBrandAbsentCandidates: collide(
      tokens(p),
      keptCandidates.filter((c) => brandAbsentCases.has(c.caseId)).map((c) => c.value),
    ),
  }));

  const conceptCollisions = Object.entries(conceptTokens).map(([concept, set]) => ({
    concept,
    cases: conceptFreq[concept],
    vocabularyTokens: [...set],
    tokenCollisionInGovernedBrands: governedBrands.filter((v) => {
      const s = new Set(tokens(v));
      return [...set].some((t) => s.has(t));
    }).length,
    governedBrandTotal: governedBrands.length,
    tokenCollisionInKeptCandidates: keptCandidates.filter((c) => {
      const s = new Set(tokens(c.value));
      return [...set].some((t) => s.has(t));
    }).length,
    keptCandidateTotal: keptCandidates.length,
  }));

  const sortedConcepts = Object.entries(conceptFreq).sort((a, b) => b[1] - a[1]);
  const cum = (n: number) => sortedConcepts.slice(0, n).reduce((a, [, v]) => a + v, 0);

  const aggregate = {
    artifact: "aggregate",
    experimentId: "issue-149-brand-semantic-vocabulary-gap-sizing",
    methodSha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "method.md")))
      .digest("hex"),
    population: {
      vocabularyAbsent: 18,
      controls: controls.length,
      keptCandidatesCaptured: keptCandidates.length,
      governedBrandValues: governedBrands.length,
    },
    distinctExactPhrases: Object.keys(phraseFreq).length,
    distinctConcepts: Object.keys(conceptFreq).length,
    conceptFrequency: Object.fromEntries(sortedConcepts),
    coverageCurve: { top1: cum(1), top2: cum(2), top3: cum(3), top5: cum(5), of: 18 },
    singletonConcepts: sortedConcepts.filter(([, v]) => v === 1).map(([k]) => k),
    phraseCollisions,
    conceptCollisions,
    keptSeparate: {
      existingVocabularyPolarityCases: ["approved-wine-012", "approved-wine-110"],
      visionEarnedCase: "m-cellars-baseline",
    },
    productionBehaviorChanged: false,
  };
  writeFileSync(
    path.join(OUT, "case-level-lexicon.json"),
    `${JSON.stringify(
      eighteen.map((c) => ({
        caseId: c.caseId,
        governedBrand: c.governedBrand,
        winner: c.winner,
        normalized: norm(c.winner ?? ""),
        concept: CONCEPT[norm(c.winner ?? "")],
        phraseFrequency: phraseFreq[norm(c.winner ?? "")],
        conceptFrequency: conceptFreq[CONCEPT[norm(c.winner ?? "")]],
      })),
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ ...aggregate, phraseCollisions: "see aggregate.json", conceptCollisions }, null, 2)}\n`,
  );
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
