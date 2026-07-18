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
