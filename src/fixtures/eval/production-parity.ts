import { createHash } from "node:crypto";
import { join } from "node:path";

export const PRODUCTION_ANALYZER_PARITY_SCHEMA_VERSION = "production-analyzer-parity.v1" as const;
export const ISSUE_131_BASE_COMMIT = "d54e3b2506de9220d2f0cd602d44b3a82c42fd58" as const;

export const PRODUCTION_PARITY_FIXTURE_PATH = join(
  process.cwd(),
  "src/fixtures/eval/production-analyzer-parity.baseline.json",
);

export interface ProductionAnalyzerParityRecord {
  caseId: string;
  responseBytes: string | null;
  extractionError: string | null;
  sha256: string;
  byteLength: number;
}

export interface ProductionAnalyzerParityFixture {
  schemaVersion: typeof PRODUCTION_ANALYZER_PARITY_SCHEMA_VERSION;
  baseCommit: string;
  caseCount: number;
  records: ProductionAnalyzerParityRecord[];
}

export interface ProductionAnalyzerParityInput {
  caseId: string;
  responseBytes: string | null;
  extractionError: string | null;
}

export function productionParityBytes(input: ProductionAnalyzerParityInput): string {
  return input.responseBytes ?? JSON.stringify({ extractionError: input.extractionError });
}

export function productionParityDigest(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildProductionAnalyzerParityFixture(
  baseCommit: string,
  inputs: ProductionAnalyzerParityInput[],
): ProductionAnalyzerParityFixture {
  const seen = new Set<string>();
  const records = inputs.map((input) => {
    if (seen.has(input.caseId)) throw new Error(`duplicate parity case ${input.caseId}`);
    seen.add(input.caseId);
    const bytes = productionParityBytes(input);
    return {
      ...input,
      sha256: productionParityDigest(bytes),
      byteLength: Buffer.byteLength(bytes),
    };
  });
  return {
    schemaVersion: PRODUCTION_ANALYZER_PARITY_SCHEMA_VERSION,
    baseCommit,
    caseCount: records.length,
    records,
  };
}

export interface ProductionAnalyzerParityMismatch {
  caseId: string;
  reason: "missing-baseline" | "unexpected-case" | "response-bytes-changed";
  expectedSha256: string | null;
  actualSha256: string | null;
  firstDifference?: ProductionAnalyzerParityFirstDifference;
}

export type ProductionAnalyzerParityFieldCategory =
  | "brandName"
  | "alcoholStatement"
  | "provenance"
  | "limitations"
  | "extractionError"
  | "serialization"
  | "unknown";

export interface ProductionAnalyzerParityFirstDifference {
  kind:
    | "json-value-change"
    | "json-structure-change"
    | "serialization-order-change"
    | "non-json-byte-change";
  jsonPath: string | null;
  expectedValue: unknown;
  actualValue: unknown;
  byteOffset: number;
  expectedByteRange: { start: number; end: number; text: string };
  actualByteRange: { start: number; end: number; text: string };
  fieldCategory: ProductionAnalyzerParityFieldCategory;
}

export interface ProductionAnalyzerParityProof {
  status: "PASS" | "FAIL" | "not_run";
  fixtureSchemaVersion: typeof PRODUCTION_ANALYZER_PARITY_SCHEMA_VERSION;
  baseCommit: string;
  expectedCaseCount: number;
  actualCaseCount: number;
  matchedCaseCount: number;
  mismatches: ProductionAnalyzerParityMismatch[];
  comparisonBasis: "exact-serialized-analyzer-response-bytes";
}

export function buildProductionAnalyzerParityProof(
  expected: ProductionAnalyzerParityFixture,
  actual: ProductionAnalyzerParityFixture,
): ProductionAnalyzerParityProof {
  const mismatches = compareProductionAnalyzerParity(expected, actual);
  return {
    status: mismatches.length === 0 ? "PASS" : "FAIL",
    fixtureSchemaVersion: PRODUCTION_ANALYZER_PARITY_SCHEMA_VERSION,
    baseCommit: expected.baseCommit,
    expectedCaseCount: expected.caseCount,
    actualCaseCount: actual.caseCount,
    matchedCaseCount:
      expected.caseCount -
      mismatches.filter((mismatch) => mismatch.reason !== "unexpected-case").length,
    mismatches,
    comparisonBasis: "exact-serialized-analyzer-response-bytes",
  };
}

export function formatProductionParityMismatchInventory(
  proof: ProductionAnalyzerParityProof,
): string {
  return JSON.stringify(
    {
      status: proof.status,
      expectedCaseCount: proof.expectedCaseCount,
      actualCaseCount: proof.actualCaseCount,
      matchedCaseCount: proof.matchedCaseCount,
      mismatches: proof.mismatches,
    },
    null,
    2,
  );
}

export function compareProductionAnalyzerParity(
  expected: ProductionAnalyzerParityFixture,
  actual: ProductionAnalyzerParityFixture,
): ProductionAnalyzerParityMismatch[] {
  const expectedById = new Map(expected.records.map((record) => [record.caseId, record]));
  const actualById = new Map(actual.records.map((record) => [record.caseId, record]));
  const mismatches: ProductionAnalyzerParityMismatch[] = [];

  for (const expectedRecord of expected.records) {
    const actualRecord = actualById.get(expectedRecord.caseId);
    if (!actualRecord) {
      mismatches.push({
        caseId: expectedRecord.caseId,
        reason: "missing-baseline",
        expectedSha256: expectedRecord.sha256,
        actualSha256: null,
      });
      continue;
    }
    if (expectedRecord.responseBytes !== actualRecord.responseBytes) {
      mismatches.push({
        caseId: expectedRecord.caseId,
        reason: "response-bytes-changed",
        expectedSha256: expectedRecord.sha256,
        actualSha256: actualRecord.sha256,
        firstDifference: firstProductionParityDifference(
          productionParityBytes(expectedRecord),
          productionParityBytes(actualRecord),
        ),
      });
    }
  }

  for (const actualRecord of actual.records) {
    if (expectedById.has(actualRecord.caseId)) continue;
    mismatches.push({
      caseId: actualRecord.caseId,
      reason: "unexpected-case",
      expectedSha256: null,
      actualSha256: actualRecord.sha256,
    });
  }

  return mismatches;
}

const MISSING_JSON_VALUE = "<missing>";
const BYTE_CONTEXT = 80;

function firstByteOffset(expected: Buffer, actual: Buffer): number {
  const sharedLength = Math.min(expected.length, actual.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (expected[index] !== actual[index]) return index;
  }
  return sharedLength;
}

function byteRange(bytes: Buffer, offset: number): { start: number; end: number; text: string } {
  const start = Math.max(0, offset - BYTE_CONTEXT);
  const end = Math.min(bytes.length, offset + BYTE_CONTEXT);
  return { start, end, text: bytes.subarray(start, end).toString("utf8") };
}

function jsonPathSegment(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

interface JsonDifference {
  kind: "json-value-change" | "json-structure-change";
  jsonPath: string;
  expectedValue: unknown;
  actualValue: unknown;
}

function firstJsonDifference(
  expected: unknown,
  actual: unknown,
  jsonPath = "$",
): JsonDifference | null {
  if (Object.is(expected, actual)) return null;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return {
        kind: "json-structure-change",
        jsonPath,
        expectedValue: expected,
        actualValue: actual,
      };
    }
    const sharedLength = Math.min(expected.length, actual.length);
    for (let index = 0; index < sharedLength; index += 1) {
      const nested = firstJsonDifference(expected[index], actual[index], `${jsonPath}[${index}]`);
      if (nested) return nested;
    }
    if (expected.length === actual.length) return null;
    return {
      kind: "json-structure-change",
      jsonPath: `${jsonPath}.length`,
      expectedValue: expected.length,
      actualValue: actual.length,
    };
  }

  const expectedObject =
    typeof expected === "object" && expected !== null
      ? (expected as Record<string, unknown>)
      : null;
  const actualObject =
    typeof actual === "object" && actual !== null ? (actual as Record<string, unknown>) : null;
  if (!expectedObject || !actualObject) {
    return { kind: "json-value-change", jsonPath, expectedValue: expected, actualValue: actual };
  }

  const expectedKeys = Object.keys(expectedObject);
  const actualKeys = Object.keys(actualObject);
  for (const key of expectedKeys) {
    const nestedPath = `${jsonPath}${jsonPathSegment(key)}`;
    if (!Object.hasOwn(actualObject, key)) {
      return {
        kind: "json-structure-change",
        jsonPath: nestedPath,
        expectedValue: expectedObject[key],
        actualValue: MISSING_JSON_VALUE,
      };
    }
    const nested = firstJsonDifference(expectedObject[key], actualObject[key], nestedPath);
    if (nested) return nested;
  }
  for (const key of actualKeys) {
    if (Object.hasOwn(expectedObject, key)) continue;
    return {
      kind: "json-structure-change",
      jsonPath: `${jsonPath}${jsonPathSegment(key)}`,
      expectedValue: MISSING_JSON_VALUE,
      actualValue: actualObject[key],
    };
  }
  return null;
}

