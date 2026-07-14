export const PHASE1_DIAGNOSTIC_STATUSES = ["PASS", "FAIL", "BLOCKED"] as const;

export const PHASE1_DIAGNOSTIC_LAYERS = ["image-transport", "vision-attention"] as const;

export type Phase1DiagnosticStatus = (typeof PHASE1_DIAGNOSTIC_STATUSES)[number];
export type Phase1DiagnosticLayer = (typeof PHASE1_DIAGNOSTIC_LAYERS)[number];

export interface Phase1DiagnosticReport<TEvidence> {
  layer: Phase1DiagnosticLayer;
  status: Phase1DiagnosticStatus;
  summary: string;
  issues: readonly string[];
  evidence: TEvidence;
  blockedBy: Phase1DiagnosticLayer | null;
}

export function blockedPhase1DiagnosticReport(args: {
  layer: Phase1DiagnosticLayer;
  blockedBy: Phase1DiagnosticLayer;
  summary: string;
  issues?: readonly string[];
}): Phase1DiagnosticReport<null> {
  return {
    layer: args.layer,
    status: "BLOCKED",
    summary: args.summary,
    issues: args.issues ?? [],
    evidence: null,
    blockedBy: args.blockedBy,
  };
}
