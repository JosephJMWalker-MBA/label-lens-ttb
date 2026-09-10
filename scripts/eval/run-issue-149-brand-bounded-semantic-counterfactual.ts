/**
 * Issue #149 — bounded semantic suppression counterfactual (G / P).
 * Counterfactual only. Default-off seam; production vocabulary and predicates
 * unchanged. Ranking, selection and AUTHORITY come from the real production
 * code path, so authority is measured rather than simulated.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { brandExactMatch, brandNormalizedMatch } from "@/fixtures/eval/metrics";
import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionInput, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import {
  selectBrandObservationWithBoundedSemanticForms,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";

const OUT = "artifacts/issue-149-brand-bounded-semantic-counterfactual";
const POPULATION = "artifacts/brand-evidence-path-diagnosis/cases.json";
const MANIFEST = "src/fixtures/eval/eval-manifest.json";
const ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};

const G = ["gavi", "taburno", "collio", "california", "muscoline italia"];
const P = ["azienda agricola terre sparse", "azienda agricola"];
const TARGETS = new Set([
  "approved-wine-088",
  "approved-wine-089",
  "approved-wine-090",
  "approved-wine-093",
  "approved-wine-105",
  "wine-multi-artifact-05",
  "approved-wine-078",
  "approved-wine-008",
  "approved-wine-009",
  "approved-wine-064",
  "approved-wine-065",
]);

const eq = (v: string | null, acc: string[]) =>
  brandExactMatch(v, acc) || brandNormalizedMatch(v, acc);
const key = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .join(" ");

function finalBrand(
  passes: RegionOcrResult[],
  sel: (r: RegionOcrResult[]) => FieldSelection,
): FieldSelection {
  const primary = sel([passes[0]]);
  return primary.observation.state === "OBSERVED" ? primary : sel(passes);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const population = JSON.parse(readFileSync(POPULATION, "utf8")) as Array<{
    caseId: string;
    truth: { present: boolean; acceptable: string[] };
  }>;
  const manifest =
    (
      JSON.parse(readFileSync(MANIFEST, "utf8")) as {
        records?: Array<{ caseId: string; imagePath: string }>;
      }
    ).records ?? [];
  if (manifest.length === 0) throw new Error("empty manifest");
  const imageById = new Map(manifest.map((r) => [r.caseId, r.imagePath]));

  const ARMS: Array<[string, string[], string[]]> = [
    ["G0P0", [], []],
    ["G1P0", G, []],
    ["G0P1", [], P],
    ["G1P1", G, P],
  ];
  const rows: Record<string, unknown>[] = [];
  const hits: Record<string, unknown>[] = [];

  for (const entry of population) {
    const ip = imageById.get(entry.caseId);
    if (!ip) continue;
    const bytes = readFileSync(ip);
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
    if (!res.ok) {
      rows.push({ caseId: entry.caseId, evaluable: false });
      continue;
    }
    const passes = res.value.debug.passes;
    const acc = entry.truth?.present ? entry.truth.acceptable : [];
    const arms: Record<string, unknown> = {};
    for (const [name, g, p] of ARMS) {
      const sel = finalBrand(passes, (r) =>
        selectBrandObservationWithBoundedSemanticForms(r, g, p),
      );
      const cands = sel.brandDiagnostics?.candidates ?? [];
      const suppressed = cands.filter(
        (c) =>
          !c.kept &&
          (g.includes(key(c.cleanedValue ?? c.rawText)) ||
            p.includes(key(c.cleanedValue ?? c.rawText))),
      );
      arms[name] = {
        state: sel.observation.state,
        value: sel.observation.value,
        correct: brandNormalizedMatch(sel.observation.value, acc),
        suppressedCount: suppressed.length,
        suppressedValues: suppressed.map((c) => c.cleanedValue ?? c.rawText),
      };
      if (name === "G1P1" && suppressed.length > 0 && !TARGETS.has(entry.caseId)) {
        hits.push({
          caseId: entry.caseId,
          brandPresent: entry.truth?.present === true,
          governedBrand: acc,
          suppressed: suppressed.map((c) => c.cleanedValue ?? c.rawText),
          baselineCorrect: (arms["G0P0"] as any).correct,
          treatedCorrect: brandNormalizedMatch(sel.observation.value, acc),
          baselineState: (arms["G0P0"] as any).state,
          treatedState: sel.observation.state,
        });
      }
    }
    // production reference: baseline arm must equal the real analyzer response
    const prodBrand = res.value.response.fields.brandName;
    rows.push({
      caseId: entry.caseId,
      evaluable: true,
      brandPresent: entry.truth?.present === true,
      acceptable: acc,
      productionValue: prodBrand ? ((prodBrand as any).value ?? null) : null,
      productionState: prodBrand ? ((prodBrand as any).state ?? null) : null,
      isTarget: TARGETS.has(entry.caseId),
      arms,
    });
    process.stderr.write(`  ${rows.length}/${population.length}\n`);
  }

  const ev = rows.filter((r) => r.evaluable) as Array<Record<string, any>>;
  const mismatches = ev.filter(
    (r) =>
      (r.productionValue ?? null) !== (r.arms.G0P0.value ?? null) ||
      (r.productionState ?? null) !== (r.arms.G0P0.state ?? null),
  );

  const summarize = (n: string) => {
    const a = (r: any) => r.arms[n];
    return {
      correctSelected: ev.filter((r) => r.brandPresent && a(r).correct).length,
      wrongSelected: ev.filter((r) => r.brandPresent && !a(r).correct && a(r).value).length,
      correctObserved: ev.filter((r) => a(r).state === "OBSERVED" && a(r).correct).length,
      wrongObserved: ev.filter((r) => a(r).state === "OBSERVED" && !a(r).correct).length,
      ambiguous: ev.filter((r) => a(r).state === "AMBIGUOUS").length,
      notObserved: ev.filter((r) => a(r).state === "NOT_OBSERVED").length,
      brandAbsentPositive: ev.filter((r) => !r.brandPresent && a(r).state !== "NOT_OBSERVED")
        .length,
      regressedVsBaseline: ev.filter((r) => r.arms.G0P0.correct && !a(r).correct).length,
      improvedVsBaseline: ev.filter((r) => !r.arms.G0P0.correct && a(r).correct).length,
      totalSuppressedCandidates: ev.reduce((s, r) => s + a(r).suppressedCount, 0),
    };
  };

  const aggregate = {
    artifact: "aggregate",
    experimentId: "issue-149-brand-bounded-semantic-counterfactual",
    switchesSha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "switches.md")))
      .digest("hex"),
    baselineReproduction: {
      casesChecked: ev.length,
      mismatches: mismatches.length,
      exact: mismatches.length === 0,
      note: "baseline arm compared to the real analyzer response value AND state, so authority is reproduced not simulated",
      examples: mismatches.slice(0, 5).map((r) => ({
        caseId: r.caseId,
        production: [r.productionValue, r.productionState],
        baseline: [r.arms.G0P0.value, r.arms.G0P0.state],
      })),
    },
    arms: {
      G0P0: summarize("G0P0"),
      G1P0: summarize("G1P0"),
      G0P1: summarize("G0P1"),
      G1P1: summarize("G1P1"),
    },
    targetCases: ev
      .filter((r) => r.isTarget)
      .map((r) => ({
        caseId: r.caseId,
        governedBrand: r.acceptable?.[0] ?? null,
        baselineWinner: r.arms.G0P0.value,
        baselineCorrect: r.arms.G0P0.correct,
        treatedWinner: r.arms.G1P1.value,
        treatedCorrect: r.arms.G1P1.correct,
        treatedState: r.arms.G1P1.state,
        suppressed: r.arms.G1P1.suppressedValues,
      })),
    outOfTargetTreatmentHits: hits,
    productionBehaviorChanged: false,
  };
  writeFileSync(path.join(OUT, "case-level.json"), `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ baselineReproduction: aggregate.baselineReproduction, arms: aggregate.arms, targets: aggregate.targetCases.length, outOfTargetHits: hits.length }, null, 2)}\n`,
  );
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
