/**
 * Phase 2 — READ-ONLY brand-region coverage probe.
 *
 * Re-executes exactly the OCR passes production already plans, on unmodified
 * production code, for the approved primary cases and the pre-registered
 * controls. It changes no planning, no configuration, and no production
 * behaviour; it re-runs OCR only because the committed corpus report truncates
 * word geometry to 25 samples per region (see code-path.md).
 *
 * Three layers are measured and kept separate:
 *   1. pass-image coverage      — does the pass crop contain the annotated region
 *   2. OCR-word geometry        — do recognised words land inside the region
 *   3. recognition / segmentation behaviour inside the region
 *
 * Approved annotations are used only to evaluate. They never steer OCR, pass
 * planning, crops, or extraction.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import { selectBrandObservation } from "@/pipeline/extractor/field-selection";
import { loadCaseImage, loadEvalManifest } from "@/fixtures/eval/eval-loader";
import { EVAL_ADAPTER } from "@/fixtures/eval/eval-harness";
import { normalizeKey } from "@/fixtures/eval/metrics";
import type { OcrWord } from "@/pipeline/extractor/extractor.types";

const OUT = process.argv[2];
/** Fixed before measurement; not tunable afterwards. */
const COVERAGE_THRESHOLD = 0.9;
const EVAL_PROCESSED_AT = "2026-07-12T00:00:00Z";

type Rect = { x: number; y: number; width: number; height: number };

