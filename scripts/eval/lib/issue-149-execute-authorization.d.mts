/**
 * Type declarations for the execute-transition gate.
 *
 * The gate itself is `.mjs` so it runs under bare `node` in the workflow. This
 * sidecar exists so the synthetic-history tests drive the REAL decision function
 * under TypeScript rather than reimplementing its rules.
 */

export declare const PERMITTED_TRANSITION_PATHS: string[];
export declare const EXECUTE_MODE_BYTES: string;

export type ExecuteGateRule =
  | "AUTHORIZATION_ARTIFACT_ABSENT"
  | "AUTHORIZATION_MALFORMED"
  | "EXECUTE_NOT_AUTHORIZED"
  | "REVIEWED_HEAD_NOT_ANCESTOR"
  | "UNREVIEWED_FILE_CHANGED_AFTER_REVIEWED_HEAD"
  | "MODE_BYTES_NOT_EXACT"
  | "MODE_NOT_TRANSITIONED_TO_EXECUTE";

export interface ExecuteAuthorization {
  status?: string;
  reviewedImplementationSha?: string | null;
  experimentId?: string;
  authorizedBy?: string | null;
  authorizedAt?: string | null;
}

export interface ExecuteGateFacts {
  authorization: ExecuteAuthorization | null;
  headSha: string;
  reviewedShaIsAncestorOfHead: boolean;
  changedPathsSinceReviewedSha: string[];
  modeFileBytes: string;
}

export interface ExecuteGateVerdict {
  ok: boolean;
  haltCode: "EXECUTE_TRANSITION_REJECTED" | null;
  violations: Array<{ rule: ExecuteGateRule; detail: string }>;
}

export declare function evaluateExecuteTransition(facts: ExecuteGateFacts): ExecuteGateVerdict;
