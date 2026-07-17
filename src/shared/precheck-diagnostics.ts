import { randomUUID } from "node:crypto";

import type { ExecutableProvenance } from "@/domain/run/version-manifest.types";

const ENABLED_ENV = "LABEL_LENS_PRECHECK_DIAGNOSTICS";
const PREFIX = "PRECHECK_DIAGNOSTIC ";
const MAX_ISSUES = 8;
const MAX_ISSUE_LENGTH = 240;

const ABSOLUTE_PATH_RE =
  /(?:file:\/\/)?(?:[A-Za-z]:[\\/]|\/Users\/|\/home\/|\/private\/|\/var\/|\/tmp\/|\/opt\/)[^\s"'`)\]}]+/g;
const NODE_MODULE_PATH_RE = /\bnode_modules[\\/][^\s"'`)\]}]+/g;

export type PrecheckDiagnosticBoundary =
  | "request-accepted"
  | "image-resolved-and-hashed"
  | "image-decoded"
  | "ocr-language-data-resolved"
  | "ocr-core-resolved"
  | "ocr-worker-script-resolved"
  | "tesseract-worker-initialized"
  | "preprocessing-completed"
  | "ocr-pass-completed"
  | "field-selection-completed"
  | "analyzer-validation-completed"
  | "orchestration-completed"
  | "assembly-export-completed";

export type PrecheckDiagnosticLayer =
  "route" | "service" | "runtime-provenance" | "ocr" | "extractor" | "orchestrator" | "assembly";

interface DiagnosticSourceIdentity {
  sha256: string;
  mediaType: string;
  byteSize: number;
  width?: number;
  height?: number;
}

interface DiagnosticExecutableIdentity {
  packageVersion: string;
  gitCommitSha?: string;
  commitProvenance?: string;
  extractionAdapterId: string;
  extractionAdapterVersion: string;
  ocrEngineId?: string;
  ocrEngineVersion?: string;
  ocrModelId?: string;
  ocrModelSha256?: string;
  parserId: string;
  parserVersion: string;
  ruleProfileId: string;
  ruleProfileVersion: string;
  nodeVersion: string;
}

export interface PrecheckDiagnosticDetail {
  passId?: string;
  passKind?: string;
}

interface DiagnosticErrorInfo {
  layer: PrecheckDiagnosticLayer;
  code: string;
  issues: string[];
}

interface DiagnosticEvent {
  kind: "precheck-diagnostic";
  runId: string;
  status: "reached" | "failed" | "probe-unavailable";
  boundary: PrecheckDiagnosticBoundary;
  elapsedMs: number;
  source?: DiagnosticSourceIdentity;
  executable?: DiagnosticExecutableIdentity;
  detail?: PrecheckDiagnosticDetail;
  error?: DiagnosticErrorInfo;
}

export interface PrecheckDiagnosticTrace {
  readonly runId: string;
  requestAccepted(): void;
  recordSource(source: { sha256: string; mediaType: string; byteSize: number }): void;
  recordDecoded(decoded: { width: number; height: number }): void;
  recordExecutable(provenance: ExecutableProvenance): void;
  reach(
    boundary: PrecheckDiagnosticBoundary,
    detail?: PrecheckDiagnosticDetail,
    options?: { once?: boolean },
  ): void;
  fail(
    boundary: PrecheckDiagnosticBoundary,
    error: { layer: PrecheckDiagnosticLayer; code: string; issues?: string[] },
    detail?: PrecheckDiagnosticDetail,
  ): void;
  probeUnavailable(
    boundary: PrecheckDiagnosticBoundary,
    error: { layer: PrecheckDiagnosticLayer; code: string; issues?: string[] },
  ): void;
}

class DiagnosticTrace implements PrecheckDiagnosticTrace {
  readonly runId = randomUUID();
  private readonly startedAt = performance.now();
  private readonly seen = new Set<string>();
  private source?: DiagnosticSourceIdentity;
  private executable?: DiagnosticExecutableIdentity;

  requestAccepted(): void {
    this.reach("request-accepted", undefined, { once: true });
  }

  recordSource(source: { sha256: string; mediaType: string; byteSize: number }): void {
    this.source = { ...this.source, ...source };
    this.reach("image-resolved-and-hashed", undefined, { once: true });
  }

  recordDecoded(decoded: { width: number; height: number }): void {
    this.source = { ...this.source, ...decoded } as DiagnosticSourceIdentity;
    this.reach("image-decoded", undefined, { once: true });
  }

  recordExecutable(provenance: ExecutableProvenance): void {
    const ocr =
      provenance.ocrEngine.kind === "ocr"
        ? {
            ocrEngineId: provenance.ocrEngine.engineId,
            ocrEngineVersion: provenance.ocrEngine.engineVersion,
            ocrModelId: provenance.ocrEngine.modelId,
            ocrModelSha256: provenance.ocrEngine.modelSha256,
          }
        : {};
    this.executable = {
      packageVersion: provenance.applicationBuild.packageVersion,
      gitCommitSha: provenance.applicationBuild.gitCommitSha,
      commitProvenance: provenance.applicationBuild.commitProvenance,
      extractionAdapterId: provenance.extractionAdapterId,
      extractionAdapterVersion: provenance.extractionAdapterVersion,
      parserId: provenance.parserId,
      parserVersion: provenance.parserVersion,
      ruleProfileId: provenance.ruleProfileId,
      ruleProfileVersion: provenance.ruleProfileVersion,
      nodeVersion: process.version,
      ...ocr,
    };
  }

  reach(
    boundary: PrecheckDiagnosticBoundary,
    detail?: PrecheckDiagnosticDetail,
    options?: { once?: boolean },
  ): void {
    if (options?.once !== false && this.seen.has(boundary)) return;
    if (options?.once !== false) this.seen.add(boundary);
    this.emit({ status: "reached", boundary, detail });
  }

  fail(
    boundary: PrecheckDiagnosticBoundary,
    error: { layer: PrecheckDiagnosticLayer; code: string; issues?: string[] },
    detail?: PrecheckDiagnosticDetail,
  ): void {
    this.emit({
      status: "failed",
      boundary,
      detail,
      error: {
        layer: error.layer,
        code: error.code,
        issues: sanitizeIssues(error.issues ?? []),
      },
    });
  }

  probeUnavailable(
    boundary: PrecheckDiagnosticBoundary,
    error: { layer: PrecheckDiagnosticLayer; code: string; issues?: string[] },
  ): void {
    this.emit({
      status: "probe-unavailable",
      boundary,
      error: {
        layer: error.layer,
        code: error.code,
        issues: sanitizeIssues(error.issues ?? []),
      },
    });
  }

  private emit(input: {
    status: "reached" | "failed" | "probe-unavailable";
    boundary: PrecheckDiagnosticBoundary;
    detail?: PrecheckDiagnosticDetail;
    error?: DiagnosticErrorInfo;
  }): void {
    const event: DiagnosticEvent = {
      kind: "precheck-diagnostic",
      runId: this.runId,
      status: input.status,
      boundary: input.boundary,
      elapsedMs: Math.round(performance.now() - this.startedAt),
      ...(this.source ? { source: this.source } : {}),
      ...(this.executable ? { executable: this.executable } : {}),
      ...(input.detail ? { detail: input.detail } : {}),
      ...(input.error ? { error: input.error } : {}),
    };
    process.stderr.write(PREFIX + JSON.stringify(event) + "\n");
  }
}

export function sanitizePrecheckDiagnosticIssues(issues: string[]): string[] {
  return issues
    .map((issue) =>
      issue
        .replace(/\r?\n[\s\S]*$/, "")
        .replace(ABSOLUTE_PATH_RE, "<path>")
        .replace(NODE_MODULE_PATH_RE, "<path>")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((issue) => issue !== "")
    .slice(0, MAX_ISSUES)
    .map((issue) =>
      issue.length > MAX_ISSUE_LENGTH ? `${issue.slice(0, MAX_ISSUE_LENGTH - 3)}...` : issue,
    );
}

function sanitizeIssues(issues: string[]): string[] {
  return sanitizePrecheckDiagnosticIssues(issues);
}

export function createPrecheckDiagnosticTrace(): PrecheckDiagnosticTrace | undefined {
  return process.env[ENABLED_ENV] === "1" ? new DiagnosticTrace() : undefined;
}
