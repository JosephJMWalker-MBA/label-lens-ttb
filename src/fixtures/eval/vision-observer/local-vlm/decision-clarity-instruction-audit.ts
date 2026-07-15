import { createHash } from "node:crypto";

export const DECISION_CLARITY_INSTRUCTION_AUDIT_PROMPT_ID =
  "phase9-decision-clarity-instruction-audit" as const;
export const DECISION_CLARITY_INSTRUCTION_AUDIT_PROMPT_VERSION = "1.0.0" as const;

const SYSTEM_PROMPT_LINES = [
  "You are auditing a bounded observer-instruction packet.",
  "Analyze only the supplied instructions, response contract, and observable completion result.",
  "Do not describe hidden reasoning.",
  "Do not justify the observer's answer.",
  "Do not claim access to the observer's internal process.",
  "Answer only these questions:",
  "1. Which terms permit multiple interpretations?",
  "2. Which choices are left unresolved?",
  "3. Which assumptions are required to produce one answer?",
  "4. Which prioritization or tie-breaking rules are missing?",
  "5. How could the instructions be rewritten to preserve the task while reducing ambiguity?",
  "6. Should an explicit abstention path be permitted?",
] as const;

export interface DecisionClarityInstructionAuditInput {
  sourceContractIdentity: string;
  originalSystemPrompt: string;
  originalUserInstruction: string;
  responseContract: string | Record<string, unknown>;
  serviceDeadlineMet: boolean | null;
  eventualCompletionState: string;
  boundedEventualOutput: string | null;
}

export interface DecisionClarityInstructionAuditRequest {
  promptId: typeof DECISION_CLARITY_INSTRUCTION_AUDIT_PROMPT_ID;
  promptVersion: typeof DECISION_CLARITY_INSTRUCTION_AUDIT_PROMPT_VERSION;
  promptDigest: string;
  systemPrompt: string;
  userInstruction: string;
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJsonStringify(entry)}`)
    .join(",")}}`;
}

export function buildDecisionClarityInstructionAuditRequest(
  input: DecisionClarityInstructionAuditInput,
): DecisionClarityInstructionAuditRequest {
  const systemPrompt = SYSTEM_PROMPT_LINES.join("\n");
  const responseContract =
    typeof input.responseContract === "string"
      ? input.responseContract
      : stableJsonStringify(input.responseContract);
  const userInstruction = [
    `sourceContractIdentity: ${input.sourceContractIdentity}`,
    `serviceDeadlineMet: ${input.serviceDeadlineMet === null ? "unknown" : String(input.serviceDeadlineMet)}`,
    `eventualCompletionState: ${input.eventualCompletionState}`,
    "",
    "Original system prompt:",
    input.originalSystemPrompt,
    "",
    "Original user instruction:",
    input.originalUserInstruction,
    "",
    "Response contract:",
    responseContract,
    "",
    "Bounded eventual output:",
    input.boundedEventualOutput ?? "null",
  ].join("\n");
  const promptDigest = createHash("sha256")
    .update(systemPrompt)
    .update("\n---\n")
    .update(userInstruction)
    .digest("hex");

  return {
    promptId: DECISION_CLARITY_INSTRUCTION_AUDIT_PROMPT_ID,
    promptVersion: DECISION_CLARITY_INSTRUCTION_AUDIT_PROMPT_VERSION,
    promptDigest,
    systemPrompt,
    userInstruction,
  };
}
