export interface AgentReviewSubmissionReceipt {
  submissionId: string;
  revisionId: string;
  revisionNumber: number;
  status: string;
  recordedAt: string;
}

interface InitialFinalizeReceipt {
  submissionId: string;
  revisionId: string;
  revisionNumber: number;
  status: "waiting_for_agent_review";
  receivingAgent: string;
  recordedAt: string;
}

interface ResubmitRevisionReceipt {
  action: "resubmit_revision";
  submissionId: string;
  parentRevisionId: string;
  parentRevisionNumber: number;
  revisionId: string;
  revisionNumber: number;
  respondedToDecisionId: string;
  currentStatus: "waiting_for_agent_review";
  submissionVersion: number;
  recordedAt: string;
}

const SAFE_SUBMISSION_ERROR = "The package could not be placed in the agent review queue.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInitialFinalizeReceipt(value: unknown): value is InitialFinalizeReceipt {
  return (
    isRecord(value) &&
    typeof value.submissionId === "string" &&
    typeof value.revisionId === "string" &&
    typeof value.revisionNumber === "number" &&
    value.status === "waiting_for_agent_review" &&
    typeof value.receivingAgent === "string" &&
    typeof value.recordedAt === "string"
  );
}

function isResubmitRevisionReceipt(value: unknown): value is ResubmitRevisionReceipt {
  return (
    isRecord(value) &&
    value.action === "resubmit_revision" &&
    typeof value.submissionId === "string" &&
    typeof value.revisionId === "string" &&
    typeof value.revisionNumber === "number" &&
    value.currentStatus === "waiting_for_agent_review" &&
    typeof value.recordedAt === "string"
  );
}

export function normalizeSubmissionReceipt(value: unknown): AgentReviewSubmissionReceipt | null {
  if (isInitialFinalizeReceipt(value)) {
    return {
      submissionId: value.submissionId,
      revisionId: value.revisionId,
      revisionNumber: value.revisionNumber,
      status: value.status,
      recordedAt: value.recordedAt,
    };
  }
  if (isResubmitRevisionReceipt(value)) {
    return {
      submissionId: value.submissionId,
      revisionId: value.revisionId,
      revisionNumber: value.revisionNumber,
      status: value.currentStatus,
      recordedAt: value.recordedAt,
    };
  }
  return null;
}

export function parseSubmissionErrorMessage(value: unknown): string {
  if (!isRecord(value) || !("error" in value)) return SAFE_SUBMISSION_ERROR;
  const error = value.error;
  if (typeof error === "string" && error.trim() !== "") return error;
  if (isRecord(error) && typeof error.message === "string" && error.message.trim() !== "") {
    return error.message;
  }
  return SAFE_SUBMISSION_ERROR;
}

export function safeSubmissionErrorMessage(): string {
  return SAFE_SUBMISSION_ERROR;
}
