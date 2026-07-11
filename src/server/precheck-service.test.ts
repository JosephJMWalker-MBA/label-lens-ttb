// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { parseJsonExport } from "@/pipeline/export/json/parse-json-export";

import { runPrecheckService } from "./precheck-service";
import type { PrecheckServiceResponse } from "./precheck-service.types";

const FIXTURE = join(
  process.cwd(),
  "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
);
const OCR_TIMEOUT = 120_000;

function findingStatus(res: PrecheckServiceResponse, ruleId: string) {
  return res.findings.find((f) => f.ruleId === ruleId)!;
}

describe("runPrecheckService (real OCR)", () => {
  let bytes: Uint8Array;

  beforeAll(() => {
    bytes = new Uint8Array(readFileSync(FIXTURE));
  });

  it(
    "runs the real extractor and full pipeline for the M Cellars image with declared 12.5 (PASS)",
    async () => {
      const out = await runPrecheckService({
        source: "upload",
        imageBytes: bytes,
        filename: "label.jpeg",
        mediaType: "image/jpeg",
        declaredBrand: "M CELLARS",
        declaredAlcohol: "12.5",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const res = out.value;
      expect(res.observations.brandName.value).toBe("M CELLARS");
      expect(res.observations.alcoholStatement.value).toBe("12.5% ALC./VOL.");
      expect(findingStatus(res, "brand-name-canonical-comparison").findingStatus).toBe("PASS");
      expect(findingStatus(res, "wine-alcohol-syntax").findingStatus).toBe("PASS");
      expect(findingStatus(res, "wine-alcohol-declared-comparison").findingStatus).toBe("PASS");
      // Registry order preserved.
      expect(res.findings.map((f) => f.ruleId)).toEqual([
        "wine-alcohol-syntax",
        "brand-name-canonical-comparison",
        "wine-alcohol-declared-comparison",
        "wine-alcohol-actual-content-tolerance",
        "wine-alcohol-class-type-boundary",
        "wine-alcohol-omission-eligibility",
      ]);
      for (const id of [
        "wine-alcohol-actual-content-tolerance",
        "wine-alcohol-class-type-boundary",
        "wine-alcohol-omission-eligibility",
      ]) {
        expect(findingStatus(res, id).ruleExecutionStatus).toBe("not_run_external_dependency");
      }
      // The returned JSON export checksum verifies.
      expect(parseJsonExport(res.exportJson).ok).toBe(true);
      expect(res.suggestedFilename).toMatch(
        /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.json$/,
      );
    },
    OCR_TIMEOUT,
  );

  it(
    "returns declared-comparison FAIL for declared 13 with no tolerance",
    async () => {
      const out = await runPrecheckService({
        source: "upload",
        imageBytes: bytes,
        filename: "label.jpeg",
        mediaType: "image/jpeg",
        declaredBrand: "M CELLARS",
        declaredAlcohol: "13",
      });
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(findingStatus(out.value, "wine-alcohol-declared-comparison").findingStatus).toBe(
          "FAIL",
        );
      }
    },
    OCR_TIMEOUT,
  );

  it(
    "runs the bundled sample source through the real extractor",
    async () => {
      const out = await runPrecheckService({
        source: "sample",
        declaredBrand: "M CELLARS",
        declaredAlcohol: "12.5",
      });
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.value.file.source).toBe("sample");
        expect(out.value.observations.brandName.value).toBe("M CELLARS");
      }
    },
    OCR_TIMEOUT,
  );

  it("rejects an unsupported media type", async () => {
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

  it("rejects an empty file", async () => {
    const out = await runPrecheckService({
      source: "upload",
      imageBytes: new Uint8Array(0),
      mediaType: "image/png",
      declaredBrand: "M CELLARS",
      declaredAlcohol: "12.5",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("EMPTY_FILE");
  });

  it("rejects an oversized file", async () => {
    const out = await runPrecheckService({
      source: "upload",
      imageBytes: new Uint8Array(16 * 1024 * 1024),
      mediaType: "image/png",
      declaredBrand: "M CELLARS",
      declaredAlcohol: "12.5",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects a corrupt image", async () => {
    const out = await runPrecheckService({
      source: "upload",
      imageBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      mediaType: "image/png",
      declaredBrand: "M CELLARS",
      declaredAlcohol: "12.5",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("CORRUPT_IMAGE");
  });

  it("rejects a missing declared value", async () => {
    const out = await runPrecheckService({
      source: "upload",
      imageBytes: bytes,
      mediaType: "image/jpeg",
      declaredBrand: "",
      declaredAlcohol: "12.5",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_DECLARED_VALUE");
  });

  it("returns only user-safe error messages (no stack, path, or env data)", async () => {
    const out = await runPrecheckService({
      source: "upload",
      imageBytes: new Uint8Array([0, 1, 2]),
      mediaType: "image/png",
      declaredBrand: "M CELLARS",
      declaredAlcohol: "12.5",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.message).not.toMatch(
        /\/Users\/|\/home\/|node_modules|at Object|Error:|process\.env/,
      );
    }
  });
});
