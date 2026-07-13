import type { PrecheckServiceResponse } from "../../../src/server/precheck-service.types";

/**
 * A complete, render-safe pre-check response for driving the onboarding overlay
 * deterministically in Playwright. The onboarding renders the real ResultView,
 * so this must be structurally complete. It stands in for the live pipeline so
 * the e2e exercises onboarding orchestration (auto-run, status, reveal, handoff)
 * without depending on OCR timing — the real-pipeline sample is covered by the
 * home spec's end-to-end test.
 */
export const SAMPLE_RESPONSE: PrecheckServiceResponse = {
  machineResultId: "precheck-result.v1-" + "a".repeat(64),
  appendToken: "f".repeat(64),
  profile: { id: "wine-precheck", version: "1.0.0" },
  advisoryNotice: {
    noticeId: "precheck-advisory-notice",
    noticeVersion: "1.0.0",
    text: "This result is an automated pre-submission aid. It is not a TTB approval, legal opinion, or official regulatory disposition.",
  },
  declaredFacts: {
    applicationBrandName: {
      value: "M CELLARS",
      provenance: {
        sourceType: "operator-entered",
        sourceReference: "web",
        recordedBy: "op",
        recordedAt: "t",
      },
    },
    applicationAlcoholValue: {
      value: "12.5",
      provenance: {
        sourceType: "operator-entered",
        sourceReference: "web",
        recordedBy: "op",
        recordedAt: "t",
      },
    },
  },
  observations: {
    provenance: {
      artifactRef: "a",
      derivativeSha256: "b".repeat(64),
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0" },
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
      processedAt: "t",
    },
    brandName: {
      state: "OBSERVED",
      value: "M CELLARS",
      rawText: "M CELLARS",
      confidence: 0.93,
      geometry: {
        imageIndex: 0,
        x: 10,
        y: 20,
        width: 100,
        height: 30,
        imageWidth: 2404,
        imageHeight: 979,
      },
      alternates: [],
    },
    alcoholStatement: {
      state: "OBSERVED",
      value: "12.5% ALC./VOL.",
      rawText: "12.5% ALC./VOL.",
      confidence: 0.91,
      geometry: {
        imageIndex: 0,
        x: 30,
        y: 40,
        width: 50,
        height: 200,
        imageWidth: 2404,
        imageHeight: 979,
      },
      alternates: [],
    },
  },
  evidenceAssessments: [
    {
      checkId: "brand-name-check",
      evidenceStatus: "sufficient",
      reasonCode: "BRAND_OBSERVATION_PRESENT",
    },
    {
      checkId: "wine-alcohol-check",
      evidenceStatus: "sufficient",
      reasonCode: "ALCOHOL_OBSERVATION_PRESENT",
    },
  ],
  findings: [
    {
      ruleId: "wine-alcohol-syntax",
      ruleVersion: "1.0.0",
      profileId: "wine-precheck",
      profileVersion: "1.0.0",
      authority: { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" },
      findingStatus: "PASS",
      ruleExecutionStatus: "executed",
      evidenceReferences: [],
      message: "Alcohol statement syntax is valid.",
    },
    {
      ruleId: "brand-name-canonical-comparison",
      ruleVersion: "1.0.0",
      profileId: "wine-precheck",
      profileVersion: "1.0.0",
      authority: { citation: "27 CFR 4.33", snapshotDate: "2026-07-10" },
      findingStatus: "PASS",
      ruleExecutionStatus: "executed",
      evidenceReferences: [],
      message: "Brand name matches the application.",
    },
  ] as PrecheckServiceResponse["findings"],
  suggestedFilename: "label-lens-wine-precheck-precheck-result.v1-" + "a".repeat(64) + ".json",
  exportJson: '{"exportType":"wine-precheck-result"}',
  humanDispositionHistory: [],
  report: {
    html: "<!doctype html><html><body>report</body></html>",
    filename: "label-lens-wine-precheck-precheck-result.v1-" + "a".repeat(64) + ".html",
  },
  file: {
    displayName: "M Cellars sample (bundled demo)",
    mediaType: "image/jpeg",
    byteSize: 123,
    source: "sample",
  },
};

export const SAMPLE_ENVELOPE = { ok: true, data: SAMPLE_RESPONSE };
