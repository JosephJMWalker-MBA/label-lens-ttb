// @vitest-environment node
//
// Canonical end-to-end acceptance suite for the completed wine pre-check slice.
//
// This drives the REAL server pipeline — integrity validation, local-only OCR,
// evidence-only analyzer response, independent evidence sufficiency,
// deterministic wine rules, immutable result assembly, and the
// checksum-protected JSON export. Nothing here is mocked.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { parseJsonExport } from "@/pipeline/export/json/parse-json-export";
import type { PrecheckJsonExport } from "@/pipeline/export/json/json-export.types";

import { runPrecheckService } from "./precheck-service";
import type { PrecheckServiceResponse } from "./precheck-service.types";

const FIXTURE = join(
  process.cwd(),
  "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
);
// The committed OCR-benchmark identity, asserted independently below.
const FIXTURE_SHA256 = "0b0ccec13bf6c533ec7928b017b140a0213fb4555812fea81d71872adb453713";
const OCR_TIMEOUT = 120_000;

// Exact committed six-rule registry order, evaluated in this sequence.
const REGISTRY_ORDER = [
  "wine-alcohol-syntax",
  "brand-name-canonical-comparison",
  "wine-alcohol-declared-comparison",
  "wine-alcohol-actual-content-tolerance",
  "wine-alcohol-class-type-boundary",
  "wine-alcohol-omission-eligibility",
];
const EXTERNAL_DEPENDENT = [
  "wine-alcohol-actual-content-tolerance",
  "wine-alcohol-class-type-boundary",
  "wine-alcohol-omission-eligibility",
];

function findingOf(res: PrecheckServiceResponse, ruleId: string) {
  return res.findings.find((f) => f.ruleId === ruleId)!;
}

function parsedExport(res: PrecheckServiceResponse): PrecheckJsonExport {
  const parsed = parseJsonExport(res.exportJson);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error("unreachable");
  return parsed.value;
}

