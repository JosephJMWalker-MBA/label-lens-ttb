import { createHash } from "node:crypto";

import {
  validateObserverRegionProposal,
  validateVisionObserverResult,
} from "../observer-grid.schema";
import type { VisionObserverResult } from "../observer-grid.types";

import type { LocalVlmObservationFailureShape, LocalVlmResolvedConfig } from "./local-vlm.types";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function parseJsonEnvelope(raw: string):
  | { ok: true; json: string; fenced: boolean }
  | {
      ok: false;
      error: LocalVlmObservationFailureShape;
    } {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return { ok: true, json: fencedMatch[1]!, fenced: true };
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return { ok: true, json: trimmed, fenced: false };
  }
  return {
    ok: false,
    error: {
      code: "INVALID_OBSERVER_OUTPUT",
      message: "Model output must be exactly one JSON object or one enclosing JSON fence.",
      issues: ["leading or trailing prose is not allowed"],
    },
  };
}

export interface ParsedObserverResponse {
  result: VisionObserverResult;
  rawResponseDigest: string;
  structuredResponseDigest: string;
  schemaValid: true;
  prohibitedClaimDetected: boolean;
  duplicateProposalIdsDetected: boolean;
}

export function parseObserverResponse(args: {
  observationRunId: string;
  rawResponseText: string;
  responseBytes: number;
  config: LocalVlmResolvedConfig;
}):
  | { ok: true; value: ParsedObserverResponse }
  | {
      ok: false;
      error: LocalVlmObservationFailureShape;
      parseState: {
        jsonExtractionSuccess: boolean;
        schemaSuccess: boolean;
        prohibitedClaimDetected: boolean;
        duplicateProposalIdsDetected: boolean;
      };
    } {
  const rawDigest = createHash("sha256").update(args.rawResponseText).digest("hex");
  if (args.responseBytes > args.config.responseBytesMax) {
    return {
      ok: false,
      error: {
        code: "RESPONSE_TOO_LARGE",
        message: "Model response exceeded the configured byte budget.",
        issues: [`responseBytes=${args.responseBytes}`, `limit=${args.config.responseBytesMax}`],
      },
      parseState: {
        jsonExtractionSuccess: false,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
        duplicateProposalIdsDetected: false,
      },
    };
  }

  const envelope = parseJsonEnvelope(args.rawResponseText);
  if (!envelope.ok) {
    return {
      ok: false,
      error: envelope.error,
      parseState: {
        jsonExtractionSuccess: false,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
        duplicateProposalIdsDetected: false,
      },
    };
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(envelope.json);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INVALID_OBSERVER_OUTPUT",
        message: "Model output was not valid JSON.",
        issues: [error instanceof Error ? error.message : String(error)],
      },
      parseState: {
        jsonExtractionSuccess: true,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
        duplicateProposalIdsDetected: false,
      },
    };
  }

  const validated = validateVisionObserverResult(parsedValue);
  if (!validated.ok) {
    const prohibited = validated.error.issues.some((issue) =>
      /prohibited|authority|compliance|transcription/i.test(issue),
    );
    return {
      ok: false,
      error: {
        code: "INVALID_OBSERVER_OUTPUT",
        message: validated.error.message,
        issues: validated.error.issues,
      },
      parseState: {
        jsonExtractionSuccess: true,
        schemaSuccess: false,
        prohibitedClaimDetected: prohibited,
        duplicateProposalIdsDetected: false,
      },
    };
  }

  const duplicateIds = new Set<string>();
  let duplicateProposalIdsDetected = false;
  for (const candidate of validated.value.proposals) {
    const proposalResult = validateObserverRegionProposal(candidate);
    if (!proposalResult.ok) {
      return {
        ok: false,
        error: {
          code: "INVALID_OBSERVER_OUTPUT",
          message: proposalResult.error.message,
          issues: proposalResult.error.issues,
        },
        parseState: {
          jsonExtractionSuccess: true,
          schemaSuccess: false,
          prohibitedClaimDetected: proposalResult.error.issues.some((issue) =>
            /prohibited|authority|compliance|transcription/i.test(issue),
          ),
          duplicateProposalIdsDetected: false,
        },
      };
    }
    const proposal = proposalResult.value;
    const proposalId = proposal.proposalId;
    if (duplicateIds.has(proposalId)) {
      duplicateProposalIdsDetected = true;
      break;
    }
    duplicateIds.add(proposalId);
    if (proposal.reasonCodes.length > args.config.maxReasonCodesPerProposal) {
      return {
        ok: false,
        error: {
          code: "INVALID_OBSERVER_OUTPUT",
          message: "Model output exceeded the reason-code budget.",
          issues: [
            `${proposal.proposalId} emitted ${proposal.reasonCodes.length} reason codes`,
            `limit=${args.config.maxReasonCodesPerProposal}`,
          ],
        },
        parseState: {
          jsonExtractionSuccess: true,
          schemaSuccess: false,
          prohibitedClaimDetected: false,
          duplicateProposalIdsDetected: false,
        },
      };
    }
    if (proposal.description.length > args.config.maxDescriptionLength) {
      return {
        ok: false,
        error: {
          code: "INVALID_OBSERVER_OUTPUT",
          message: "Model output exceeded the description budget.",
          issues: [
            `${proposal.proposalId} description length=${proposal.description.length}`,
            `limit=${args.config.maxDescriptionLength}`,
          ],
        },
        parseState: {
          jsonExtractionSuccess: true,
          schemaSuccess: false,
          prohibitedClaimDetected: false,
          duplicateProposalIdsDetected: false,
        },
      };
    }
  }

  if (duplicateProposalIdsDetected) {
    return {
      ok: false,
      error: {
        code: "INVALID_OBSERVER_OUTPUT",
        message: "Model output reused a proposalId.",
        issues: ["proposalIds must be unique within one response"],
      },
      parseState: {
        jsonExtractionSuccess: true,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
        duplicateProposalIdsDetected: true,
      },
    };
  }

  if (validated.value.proposals.length > args.config.maxProposalsPerImage) {
    return {
      ok: false,
      error: {
        code: "INVALID_OBSERVER_OUTPUT",
        message: "Model output exceeded the proposal budget.",
        issues: [
          `proposalCount=${validated.value.proposals.length}`,
          `limit=${args.config.maxProposalsPerImage}`,
        ],
      },
      parseState: {
        jsonExtractionSuccess: true,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
        duplicateProposalIdsDetected: false,
      },
    };
  }

  if (validated.value.observationRunId !== args.observationRunId) {
    return {
      ok: false,
      error: {
        code: "INVALID_OBSERVER_OUTPUT",
        message: "Model output carried the wrong observationRunId.",
        issues: [`expected=${args.observationRunId}`, `actual=${validated.value.observationRunId}`],
      },
      parseState: {
        jsonExtractionSuccess: true,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
        duplicateProposalIdsDetected: false,
      },
    };
  }

  const structuredDigest = createHash("sha256")
    .update(stableStringify(validated.value))
    .digest("hex");

  return {
    ok: true,
    value: {
      result: validated.value,
      rawResponseDigest: rawDigest,
      structuredResponseDigest: structuredDigest,
      schemaValid: true,
      prohibitedClaimDetected: false,
      duplicateProposalIdsDetected: false,
    },
  };
}
