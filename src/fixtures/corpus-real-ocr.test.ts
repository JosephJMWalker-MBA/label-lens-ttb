// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extractLabelEvidence } from "@/pipeline/extractor/extractor";
import type { ExtractionInput } from "@/pipeline/extractor/extractor.types";

import { validateFixtureManifest } from "./fixture-manifest.schema";
import { CORPUS_DIR, loadCorpusIndex, realOcrEntries } from "./corpus-index.load";
import type { CorpusEntry } from "./corpus-index.types";

/**
 * Real-OCR regression for every corpus fixture enabled for OCR. Expectations
 * come from the corpus index (bounded state sets and required tokens), never
 * from the extractor's inputs. Kept small on purpose: only fixtures explicitly
 * enabled for real OCR run here, to bound CI runtime.
 */

const OCR_TIMEOUT = 120_000;

function extractionInput(bytes: Uint8Array, entry: CorpusEntry, sha256: string): ExtractionInput {
  return {
    imageBytes: bytes,
    artifactRef: entry.fixtureId,
    derivativeSha256: sha256,
    processedAt: "2026-07-11T00:00:00Z",
    extractionAdapterId: "local-two-field-extractor",
    extractionAdapterVersion: "1.0.0",
    ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

const enabled = realOcrEntries(loadCorpusIndex());

describe("corpus real-OCR regression", () => {
  it("keeps the real-OCR corpus small enough for CI", () => {
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.length).toBeLessThanOrEqual(3);
  });

  for (const entry of enabled) {
    describe(entry.fixtureId, () => {
      const dir = join(CORPUS_DIR, entry.fixtureDir!);
      const manifestResult = validateFixtureManifest(
        JSON.parse(readFileSync(join(dir, entry.manifestFilename!), "utf8")),
      );
      if (!manifestResult.ok) throw new Error("manifest invalid");
      const derivative = manifestResult.value.sourceChain.derivatives.find(
        (d) => d.filename === entry.imageFilename,
      )!;
      const bytes = new Uint8Array(readFileSync(join(dir, entry.imageFilename!)));
      // Real-OCR entries are always annotated (never null expectations).
      const exp = entry.expectations!;

      it(
        "extracts bounded observations that match the corpus expectations",
        async () => {
          const result = await extractLabelEvidence(
            extractionInput(bytes, entry, derivative.sha256),
          );
          // Expected extraction outcome (success vs a typed failure code).
          if (exp.extractionOutcome === "success") {
            expect(result.ok).toBe(true);
          } else {
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.error.code).toBe(exp.extractionOutcome.failureCode);
            }
            return;
          }
          if (!result.ok) return;
          const { brandName, alcoholStatement } = result.value.fields;

          // Observation states belong to the allowed bounded sets.
          expect(exp.brandStateAllowed).toContain(brandName.state);
          expect(exp.alcoholStateAllowed).toContain(alcoholStatement.state);

          // Required alcohol tokens and any exact parsed value are recovered.
          for (const token of exp.requiredAlcoholTokens) {
            expect(alcoholStatement.value ?? "").toContain(token);
          }
          if (exp.alcoholParsedValue !== null) {
            expect(alcoholStatement.value).toBe(exp.alcoholParsedValue);
          }

          // Forbidden brand candidates are never selected as the value.
          for (const forbidden of exp.forbiddenBrandCandidates) {
            expect(brandName.value).not.toBe(forbidden);
          }

          // Provenance ties the observations to the exact tested image.
          expect(result.value.provenance.derivativeSha256).toBe(derivative.sha256);

          // Any present observation geometry is bounded.
          for (const field of [brandName, alcoholStatement]) {
            if (field.geometry) {
              expect(field.geometry.width).toBeGreaterThan(0);
              expect(field.geometry.height).toBeGreaterThan(0);
            }
          }
        },
        OCR_TIMEOUT,
      );

      it(
        "preserves deterministic observation states across repeated runs",
        async () => {
          const a = await extractLabelEvidence(extractionInput(bytes, entry, derivative.sha256));
          const b = await extractLabelEvidence(extractionInput(bytes, entry, derivative.sha256));
          expect(a.ok && b.ok).toBe(true);
          if (!a.ok || !b.ok) return;
          expect(a.value.fields.brandName.state).toBe(b.value.fields.brandName.state);
          expect(a.value.fields.alcoholStatement.state).toBe(b.value.fields.alcoholStatement.state);
          expect(a.value.fields.alcoholStatement.value).toBe(b.value.fields.alcoholStatement.value);
        },
        OCR_TIMEOUT,
      );
    });
  }
});