describe("Slice 3 acceptance — real M Cellars pipeline", () => {
  let bytes: Uint8Array;
  let scenarioA: PrecheckServiceResponse;
  let scenarioB: PrecheckServiceResponse;

  beforeAll(async () => {
    bytes = new Uint8Array(readFileSync(FIXTURE));
    const a = await runPrecheckService({
      source: "upload",
      imageBytes: bytes,
      filename: "label.jpeg",
      mediaType: "image/jpeg",
      declaredBrand: "M CELLARS",
      declaredAlcohol: "12.5",
    });
    const b = await runPrecheckService({
      source: "upload",
      imageBytes: bytes,
      filename: "label.jpeg",
      mediaType: "image/jpeg",
      declaredBrand: "M CELLARS",
      declaredAlcohol: "13",
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("acceptance setup failed");
    scenarioA = a.value;
    scenarioB = b.value;
  }, OCR_TIMEOUT);

  describe("Scenario A — exact declared values", () => {
    it("processes the real extractor and observes brand and alcohol", () => {
      expect(scenarioA.observations.brandName.state).toBe("OBSERVED");
      expect(scenarioA.observations.brandName.value).toBe("M CELLARS");
      expect(scenarioA.observations.alcoholStatement.value).toBe("12.5% ALC./VOL.");
    });

    it("shows both evidence assessments independently", () => {
      const ids = scenarioA.evidenceAssessments.map((a) => a.checkId);
      expect(ids).toContain("brand-name-check");
      expect(ids).toContain("wine-alcohol-check");
      for (const a of scenarioA.evidenceAssessments) {
        expect(a.evidenceStatus).toBe("sufficient");
      }
    });

    it("passes brand, alcohol syntax, and declared comparison", () => {
      expect(findingOf(scenarioA, "brand-name-canonical-comparison").findingStatus).toBe("PASS");
      expect(findingOf(scenarioA, "wine-alcohol-syntax").findingStatus).toBe("PASS");
      expect(findingOf(scenarioA, "wine-alcohol-declared-comparison").findingStatus).toBe("PASS");
    });

    it("holds the three actual-content rules as not_run_external_dependency", () => {
      for (const id of EXTERNAL_DEPENDENT) {
        const f = findingOf(scenarioA, id);
        expect(f.ruleExecutionStatus).toBe("not_run_external_dependency");
        expect(f.findingStatus).toBe("not_run");
        expect(f.externalEvidenceDependency).toBeTruthy();
      }
    });

    it("preserves exact committed registry order", () => {
      expect(scenarioA.findings.map((f) => f.ruleId)).toEqual(REGISTRY_ORDER);
    });

    it("presents an advisory notice and no overall status/score/approval", () => {
      expect(scenarioA.advisoryNotice.text.length).toBeGreaterThan(0);
      const keys = Object.keys(scenarioA);
      for (const forbidden of ["status", "overallStatus", "score", "compliance", "approval"]) {
        expect(keys).not.toContain(forbidden);
      }
      // The bounded response never carries an aggregate verdict token.
      expect(JSON.stringify(scenarioA)).not.toMatch(
        /"(overallStatus|complianceScore|readinessScore|approval)"/,
      );
    });

    it("offers a deterministic JSON download whose checksum verifies", () => {
      expect(parseJsonExport(scenarioA.exportJson).ok).toBe(true);
      expect(scenarioA.suggestedFilename).toMatch(
        /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.json$/,
      );
    });
  });

  describe("Scenario B — tolerance-free mismatch (declared 13)", () => {
    it("leaves extraction evidence unchanged", () => {
      expect(scenarioB.observations.brandName).toEqual(scenarioA.observations.brandName);
      expect(scenarioB.observations.alcoholStatement).toEqual(
        scenarioA.observations.alcoholStatement,
      );
      expect(scenarioB.observations.provenance).toEqual(scenarioA.observations.provenance);
    });

    it("leaves brand and syntax findings unchanged", () => {
      expect(findingOf(scenarioB, "brand-name-canonical-comparison")).toEqual(
        findingOf(scenarioA, "brand-name-canonical-comparison"),
      );
      expect(findingOf(scenarioB, "wine-alcohol-syntax")).toEqual(
        findingOf(scenarioA, "wine-alcohol-syntax"),
      );
    });

    it("flips only the declared comparison to FAIL with no tolerance applied", () => {
      expect(findingOf(scenarioB, "wine-alcohol-declared-comparison").findingStatus).toBe("FAIL");
    });

    it("keeps the actual-content rules external-dependency bound", () => {
      for (const id of EXTERNAL_DEPENDENT) {
        expect(findingOf(scenarioB, id).ruleExecutionStatus).toBe("not_run_external_dependency");
      }
    });

    it("changes machine-result identity as required by changed declared facts, and the checksum verifies", () => {
      expect(scenarioB.machineResultId).not.toBe(scenarioA.machineResultId);
      expect(scenarioB.suggestedFilename).not.toBe(scenarioA.suggestedFilename);
      expect(parseJsonExport(scenarioB.exportJson).ok).toBe(true);
    });
  });

  describe("Scenario C — safe failure on invalid image", () => {
    it("rejects corrupt JPEG bytes without fabricating results or offering an export", async () => {
      const out = await runPrecheckService({
        source: "upload",
        imageBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x02, 0x03]),
        filename: "broken.jpeg",
        mediaType: "image/jpeg",
        declaredBrand: "M CELLARS",
        declaredAlcohol: "12.5",
      });
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(["CORRUPT_IMAGE", "EXTRACTION_FAILED"]).toContain(out.error.code);
      // No observation, finding, or export text is present on a failure.
      expect(out).not.toHaveProperty("value");
      // The message is user-safe: no stack, absolute path, env, or OCR internals.
      expect(out.error.message).not.toMatch(
        /\/Users\/|\/home\/|node_modules|traineddata|tesseract|sharp|at Object|Error:|process\.env|\.ts:\d+/,
      );
    });

    it("rejects an unsupported media type safely", async () => {
      const out = await runPrecheckService({
        source: "upload",
        imageBytes: bytes,
        mediaType: "image/webp",
        declaredBrand: "M CELLARS",
        declaredAlcohol: "12.5",
      });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe("UNSUPPORTED_TYPE");
    });
  });

  describe("Layer-crossing identity — one derivative hash across every layer", () => {
    it("ties uploaded bytes → analyzer provenance → findings → run → export", () => {
      const sha = createHash("sha256").update(bytes).digest("hex");
      // The uploaded bytes are exactly the committed OCR benchmark.
      expect(sha).toBe(FIXTURE_SHA256);

      const exp = parsedExport(scenarioA);

      // Analyzer provenance derivative hash.
      expect(scenarioA.observations.provenance.derivativeSha256).toBe(sha);
      // Every executed finding's evidence references cite the same derivative.
      for (const f of scenarioA.findings) {
        for (const ref of f.evidenceReferences) {
          expect(ref.derivativeSha256).toBe(sha);
        }
      }
      // Run sanitized derivative hash and export version manifest.
      expect(exp.run.sanitizedDerivative.sha256).toBe(sha);
      expect(exp.versionManifest.sanitizedDerivativeSha256).toBe(sha);
    });

    it("copies exact profile identity and the ordered six-rule manifest into the export", () => {
      const exp = parsedExport(scenarioA);
      expect(exp.profile.id).toBe("wine-precheck");
      expect(exp.profile.ruleManifest.map((r) => r.ruleId)).toEqual(REGISTRY_ORDER);
      expect(exp.findings.map((f) => f.ruleId)).toEqual(REGISTRY_ORDER);
      // Findings copy the profile version they were produced under.
      for (const f of exp.findings) {
        expect(f.profileId).toBe(exp.profile.id);
        expect(f.profileVersion).toBe(exp.profile.version);
        expect(f.authority.citation.length).toBeGreaterThan(0);
      }
    });

    it("carries result data into the export without semantic alteration", () => {
      const exp = parsedExport(scenarioA);
      expect(exp.generatedFrom.machineResultId).toBe(scenarioA.machineResultId);
      expect(exp.findings).toEqual(scenarioA.findings);
      expect(exp.observations).toEqual(scenarioA.observations);
      expect(exp.evidenceAssessments).toEqual(scenarioA.evidenceAssessments);
      expect(exp.declaredFacts).toEqual(scenarioA.declaredFacts);
      expect(exp.advisoryNotice).toEqual(scenarioA.advisoryNotice);
    });
  });
});
