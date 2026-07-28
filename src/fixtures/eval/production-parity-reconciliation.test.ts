// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PRODUCTION_PARITY_BASE_COMMIT,
  PRODUCTION_PARITY_FIXTURE_PATH,
  type ProductionAnalyzerParityFixture,
} from "./production-parity";

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "issue-149-production-parity-reconciliation");

interface ReconciliationRun {
  productionBaseSha: string;
  environment: {
    processedAtValues: string[];
    networkDependency: string;
  };
  actual: {
    caseCount: number;
    caseOrderSha256: string;
    responseSetSha256: string;
    records: Array<{ caseId: string; sha256: string }>;
  };
  parity: {
    mismatches: Array<{
      caseId: string;
      expectedSha256: string;
      actualSha256: string;
      firstDifference: { jsonPath: string | null; fieldCategory: string };
    }>;
  };
}

interface MismatchInventory {
  productionBaseSha: string;
  oldFixtureSha256: string;
  newFixtureSha256: string;
  mismatchCount: number;
  classificationCounts: Record<string, number>;
  records: Array<{
    caseId: string;
    expectedSha256: string;
    actualSha256: string;
    firstDifference: { jsonPath: string; fieldCategory: string };
    brandIdentical: boolean;
    cause: string;
    originatingPr: number;
    originatingCommit: string;
  }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("Issue #149 production parity reconciliation evidence", () => {
  const run1Path = join(ARTIFACT_DIR, "determinism-run-1.json");
  const run2Path = join(ARTIFACT_DIR, "determinism-run-2.json");
  const inventoryPath = join(ARTIFACT_DIR, "mismatch-inventory.json");

  it("keeps both independent current-main captures byte-identical", () => {
    const run1Bytes = readFileSync(run1Path);
    const run2Bytes = readFileSync(run2Path);
    const run1 = JSON.parse(run1Bytes.toString("utf8")) as ReconciliationRun;

    expect(run2Bytes.equals(run1Bytes)).toBe(true);
    expect(run1.productionBaseSha).toBe(PRODUCTION_PARITY_BASE_COMMIT);
    expect(run1.actual.caseCount).toBe(115);
    expect(run1.actual.caseOrderSha256).toBe(
      "1548ca1313e28fd946bb3dc13f9500d8f579be0484a2d541d8abeb60c9035ba3",
    );
    expect(run1.actual.responseSetSha256).toBe(
      "c956dcae53f67113028b528cce5e6cec891160a0bbd0c72ca7d079ef1c108d2d",
    );
    expect(run1.environment.processedAtValues).toEqual(["2026-07-12T00:00:00Z"]);
    expect(run1.environment.networkDependency).toMatch(/^none;/);
  });

  it("maps every accepted response change to the documented merged production commit", () => {
    const run = readJson<ReconciliationRun>(run1Path);
    const inventory = readJson<MismatchInventory>(inventoryPath);

    expect(inventory.productionBaseSha).toBe(PRODUCTION_PARITY_BASE_COMMIT);
    expect(inventory.mismatchCount).toBe(7);
    expect(inventory.classificationCounts).toEqual({
      "intentional-production-behavior-change": 7,
      "serialization-or-order-change": 0,
      nondeterminism: 0,
      "stale-truth-or-fixture-data": 0,
      "environment-or-configuration-drift": 0,
      unknown: 0,
    });
    const mismatchKeys = (records: typeof inventory.records) =>
      records.map(
        ({
          caseId,
          expectedSha256,
          actualSha256,
          firstDifference: { jsonPath, fieldCategory },
        }) => ({
          caseId,
          expectedSha256,
          actualSha256,
          firstDifference: { jsonPath, fieldCategory },
        }),
      );
    expect(mismatchKeys(inventory.records)).toEqual(
      run.parity.mismatches.map(
        ({
          caseId,
          expectedSha256,
          actualSha256,
          firstDifference: { jsonPath, fieldCategory },
        }) => ({
          caseId,
          expectedSha256,
          actualSha256,
          firstDifference: { jsonPath, fieldCategory },
        }),
      ),
    );
    expect(inventory.records.every((record) => record.brandIdentical)).toBe(true);
    expect(
      inventory.records.every(
        (record) => record.cause === "intentional-production-behavior-change",
      ),
    ).toBe(true);
    expect(
      inventory.records
        .filter((record) => record.originatingPr === 150)
        .map((record) => record.originatingCommit),
    ).toEqual(Array(6).fill("5edec007cbef17fc86baac2d48ee902cb6c14df9"));
    expect(
      inventory.records
        .filter((record) => record.originatingPr === 151)
        .map((record) => record.originatingCommit),
    ).toEqual(["8827ec2ce8b901a38f6b136cbb35f1ac7a76437c"]);
    expect(inventory.records.some((record) => record.originatingPr === 194)).toBe(false);
  });

  it("binds the reconciled exact-byte fixture to the second capture's per-case hashes", () => {
    const run = readJson<ReconciliationRun>(run2Path);
    const inventory = readJson<MismatchInventory>(inventoryPath);
    const fixtureBytes = readFileSync(PRODUCTION_PARITY_FIXTURE_PATH);
    const fixture = JSON.parse(fixtureBytes.toString("utf8")) as ProductionAnalyzerParityFixture;

    expect(sha256(fixtureBytes)).toBe(inventory.newFixtureSha256);
    expect(inventory.oldFixtureSha256).not.toBe(inventory.newFixtureSha256);
    expect(fixture.baseCommit).toBe(PRODUCTION_PARITY_BASE_COMMIT);
    expect(fixture.records.map(({ caseId, sha256 }) => ({ caseId, sha256 }))).toEqual(
      run.actual.records.map(({ caseId, sha256 }) => ({ caseId, sha256 })),
    );
  });
});
