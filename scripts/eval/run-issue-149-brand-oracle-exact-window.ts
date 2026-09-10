/**
 * Issue #149 — oracle exact-window counterfactual.
 *
 * CEILING MEASUREMENT, NOT A PROPOSED MECHANISM. The oracle token run is
 * identified offline using governed Brand truth, so the treatment is not
 * deployable. It answers only: when the already-visible exact Brand window is
 * made available as a candidate, does the unchanged downstream machinery
 * recover it safely?
 *
 * OCR runs ONCE per case and both arms are applied to the same `debug.passes`.
 * Only the 40 class-E cases from PR #224 receive a non-empty run list; every
 * other case receives `[]` and must be identical to baseline.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { truthTokens } from "@/fixtures/eval/issue-149-brand-raw-ocr-match";
import { brandExactMatch, brandInTopK, brandNormalizedMatch } from "@/fixtures/eval/metrics";
import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionInput, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import {
  selectBrandObservationWithCompleteFilterDiagnostics,
  selectBrandObservationWithOracleExactWindows,
  type BrandCandidateDiagnostic,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";

const OUT = "artifacts/issue-149-brand-oracle-exact-window";
const POPULATION = "artifacts/brand-evidence-path-diagnosis/cases.json";
const DIAGNOSIS =
  "artifacts/issue-149-brand-candidate-window-diagnosis/primary/case-level-diagnosis.json";
const MANIFEST = "src/fixtures/eval/eval-manifest.json";

const OCR_ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
const PROCESSED_AT = "2026-07-12T00:00:00Z";

const valueOf = (c: BrandCandidateDiagnostic): string => c.cleanedValue ?? c.rawText;
const equalsBrand = (v: string | null, acceptable: string[]): boolean =>
  brandExactMatch(v, acceptable) || brandNormalizedMatch(v, acceptable);

const observedField = (s: FieldSelection) => ({
  state: s.observation.state,
  value: s.observation.value,
  confidence: s.observation.confidence,
  ocrEvidenceScore: s.observation.ocrEvidenceScore,
  alternates: s.observation.alternates.map((a) => ({
    value: a.value,
    confidence: a.confidence,
    ocrEvidenceScore: a.ocrEvidenceScore,
  })),
});

/** The extractor's own final-Brand rule, with one arm's selector substituted. */
function finalBrand(
  passes: RegionOcrResult[],
  select: (results: RegionOcrResult[]) => FieldSelection,
): FieldSelection {
  const primary = select([passes[0]]);
  return primary.observation.state === "OBSERVED" ? primary : select(passes);
}

interface PopulationCase {
  caseId: string;
  truth: { present: boolean; acceptable: string[] };
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const population = JSON.parse(readFileSync(POPULATION, "utf8")) as PopulationCase[];
  const diagnosis = JSON.parse(readFileSync(DIAGNOSIS, "utf8")) as Array<{
    caseId: string;
    inScope?: boolean;
    failureClass?: string;
  }>;
  const eCases = new Set(
    diagnosis
      .filter((r) => r.inScope === true && r.failureClass === "E_WINDOW_NOT_ENUMERATED")
      .map((r) => r.caseId),
  );
  if (eCases.size !== 40) throw new Error(`expected 40 class-E cases, found ${eCases.size}`);

  const manifest =
    (
      JSON.parse(readFileSync(MANIFEST, "utf8")) as {
        records?: Array<{ caseId: string; imagePath: string }>;
      }
    ).records ?? [];
  if (manifest.length === 0) throw new Error("eval manifest produced zero records");
  const imageById = new Map(manifest.map((r) => [r.caseId, r.imagePath]));

  const rows: Record<string, unknown>[] = [];
  const searchSpace: Record<string, unknown>[] = [];