function categoryForPath(jsonPath: string | null): ProductionAnalyzerParityFieldCategory {
  if (jsonPath?.startsWith("$.fields.brandName")) return "brandName";
  if (jsonPath?.startsWith("$.fields.alcoholStatement")) return "alcoholStatement";
  if (jsonPath?.startsWith("$.provenance")) return "provenance";
  if (jsonPath?.startsWith("$.limitations")) return "limitations";
  if (jsonPath?.startsWith("$.extractionError")) return "extractionError";
  return jsonPath === null ? "serialization" : "unknown";
}

export function firstProductionParityDifference(
  expectedBytes: string,
  actualBytes: string,
): ProductionAnalyzerParityFirstDifference {
  const expectedBuffer = Buffer.from(expectedBytes);
  const actualBuffer = Buffer.from(actualBytes);
  const byteOffset = firstByteOffset(expectedBuffer, actualBuffer);
  let jsonDifference: JsonDifference | null = null;
  let bothJson = false;

  try {
    const expectedJson: unknown = JSON.parse(expectedBytes);
    const actualJson: unknown = JSON.parse(actualBytes);
    bothJson = true;
    jsonDifference = firstJsonDifference(expectedJson, actualJson);
  } catch {
    // Exact byte comparison also supports typed extraction-error serialization.
  }

  const kind = jsonDifference
    ? jsonDifference.kind
    : bothJson
      ? "serialization-order-change"
      : "non-json-byte-change";
  const jsonPath = jsonDifference?.jsonPath ?? null;
  return {
    kind,
    jsonPath,
    expectedValue: jsonDifference?.expectedValue ?? expectedBytes,
    actualValue: jsonDifference?.actualValue ?? actualBytes,
    byteOffset,
    expectedByteRange: byteRange(expectedBuffer, byteOffset),
    actualByteRange: byteRange(actualBuffer, byteOffset),
    fieldCategory: categoryForPath(jsonPath),
  };
}
