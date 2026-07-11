// @vitest-environment node
//
// Full-path determinism proof for the wine pre-check service.
//
// The service supplies fixed deterministic metadata and generates no current
// timestamp or random identifier in the tested path, so identical bytes and
// declared facts must yield byte-identical serialization at every layer. Runtime
// durations are deliberately never compared.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { canonicalStringify } from "@/pipeline/export/json/canonical-json";
import { parseJsonExport } from "@/pipeline/export/json/parse-json-export";

import { runPrecheckService } from "./precheck-service";
import type { PrecheckServiceResponse } from "./precheck-service.types";

const FIXTURE = join(
  process.cwd(),
  "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
);
const OCR_TIMEOUT = 120_000;

function run(bytes: Uint8Array, declaredAlcohol: string) {
  return runPrecheckService({
    source: "upload",
    imageBytes: bytes,
    filename: "label.jpeg",
    mediaType: "image/jpeg",
    declaredBrand: "M CELLARS",
    declaredAlcohol,
  });
}

function unwrap(out: Awaited<ReturnType<typeof runPrecheckService>>): PrecheckServiceResponse {
  expect(out.ok).toBe(true);
  if (!out.ok) throw new Error("service failed");
  return out.value;
}

function integrityValue(exportJson: string): string {
  const parsed = parseJsonExport(exportJson);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error("unreachable");
  return parsed.value.integrity.value;
}

describe("Slice 3 determinism — identical inputs are byte-identical", () => {
  let bytes: Uint8Array;
  let first: PrecheckServiceResponse;
  let second: PrecheckServiceResponse;

  beforeAll(async () => {
    bytes = new Uint8Array(readFileSync(FIXTURE));
    first = unwrap(await run(bytes, "12.5"));
    second = unwrap(await run(bytes, "12.5"));
  }, OCR_TIMEOUT);

  it("produces identical analyzer/observation serialization", () => {
    expect(canonicalStringify(second.observations)).toBe(canonicalStringify(first.observations));
  });

  it("produces identical orchestration (findings + assessments) serialization", () => {
    expect(canonicalStringify(second.findings)).toBe(canonicalStringify(first.findings));
    expect(canonicalStringify(second.evidenceAssessments)).toBe(
      canonicalStringify(first.evidenceAssessments),
    );
  });

  it("produces an identical machine-result id and full response serialization", () => {
    expect(second.machineResultId).toBe(first.machineResultId);
    expect(canonicalStringify(second)).toBe(canonicalStringify(first));
  });

  it("produces identical canonical JSON export, checksum, and suggested filename", () => {
    expect(second.exportJson).toBe(first.exportJson);
    expect(integrityValue(second.exportJson)).toBe(integrityValue(first.exportJson));
    expect(second.suggestedFilename).toBe(first.suggestedFilename);
  });
});

describe("Slice 3 determinism — changing only declared alcohol 12.5 → 13", () => {
  let atTwelveFive: PrecheckServiceResponse;
  let atThirteen: PrecheckServiceResponse;

  beforeAll(async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    atTwelveFive = unwrap(await run(bytes, "12.5"));
    atThirteen = unwrap(await run(bytes, "13"));
  }, OCR_TIMEOUT);

  it("does not change OCR observations or their provenance", () => {
    expect(atThirteen.observations.brandName).toEqual(atTwelveFive.observations.brandName);
    expect(atThirteen.observations.alcoholStatement).toEqual(
      atTwelveFive.observations.alcoholStatement,
    );
    expect(atThirteen.observations.provenance).toEqual(atTwelveFive.observations.provenance);
  });

  it("does not change evidence sufficiency", () => {
    expect(atThirteen.evidenceAssessments).toEqual(atTwelveFive.evidenceAssessments);
  });

  it("does not change brand or syntax outcomes", () => {
    const brand = (r: PrecheckServiceResponse) =>
      r.findings.find((f) => f.ruleId === "brand-name-canonical-comparison");
    const syntax = (r: PrecheckServiceResponse) =>
      r.findings.find((f) => f.ruleId === "wine-alcohol-syntax");
    expect(brand(atThirteen)).toEqual(brand(atTwelveFive));
    expect(syntax(atThirteen)).toEqual(syntax(atTwelveFive));
  });

  it("changes the declared-comparison result", () => {
    const cmp = (r: PrecheckServiceResponse) =>
      r.findings.find((f) => f.ruleId === "wine-alcohol-declared-comparison")!.findingStatus;
    expect(cmp(atTwelveFive)).toBe("PASS");
    expect(cmp(atThirteen)).toBe("FAIL");
  });

  it("changes result/export identity deterministically", () => {
    expect(atThirteen.machineResultId).not.toBe(atTwelveFive.machineResultId);
    expect(integrityValue(atThirteen.exportJson)).not.toBe(integrityValue(atTwelveFive.exportJson));
    expect(atThirteen.suggestedFilename).not.toBe(atTwelveFive.suggestedFilename);
  });
});