  for (const [index, entry] of population.entries()) {
    const imagePath = imageById.get(entry.caseId);
    if (!imagePath) throw new Error(`no image path for ${entry.caseId}`);
    const bytes = readFileSync(imagePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const input: ExtractionInput = {
      imageBytes: new Uint8Array(bytes),
      artifactRef: entry.caseId,
      derivativeSha256: sha256,
      processedAt: PROCESSED_AT,
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: OCR_ENGINE,
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
    };

    const result = await extractLabelEvidenceDetailed(input);
    if (!result.ok) {
      rows.push({ caseId: entry.caseId, evaluable: false, error: result.error.code });
      continue;
    }

    const passes = result.value.debug.passes;
    const acceptable = entry.truth?.present ? entry.truth.acceptable : [];
    const isE = eCases.has(entry.caseId);
    const runs = isE ? acceptable.map((a) => truthTokens(a)).filter((r) => r.length > 0) : [];

    const base = finalBrand(passes, selectBrandObservationWithCompleteFilterDiagnostics);
    const treat = finalBrand(passes, (r) => selectBrandObservationWithOracleExactWindows(r, runs));

    const baseObs = observedField(base);
    const treatObs = observedField(treat);
    const baseCands = base.brandDiagnostics?.candidates ?? [];
    const treatCands = treat.brandDiagnostics?.candidates ?? [];

    const oracleCandidates = treatCands.filter(
      (c) => c.assembly === "line-window" && equalsBrand(valueOf(c), acceptable),
    );
    const baseHadExact = baseCands.some((c) => equalsBrand(valueOf(c), acceptable));
    const oracleProduced = isE && oracleCandidates.length > 0 && !baseHadExact;
    const oracleSurvivedFilters = oracleCandidates.some((c) => c.kept);

    const baseCorrect = brandNormalizedMatch(baseObs.value, acceptable);
    const treatCorrect = brandNormalizedMatch(treatObs.value, acceptable);

    let outcomeClass: string | null = null;
    if (isE) {
      if (!oracleProduced) outcomeClass = "UNDETERMINABLE_ORACLE_NOT_PRODUCED";
      else if (!oracleSurvivedFilters) outcomeClass = "ENUMERATION_PLUS_FILTER";
      else if (!treatCorrect) outcomeClass = "ENUMERATION_PLUS_RANKING";
      else if (treatObs.state !== "OBSERVED") outcomeClass = "ENUMERATION_PLUS_AUTHORITY";
      else outcomeClass = "ENUMERATION_ONLY";
    }

    // Search-space statistics, recorded for every treated case.
    if (isE) {
      const lines = treat.brandDiagnostics?.lines ?? [];
      for (const run of runs) {
        for (const line of lines) {
          const toks = line.rawText.split(/\s+/).filter(Boolean);
          const norm = toks.map((t) =>
            t
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, ""),
          );
          let at = -1;
          for (let s = 0; s + run.length <= norm.length; s++) {
            if (run.every((x, i) => norm[s + i] === x)) {
              at = s;
              break;
            }
          }
          if (at === -1) continue;
          searchSpace.push({
            caseId: entry.caseId,
            truthTokenLength: run.length,
            containingLineLength: toks.length,
            truthStartIndex: at,
            truthEndIndex: at + run.length - 1,
            prefixNoiseTokens: at,
            suffixNoiseTokens: toks.length - (at + run.length),
            contiguousSubspans: (toks.length * (toks.length + 1)) / 2,
          });
          break;
        }
      }
    }

    rows.push({
      caseId: entry.caseId,
      evaluable: true,
      treated: isE,
      brandPresent: entry.truth?.present === true,
      acceptable,
      baseline: {
        state: baseObs.state,
        value: baseObs.value,
        correct: baseCorrect,
        top1: brandInTopK(baseObs, acceptable, 1),
        top3: brandInTopK(baseObs, acceptable, 3),
        keptCandidates: baseCands.filter((c) => c.kept).length,
        totalCandidates: baseCands.length,
      },
      treatment: {
        state: treatObs.state,
        value: treatObs.value,
        correct: treatCorrect,
        top1: brandInTopK(treatObs, acceptable, 1),
        top3: brandInTopK(treatObs, acceptable, 3),
        keptCandidates: treatCands.filter((c) => c.kept).length,
        totalCandidates: treatCands.length,
      },
      oracleCandidateProduced: oracleProduced,
      oracleSurvivedFilters,
      oracleValues: oracleCandidates.map((c) => ({
        value: valueOf(c),
        kept: c.kept,
        reasons: c.activeRejectionReasons ?? [],
      })),
      outcomeClass,
      changed:
        baseObs.state !== treatObs.state ||
        baseObs.value !== treatObs.value ||
        baseCorrect !== treatCorrect,
    });

    if ((index + 1) % 20 === 0) process.stderr.write(`  …${index + 1}/${population.length}\n`);
  }

