/**
 * Type declarations for the Stage 1 trusted freeze/staging core.
 *
 * The core itself is `.mjs` because the CLI runs it directly under `node`. This
 * sidecar exists so the Stage 1 contract tests can drive the REAL implementation
 * under TypeScript rather than reimplementing it.
 */

export declare const EXPERIMENT_ID: string;
export declare const BASE: string;
export declare const PR220_MERGE: string;
export declare const FIELD_SELECTION_SHA256: string;

export declare const PR217_PATH: string;
export declare const PR218_PATH: string;
export declare const EVAL_MANIFEST_PATH: string;

export declare const EXPECTED_TOTAL: number;
export declare const EXPECTED_BRAND_PRESENT: number;
export declare const EXPECTED_BRAND_ABSENT: number;

export declare const DECLARED_STAGED_DIRECTORY: string;
export declare const DECLARED_ID_MAP_LOCATION: string;
export declare const STAGING_PROHIBITED_INPUT_KEYS: string[];
export declare const ID_MAP_ACCESS_BOUNDARY: Record<string, unknown>;

export declare class FreezeError extends Error {
  constructor(code: string, detail: unknown);
  readonly code: string;
  readonly detail: unknown;
  readonly ocrRun: false;
}

export declare function sha256(bytes: Uint8Array | Buffer | string): string;

export interface StageOneAttributionCase {
  caseId: string;
  governedTruth: { present: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

export interface StageOneGenerationInput {
  pr217: { cases: StageOneAttributionCase[] };
  pr218: { frozenCaseIds: string[] };
  evalManifest: {
    records: Array<{
      caseId: string;
      imagePath: string;
      status: string;
      expectedSha256: string;
    }>;
  };
  loadSourceImage: (imagePath: string) => Buffer;
  forbiddenEvidenceKeys: string[];
  out: { root: string; postFreeze: string; staged: string };
}

export interface StageOneGenerationResult {
  written: {
    truthFreeInputManifest: string;
    populationFreeze: string;
    idMap: string;
  };
  stagedListing: string[];
  summary: {
    total: number;
    brandPresent: number;
    brandAbsent: number;
    opaqueIdRange: string;
    stagedFilesVerified: number;
    totalSourceImageBytes: number;
  };
}

export declare function generateStageOneArtifacts(
  input: StageOneGenerationInput,
): StageOneGenerationResult;

export declare function compareGeneratedArtifacts(input: {
  generated: StageOneGenerationResult["written"];
  expected: StageOneGenerationResult["written"];
}): string[];
