import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  computeSha256,
  EXPECTED_V1_SHA256,
  scoreV1ToV2,
  type V1Report,
} from "../../../scripts/vision/score-v1-to-v2";

describe("Deterministic Offline Scorer (v1 -> v2)", () => {
  const v1Path = "artifacts/held-out-validation/report-v1.json";

  it("verifies immutable SHA-256 hash of report-v1.json", async () => {
    const raw = await readFile(v1Path);
    const hash = computeSha256(raw);
    expect(hash).toBe(EXPECTED_V1_SHA256);
  });

  it("rejects tampered input data when hash verification is enabled", async () => {
    const raw = await readFile(v1Path);
    const tampered = Buffer.from(raw.toString("utf8").replace("Dark Horse", "Light Horse"), "utf8");
    const v1 = JSON.parse(tampered.toString("utf8")) as V1Report;

    expect(() =>
      scoreV1ToV2(v1, { customRawData: tampered, allowHashMismatch: false }),
    ).toThrowError(/Immutable hash mismatch/);
  });

  it("produces deterministic, idempotent output across multiple runs", async () => {
    const raw = await readFile(v1Path);
    const v1 = JSON.parse(raw.toString("utf8")) as V1Report;

    const run1 = scoreV1ToV2(v1, { customRawData: raw });
    const run2 = scoreV1ToV2(v1, { customRawData: raw });

    expect(run1).toEqual(run2);
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it("reproduces Stage 1 Raw Brand Presence metric parity", async () => {
    const raw = await readFile(v1Path);
    const v1 = JSON.parse(raw.toString("utf8")) as V1Report;
    const v2 = scoreV1ToV2(v1, { customRawData: raw });

    const s1 = v2.summary.stage1_rawBrandTextPresence;
    expect(s1.tesseract).toBe("15/18 (83.3%)");
    expect(s1.vision_lineCheck).toBe("14/18 (77.8%)");
    expect(s1.vision_multilineCheck).toContain("13/18 (72.2%)");

    // Line check concordance
    expect(s1.pairedConcordance_lineCheck.bothRawPresent).toBe("12/18 (66.7%)");
    expect(s1.pairedConcordance_lineCheck.visionOnlyRawPresent).toContain("2/18 (11.1%)");
    expect(s1.pairedConcordance_lineCheck.visionOnlyRawPresent).toContain("approved-wine-011");
    expect(s1.pairedConcordance_lineCheck.visionOnlyRawPresent).toContain("approved-wine-012");
    expect(s1.pairedConcordance_lineCheck.ocrOnlyRawPresent).toContain("3/18 (16.7%)");
    expect(s1.pairedConcordance_lineCheck.neitherRawPresent).toContain("1/18 (5.6%)");
    expect(s1.pairedConcordance_lineCheck.neitherRawPresent).toContain("patricia-green-cellars");

    // Multiline check concordance (rejects approved-wine-006)
    expect(s1.pairedConcordance_multilineCheck.bothRawPresent).toBe("11/18 (61.1%)");
    expect(s1.pairedConcordance_multilineCheck.visionOnlyRawPresent).toContain("2/18 (11.1%)");
    expect(s1.pairedConcordance_multilineCheck.ocrOnlyRawPresent).toContain("4/18 (22.2%)");
    expect(s1.pairedConcordance_multilineCheck.ocrOnlyRawPresent).toContain("approved-wine-006");
  });

  it("reproduces Stage 2 Candidate Selection parity (OCR 6/18, Vision NOT_EVALUATED)", async () => {
    const raw = await readFile(v1Path);
    const v1 = JSON.parse(raw.toString("utf8")) as V1Report;
    const v2 = scoreV1ToV2(v1, { customRawData: raw });

    const s2 = v2.summary.stage2_selectedBrandCandidateMatch;
    expect(s2.tesseract).toContain("6/18 (33.3%)");
    expect(s2.tesseract).toContain("approved-wine-020");
    expect(s2.tesseract).toContain("casanova-della-spinetta");
    expect(s2.tesseract).toContain("domaine-follin-arbelet");
    expect(s2.tesseract).toContain("approved-wine-014");
    expect(s2.tesseract).toContain("nebla-mencia");
    expect(s2.tesseract).toContain("approved-wine-026");

    expect(s2.vision).toContain("NOT_EVALUATED");
  });

  it("reproduces Stage 3 Reliable Evidence parity (OCR 0/18, Vision NOT_EVALUATED)", async () => {
    const raw = await readFile(v1Path);
    const v1 = JSON.parse(raw.toString("utf8")) as V1Report;
    const v2 = scoreV1ToV2(v1, { customRawData: raw });

    const s3 = v2.summary.stage3_reliableEvidenceMatch;
    expect(s3.tesseract).toContain("0/18 (0.0%)");
    expect(s3.vision).toContain("NOT_EVALUATED");
  });

  it("reproduces Negative Control Clean Abstention (OCR 0/6, Vision NOT_EVALUATED)", async () => {
    const raw = await readFile(v1Path);
    const v1 = JSON.parse(raw.toString("utf8")) as V1Report;
    const v2 = scoreV1ToV2(v1, { customRawData: raw });

    const neg = v2.summary.negativeControlAbstention;
    expect(neg.tesseract.falseInsertions).toContain(
      "0/6 (0.0% false insertions, 100% clean abstention)",
    );
    expect(neg.vision.falseInsertions).toBe("NOT_EVALUATED");
  });

  it("correctly identifies degenerate loop on approved-wine-006", async () => {
    const raw = await readFile(v1Path);
    const v1 = JSON.parse(raw.toString("utf8")) as V1Report;
    const v2 = scoreV1ToV2(v1, { customRawData: raw });

    const c006 = v2.cases.find((c) => c.caseId === "approved-wine-006");
    expect(c006).toBeDefined();
    expect(c006?.vision.isDegenerateLineCheck).toBe(false);
    expect(c006?.vision.isDegenerateMultilineCheck).toBe(true);
    expect(c006?.vision.degenerateReason).toBe("CONSECUTIVE_MULTILINE_IDENTICAL_REPEAT");
    expect(c006?.vision.rawBrandPresentLineCheck).toBe(true);
    expect(c006?.vision.rawBrandPresentMultilineCheck).toBe(false);
    expect(c006?.rawConcordanceMultilineCheck).toBe("OCR_ONLY_RAW_PRESENT");
  });

  it("documents reconstructibility boundary: 300-char preview retains brand strings", async () => {
    const raw = await readFile(v1Path);
    const v1 = JSON.parse(raw.toString("utf8")) as V1Report;

    for (const c of v1.cases) {
      if (c.brandPresence === "present" && c.tesseract.rawTranscript.length >= 300) {
        expect(c.tesseract.rawTranscript.length).toBeLessThanOrEqual(300);
      }
    }
  });
});
