import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { runCaseArtifacts } from "@/fixtures/eval/eval-harness";
import { loadEvalManifest } from "@/fixtures/eval/eval-loader";
import {
  buildProductionAnalyzerParityFixture,
  buildProductionAnalyzerParityProof,
  formatProductionParityMismatchInventory,
  productionParityBytes,
  PRODUCTION_PARITY_FIXTURE_PATH,
  type ProductionAnalyzerParityFixture,
  type ProductionAnalyzerParityInput,
} from "@/fixtures/eval/production-parity";

const RUN_SCHEMA_VERSION = "production-parity-reconciliation-run.v1" as const;
const instrumentationCommitSha = requiredEnvironment("PRODUCTION_PARITY_COMMIT_SHA");
const productionBaseSha = requiredEnvironment("PRODUCTION_PARITY_BASE_SHA");
const runPath = requiredEnvironment("PRODUCTION_PARITY_RUN_PATH");
const actualFixturePath = process.env.PRODUCTION_PARITY_ACTUAL_FIXTURE_PATH;

for (const [name, value] of [
  ["PRODUCTION_PARITY_COMMIT_SHA", instrumentationCommitSha],
  ["PRODUCTION_PARITY_BASE_SHA", productionBaseSha],
] as const) {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${name} must be a full lowercase Git commit SHA`);
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const manifest = loadEvalManifest();
const inputs: ProductionAnalyzerParityInput[] = [];
for (const evalCase of manifest.cases) {
  const artifacts = await runCaseArtifacts(evalCase);
  inputs.push({
    caseId: evalCase.caseId,
    responseBytes: artifacts.productionResponseBytes,
    extractionError: artifacts.extractionError,
  });
}

const expectedFixtureBytes = readFileSync(PRODUCTION_PARITY_FIXTURE_PATH);
const expected = JSON.parse(
  expectedFixtureBytes.toString("utf8"),
) as ProductionAnalyzerParityFixture;
const actual = buildProductionAnalyzerParityFixture(productionBaseSha, inputs);
const proof = buildProductionAnalyzerParityProof(expected, actual);
const processedAtValues = [
  ...new Set(
    actual.records.flatMap((record) => {
      if (!record.responseBytes) return [];
      const parsed = JSON.parse(record.responseBytes) as {
        provenance?: { processedAt?: unknown };
      };
      return typeof parsed.provenance?.processedAt === "string"
        ? [parsed.provenance.processedAt]
        : [];
    }),
  ),
];
const responseSetBytes = actual.records
  .map((record) => `${record.caseId}\0${productionParityBytes(record)}`)
  .join("\0");

writeJson(runPath, {
  schemaVersion: RUN_SCHEMA_VERSION,
  instrumentationCommitSha,
  productionBaseSha,
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    processedAtValues,
    networkDependency: "none; local committed image bytes, Sharp, and bundled Tesseract model only",
  },
  expectedFixture: {
    path: "src/fixtures/eval/production-analyzer-parity.baseline.json",
    sha256: sha256(expectedFixtureBytes),
    baseCommit: expected.baseCommit,
    caseCount: expected.caseCount,
  },
  actual: {
    caseCount: actual.caseCount,
    caseOrderSha256: sha256(actual.records.map((record) => record.caseId).join("\n")),
    responseSetSha256: sha256(responseSetBytes),
    records: actual.records.map(({ caseId, extractionError, sha256, byteLength }) => ({
      caseId,
      extractionError,
      sha256,
      byteLength,
    })),
  },
  parity: proof,
});

if (actualFixturePath) writeJson(actualFixturePath, actual);

process.stdout.write(`${formatProductionParityMismatchInventory(proof)}\n`);