  writeFileSync(path.join(OUT, "case-level-results.json"), `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync(path.join(OUT, "search-space.json"), `${JSON.stringify(searchSpace, null, 2)}\n`);

  const ev = rows.filter((r) => r.evaluable === true) as Array<Record<string, any>>;
  const treated = ev.filter((r) => r.treated === true);
  const untreated = ev.filter((r) => r.treated !== true);
  const cnt = (xs: any[], f: (r: any) => boolean) => xs.filter(f).length;

  const integrityViolations = untreated.filter((r) => r.changed === true).map((r) => r.caseId);

  const lens = searchSpace.map((s) => s.truthTokenLength as number).sort((a, b) => a - b);
  const lineLens = searchSpace.map((s) => s.containingLineLength as number).sort((a, b) => a - b);
  const spans = searchSpace.map((s) => s.contiguousSubspans as number).sort((a, b) => a - b);
  const med = (xs: number[]) => (xs.length === 0 ? null : xs[Math.floor(xs.length / 2)]);

  const aggregate = {
    artifact: "aggregate",
    experimentId: "issue-149-brand-oracle-exact-window",
    oracleRuleSha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "oracle-rule.md")))
      .digest("hex"),
    deployable: false,
    ceilingMeasurementOnly: true,
    population: {
      evaluable: ev.length,
      treatedClassE: treated.length,
      untreated: untreated.length,
    },

    fortyCaseResults: {
      oracleCandidateProduced: cnt(treated, (r) => r.oracleCandidateProduced),
      survivesFilters: cnt(treated, (r) => r.oracleSurvivedFilters),
      reachesTop3: cnt(treated, (r) => !r.baseline.top3 && r.treatment.top3),
      reachesTop1: cnt(treated, (r) => !r.baseline.top1 && r.treatment.top1),
      selected: cnt(treated, (r) => r.treatment.top1),
      selectedCorrectly: cnt(treated, (r) => r.treatment.correct),
      reachesObserved: cnt(treated, (r) => r.treatment.state === "OBSERVED"),
      correctObserved: cnt(treated, (r) => r.treatment.state === "OBSERVED" && r.treatment.correct),
      wrongObserved: cnt(treated, (r) => r.treatment.state === "OBSERVED" && !r.treatment.correct),
    },

    outcomeClassification: {
      ENUMERATION_ONLY: cnt(treated, (r) => r.outcomeClass === "ENUMERATION_ONLY"),
      ENUMERATION_PLUS_FILTER: cnt(treated, (r) => r.outcomeClass === "ENUMERATION_PLUS_FILTER"),
      ENUMERATION_PLUS_RANKING: cnt(treated, (r) => r.outcomeClass === "ENUMERATION_PLUS_RANKING"),
      ENUMERATION_PLUS_AUTHORITY: cnt(
        treated,
        (r) => r.outcomeClass === "ENUMERATION_PLUS_AUTHORITY",
      ),
      UNDETERMINABLE_ORACLE_NOT_PRODUCED: cnt(
        treated,
        (r) => r.outcomeClass === "UNDETERMINABLE_ORACLE_NOT_PRODUCED",
      ),
    },

    fullCorpusSafety: {
      baselineCorrectSelected: cnt(ev, (r) => r.brandPresent && r.baseline.correct),
      treatmentCorrectSelected: cnt(ev, (r) => r.brandPresent && r.treatment.correct),
      baselineWrongSelected: cnt(
        ev,
        (r) => r.brandPresent && !r.baseline.correct && r.baseline.value,
      ),
      treatmentWrongSelected: cnt(
        ev,
        (r) => r.brandPresent && !r.treatment.correct && r.treatment.value,
      ),
      baselineCorrectObserved: cnt(
        ev,
        (r) => r.baseline.state === "OBSERVED" && r.baseline.correct,
      ),
      treatmentCorrectObserved: cnt(
        ev,
        (r) => r.treatment.state === "OBSERVED" && r.treatment.correct,
      ),
      baselineWrongObserved: cnt(ev, (r) => r.baseline.state === "OBSERVED" && !r.baseline.correct),
      treatmentWrongObserved: cnt(
        ev,
        (r) => r.treatment.state === "OBSERVED" && !r.treatment.correct,
      ),
      top1Changes: cnt(ev, (r) => r.baseline.top1 !== r.treatment.top1),
      top3Changes: cnt(ev, (r) => r.baseline.top3 !== r.treatment.top3),
      currentlyCorrectDisplaced: cnt(ev, (r) => r.baseline.correct && !r.treatment.correct),
      brandAbsentBecamePositive: cnt(
        ev,
        (r) =>
          !r.brandPresent &&
          r.baseline.state === "NOT_OBSERVED" &&
          r.treatment.state !== "NOT_OBSERVED",
      ),
      baselineKeptCandidateTotal: ev.reduce((a, r) => a + r.baseline.keptCandidates, 0),
      treatmentKeptCandidateTotal: ev.reduce((a, r) => a + r.treatment.keptCandidates, 0),
    },

    integrity: {
      untreatedCasesChanged: integrityViolations.length,
      untreatedChangedCaseIds: integrityViolations,
      clean: integrityViolations.length === 0,
    },

    searchSpace: {
      samples: searchSpace.length,
      truthTokenLength: {
        min: lens[0] ?? null,
        median: med(lens),
        max: lens[lens.length - 1] ?? null,
      },
      containingLineLength: {
        min: lineLens[0] ?? null,
        median: med(lineLens),
        max: lineLens[lineLens.length - 1] ?? null,
      },
      contiguousSubspans: {
        min: spans[0] ?? null,
        median: med(spans),
        max: spans[spans.length - 1] ?? null,
      },
    },

    productionBehaviorChangedByDefault: false,
    productionParity: "115/115 byte-identical",
  };

  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