function extractionInput(caseId: string, sha256: string) {
  return {
    imageBytes: new Uint8Array(),
    artifactRef: caseId,
    derivativeSha256: sha256,
    processedAt: EVAL_PROCESSED_AT,
    extractionAdapterId: EVAL_ADAPTER.id,
    extractionAdapterVersion: EVAL_ADAPTER.version,
    ocrEngine: {
      kind: "ocr" as const,
      engineId: "tesseract.js",
      engineVersion: "7.0.0",
      modelId: "eng",
    },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

const area = (r: Rect) => Math.max(0, r.width) * Math.max(0, r.height);
function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, x1 - x), height: Math.max(0, y1 - y) };
}
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const inside = (p: { x: number; y: number }, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** Locate the contiguous word run whose joined text equals a reported line. */
function wordsForLineText(words: OcrWord[], rawText: string): OcrWord[] | null {
  for (let s = 0; s < words.length; s++) {
    let joined = "";
    for (let e = s; e < words.length; e++) {
      joined = e === s ? words[e].text : `${joined} ${words[e].text}`;
      if (joined === rawText) return words.slice(s, e + 1);
      if (joined.length > rawText.length) break;
    }
  }
  return null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const approved = JSON.parse(readFileSync(path.join(OUT, "approved-regions.json"), "utf8"));
  const controls = JSON.parse(readFileSync(path.join(OUT, "controls.json"), "utf8"));
  const manifest = loadEvalManifest();

  const primaryIds: string[] = approved.approvedRegions.map((r: any) => r.caseId);
  const controlIds: string[] = controls.controls.map((c: any) => c.caseId);
  const regionByCase = new Map<string, { label: string; region: Rect }[]>(
    approved.approvedRegions.map((r: any) => [r.caseId, r.occurrences]),
  );

  const passCoverage: any[] = [];
  const wordOverlap: any[] = [];
  const cases: any[] = [];

  for (const caseId of [...primaryIds, ...controlIds]) {
    const evalCase = manifest.cases.find((c) => c.caseId === caseId)!;
    const { bytes, sha256 } = loadCaseImage(evalCase);
    const result = await extractLabelEvidenceDetailed({
      ...extractionInput(caseId, sha256),
      imageBytes: bytes,
    });
    if (!result.ok) continue;
    const passes = result.value.debug.passes.filter((p) => p.fieldEligibility.brand);
    const finalBrand = result.value.debug.finalSelections.brand;
    const contributingPassIds = new Set([
      ...(finalBrand.supportingPassIds ?? []),
      ...(finalBrand.source ? [finalBrand.source.passId] : []),
      ...(finalBrand.brandDiagnostics?.candidates ?? [])
        .filter((c: any) => c.kept)
        .map((c: any) => c.candidateProvenance.passId),
    ]);

    const isPrimary = primaryIds.includes(caseId);
    const acceptable = evalCase.brand.acceptable;
    // Controls have no approved annotation; their region is derived from the
    // brand's own recorded geometry only for distribution comparison, and is
    // marked as such. Primary cases use the human-approved annotation.
    const occurrences =
      regionByCase.get(caseId) ??
      (() => {
        const g = (finalBrand.observation as any).geometry as Rect | undefined;
        return g ? [{ label: "derived-from-machine-geometry (control only)", region: g }] : [];
      })();
    if (occurrences.length === 0) continue;

    const perOccurrence: any[] = [];
    for (const occ of occurrences) {
      const region = occ.region;
      const regionArea = area(region);
      const passRows: any[] = [];

      for (const pass of passes) {
        const t = pass.transform;
        const footprint: Rect = {
          x: t.crop.left,
          y: t.crop.top,
          width: t.crop.width,
          height: t.crop.height,
        };
        const covered = area(intersect(region, footprint)) / Math.max(1, regionArea);

        // Layer 2 — word geometry over the region (canonical frame).
        const lineSel = selectBrandObservation([pass]);
        const lineList = lineSel.brandDiagnostics?.lines ?? [];
        const lineOfWord = new Map<OcrWord, { index: number; text: string }>();
        lineList.forEach((l, i) => {
          const ws = wordsForLineText(pass.words, l.rawText);
          if (ws) for (const w of ws) lineOfWord.set(w, { index: i, text: l.rawText });
        });

        const hits: any[] = [];
        for (const w of pass.words) {
          const g = w.originalGeometry;
          if (!g) continue;
          const box: Rect = { x: g.x, y: g.y, width: g.width, height: g.height };
          const inter = area(intersect(region, box));
          const centreInside = inside(centre(box), region);
          const halfOverlap = inter / Math.max(1, area(box)) >= 0.5;
          if (!centreInside && !halfOverlap) continue;
          const ln = lineOfWord.get(w);
          hits.push({
            text: w.text,
            confidence: Math.round(w.rawConfidence),
            geometry: box,
            centreInsideRegion: centreInside,
            atLeastHalfOfBoxInRegion: halfOverlap,
            fractionOfBoxInRegion: Number((inter / Math.max(1, area(box))).toFixed(3)),
            lineIndex: ln?.index ?? null,
            lineText: ln?.text ?? null,
            wordAspect: Number((box.width / Math.max(1, box.height)).toFixed(2)),
          });
        }

        passRows.push({
          passId: pass.passId,
          passKind: pass.passKind,
          triggerReasons: pass.triggerReasons,
          rotate: t.rotate,
          scale: t.scale,
          footprint,
          transformedSize: pass.transformedSize,
          coverageRatio: Number(covered.toFixed(4)),
          geometricallyCovers: covered >= COVERAGE_THRESHOLD,
          regionInCanonicalPx: { width: region.width, height: region.height },
          regionAfterTransformPx: {
            width: Number((region.width * t.scale).toFixed(1)),
            height: Number((region.height * t.scale).toFixed(1)),
          },
          overlappingWordCount: hits.length,
          overlappingWords: hits,
          overlappingTextCarriesBrandEvidence: hits.some((h) =>
            acceptable.some((a) => {
              const n = normalizeKey(a);
              return (
                n.length > 2 && normalizeKey(h.text).length > 0 && n.includes(normalizeKey(h.text))
              );
            }),
          ),
          contributedToFinalBrandCandidates: contributingPassIds.has(pass.passId),
        });
      }

      perOccurrence.push({ label: occ.label, region, regionArea, passes: passRows });
      passCoverage.push({
        caseId,
        occurrence: occ.label,
        region,
        passes: passRows.map((p) => ({
          passId: p.passId,
          passKind: p.passKind,
          rotate: p.rotate,
          scale: p.scale,
          footprint: p.footprint,
          coverageRatio: p.coverageRatio,
          geometricallyCovers: p.geometricallyCovers,
          overlappingWordCount: p.overlappingWordCount,
          contributedToFinalBrandCandidates: p.contributedToFinalBrandCandidates,
        })),
      });
      for (const p of passRows)
        for (const h of p.overlappingWords)
          wordOverlap.push({ caseId, occurrence: occ.label, passId: p.passId, ...h });
    }

    cases.push({
      caseId,
      population: isPrimary ? "primary" : "control",
      strata: evalCase.strata,
      fixtureBrand: acceptable,
      imageSize: {
        width: result.value.debug.decoded.width,
        height: result.value.debug.decoded.height,
      },
      machineSelectedBrand: finalBrand.observation.value,
      machineState: finalBrand.observation.state,
      executedPassCount: passes.length,
      occurrences: perOccurrence,
    });
    process.stdout.write(
      `  ${caseId} (${isPrimary ? "primary" : "control"}) — ${passes.length} passes\n`,
    );
  }

  writeFileSync(path.join(OUT, "cases.json"), JSON.stringify(cases, null, 2) + "\n");
  writeFileSync(
    path.join(OUT, "pass-coverage.json"),
    JSON.stringify({ coverageThreshold: COVERAGE_THRESHOLD, rows: passCoverage }, null, 2) + "\n",
  );
  writeFileSync(
    path.join(OUT, "word-overlap.json"),
    JSON.stringify({ rows: wordOverlap }, null, 2) + "\n",
  );
  console.log(
    `primary: ${cases.filter((c) => c.population === "primary").length} | control: ${cases.filter((c) => c.population === "control").length}`,
  );
}

void main();
