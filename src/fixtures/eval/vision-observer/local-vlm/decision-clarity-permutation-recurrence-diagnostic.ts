import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildVisionChatRequestBody } from "./llama-server-client";
import { readLlamaVersionOutput } from "./llama-server-config";
import {
  buildBlockedDecisionClarityTrialReport,
  buildDecisionClarityCanonicalFingerprints,
  buildDecisionClarityFingerprintOverlay,
  buildDecisionClaritySpec,
  DECISION_CLARITY_CONTRACTS,
  DECISION_CLARITY_HARD_CEILING_MS,
  DECISION_CLARITY_SERVICE_DEADLINE_MS,
  type DecisionClarityCanonicalFingerprint,
  type DecisionClarityCompletionState,
  type DecisionClarityContract,
  type DecisionClarityDiagnosticStatus,
  type DecisionClarityPreparedTrialRequest,
  type DecisionClarityScheduledTrial,
  type DecisionClaritySpec,
  type DecisionClarityTrialEvidence,
  type DecisionClarityTrialReport,
  runOneDecisionClarityTrial,
} from "./decision-clarity-diagnostic";
import type { LlamaServerLaunchSpec, LocalVlmResolvedConfig } from "./local-vlm.types";

export const DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEMA_VERSION =
  "local-vlm-decision-clarity-permutation-recurrence.v1" as const;
export const DECISION_CLARITY_PERMUTATION_RECURRENCE_CLASSIFICATIONS = [
  "TARGET_PERMUTATION_RECURRENCE_SUPPORTED",
  "NO_TARGET_PERMUTATION_RECURRENCE_OBSERVED",
  "TARGET_PERMUTATION_RECURRENCE_CONTRADICTED",
  "INSUFFICIENT_EVIDENCE",
] as const;
export const DECISION_CLARITY_PERMUTATION_RECURRENCE_CYCLES = 6 as const;
export const DECISION_CLARITY_PERMUTATION_RECURRENCE_TRIALS_PER_BLOCK = 3 as const;
export const DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS = 36 as const;
export const DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_TRIALS = 108 as const;
export const DECISION_CLARITY_PERMUTATION_RECURRENCE_CONTROL_MIN_TIMELY_VALID = 34 as const;
export const DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION = "P4" as const;

const DECISION_CLARITY_PERMUTATION_RECURRENCE_POSITIONS = [1, 2, 3] as const;
const DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE = [
  {
    permutationId: "P1",
    contracts: ["A", "A_PRIME", "B"] as const,
    label: "A -> A_PRIME -> B",
    targetPermutation: false,
  },
  {
    permutationId: "P2",
    contracts: ["A", "B", "A_PRIME"] as const,
    label: "A -> B -> A_PRIME",
    targetPermutation: false,
  },
  {
    permutationId: "P3",
    contracts: ["A_PRIME", "A", "B"] as const,
    label: "A_PRIME -> A -> B",
    targetPermutation: false,
  },
  {
    permutationId: DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION,
    contracts: ["A_PRIME", "B", "A"] as const,
    label: "A_PRIME -> B -> A",
    targetPermutation: true,
  },
  {
    permutationId: "P5",
    contracts: ["B", "A", "A_PRIME"] as const,
    label: "B -> A -> A_PRIME",
    targetPermutation: false,
  },
  {
    permutationId: "P6",
    contracts: ["B", "A_PRIME", "A"] as const,
    label: "B -> A_PRIME -> A",
    targetPermutation: false,
  },
] as const;

type DecisionClarityPermutationRecurrenceClassificationName =
  (typeof DECISION_CLARITY_PERMUTATION_RECURRENCE_CLASSIFICATIONS)[number];
type DecisionClarityPermutationRecurrencePermutationId =
  (typeof DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE)[number]["permutationId"];
type DecisionClarityPermutationRecurrencePosition =
  (typeof DECISION_CLARITY_PERMUTATION_RECURRENCE_POSITIONS)[number];

type DecisionClarityPermutationRecurrenceLedgerEntryLike = {
  sequenceNumber: number;
  cycleNumber: number;
  blockNumber: number;
  permutationId: string;
  positionWithinBlock: number;
  contract: string;
};

export interface DecisionClarityPermutationRecurrenceScheduledTrial extends DecisionClarityScheduledTrial {
  cycleNumber: number;
  blockNumber: number;
  permutationId: DecisionClarityPermutationRecurrencePermutationId;
  positionWithinBlock: DecisionClarityPermutationRecurrencePosition;
}

export interface DecisionClarityPermutationRecurrenceLatencySummary {
  sampleCount: number;
  minimum: number | null;
  median: number | null;
  maximum: number | null;
  mean: number | null;
  standardDeviation: number | null;
  p95: number | null;
  serviceDeadlineMissCount: number;
  hardNonCompletionCount: number;
  smallSampleDescriptive: true;
}

export interface DecisionClarityPermutationRecurrenceTrialReport {
  sequenceNumber: number;
  cycleNumber: number;
  blockNumber: number;
  permutationId: DecisionClarityPermutationRecurrencePermutationId;
  positionWithinBlock: DecisionClarityPermutationRecurrencePosition;
  contract: DecisionClarityContract;
  sourceBuilder: DecisionClaritySpec["sourceBuilder"];
  requestFingerprint: DecisionClarityTrialReport["requestFingerprint"];
  status: DecisionClarityDiagnosticStatus;
  completionState: DecisionClarityCompletionState;
  summary: string;
  issues: readonly string[];
  blockedBySequenceNumber: number | null;
  evidence: DecisionClarityTrialEvidence | null;
}

export interface DecisionClarityPermutationRecurrencePermutationFinding {
  permutationId: DecisionClarityPermutationRecurrencePermutationId;
  permutationLabel: string;
  targetPermutation: boolean;
  contract: DecisionClarityContract;
  expectedAppearances: number;
  executedAppearances: number;
  timelyValidCount: number;
  timelyInvalidCount: number;
  lateValidCount: number;
  lateInvalidCount: number;
  hardNonCompletionCount: number;
  requestNotSentCount: number;
  transportFailureCount: number;
  processFailureCount: number;
  provenanceFailureCount: number;
  blockedCount: number;
  fingerprintMismatchCount: number;
  completeEvidence: boolean;
  latencySummary: DecisionClarityPermutationRecurrenceLatencySummary;
}

export interface DecisionClarityPermutationRecurrencePositionFinding {
  position: DecisionClarityPermutationRecurrencePosition;
  appearances: number;
  timelyValidCount: number;
  attributableFailureCount: number;
  unusableCount: number;
}

export interface DecisionClarityPermutationRecurrenceBlockRecord {
  cycleNumber: number;
  blockNumber: number;
  permutationId: DecisionClarityPermutationRecurrencePermutationId;
  targetPermutation: boolean;
  aSequenceNumber: number | null;
  aPosition: DecisionClarityPermutationRecurrencePosition | null;
  aCompletionState: DecisionClarityCompletionState | null;
  aTimelyValid: boolean;
  aAttributableFailure: boolean;
  aCompletionLatencyMs: number | null;
  aPrimeCompletionState: DecisionClarityCompletionState | null;
  bCompletionState: DecisionClarityCompletionState | null;
  blockUsable: boolean;
  issues: readonly string[];
}

export interface DecisionClarityPermutationRecurrenceControlStability {
  contract: "A_PRIME" | "B";
  timelyValidCount: number;
  minimumRequired: number;
  stable: boolean;
}

export interface DecisionClarityPermutationRecurrenceScheduleAudit {
  passed: boolean;
  totalTrials: number;
  totalBlocks: number;
  totalCycles: number;
  totalPermutations: number;
  targetPermutationId: DecisionClarityPermutationRecurrencePermutationId | null;
  appearancesByContract: Record<DecisionClarityContract, number>;
  appearancesByPermutation: Record<DecisionClarityPermutationRecurrencePermutationId, number>;
  appearancesByPosition: Record<
    DecisionClarityContract,
    Record<DecisionClarityPermutationRecurrencePosition, number>
  >;
  blockCountsByCycle: Record<number, number>;
  issues: readonly string[];
}

export interface DecisionClarityPermutationRecurrenceClassification {
  recurrenceStatus: DecisionClarityPermutationRecurrenceClassificationName;
  completeEvidenceGateSatisfied: boolean;
  targetPermutationId: typeof DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION;
  targetFailureCount: number;
  totalAttributableAFailures: number;
  highestNonTargetFailureCount: number;
  highestNonTargetPermutationIds: readonly DecisionClarityPermutationRecurrencePermutationId[];
  contradictingPermutationIds: readonly DecisionClarityPermutationRecurrencePermutationId[];
  attributableAFailureCountsByPermutation: Record<
    DecisionClarityPermutationRecurrencePermutationId,
    number
  >;
  failureCyclesByPermutation: Record<
    DecisionClarityPermutationRecurrencePermutationId,
    readonly number[]
  >;
  aPrimeTimelyValidCount: number;
  bTimelyValidCount: number;
  notes: readonly string[];
}

export interface DecisionClarityPermutationRecurrenceDiagnosticReport {
  schemaVersion: typeof DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEMA_VERSION;
  generatedAt: string;
  gitCommit: string;
  runtime: {
    runtimeKind: LocalVlmResolvedConfig["runtimeKind"];
    executableDigest: string;
    runtimeVersion: string | null;
    modelDigest: string;
    projectorDigest: string | null;
    modelDisplayId: string;
    host: string;
    contextSize: number;
    maxOutputTokens: number;
    temperature: number;
    seed: number;
    configuredRequestTimeoutMs: number;
  };
  deadlines: {
    serviceDeadlineMs: number;
    hardCeilingMs: number;
  };
  source: {
    scenarioId: string;
    sourceArtifactRef: string;
    sourceMediaType: string;
    sourceWidth: number;
    sourceHeight: number;
  };
  schedule: {
    cycles: number;
    blocksPerCycle: number;
    trialsPerBlock: number;
    totalBlocks: number;
    totalTrials: number;
    targetPermutationId: typeof DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION;
    permutations: readonly {
      permutationId: DecisionClarityPermutationRecurrencePermutationId;
      contracts: readonly DecisionClarityContract[];
      label: string;
      targetPermutation: boolean;
    }[];
  };
  scheduleAudit: DecisionClarityPermutationRecurrenceScheduleAudit;
  requestFingerprints: readonly DecisionClarityCanonicalFingerprint[];
  trials: readonly DecisionClarityPermutationRecurrenceTrialReport[];
  permutationFindings: readonly DecisionClarityPermutationRecurrencePermutationFinding[];
  positionFindings: readonly DecisionClarityPermutationRecurrencePositionFinding[];
  blockRecords: readonly DecisionClarityPermutationRecurrenceBlockRecord[];
  controlStability: readonly DecisionClarityPermutationRecurrenceControlStability[];
  classification: DecisionClarityPermutationRecurrenceClassification;
  fatalStopReason: string | null;
}

function currentGitCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function phase10CompatibleTrial(
  trial: DecisionClarityPermutationRecurrenceScheduledTrial,
): DecisionClarityScheduledTrial {
  return {
    sequenceNumber: trial.sequenceNumber,
    repetitionNumber: trial.repetitionNumber,
    sequencePosition: trial.sequencePosition,
    contract: trial.contract,
  };
}

function toPermutationRecurrenceTrialReport(args: {
  trial: DecisionClarityPermutationRecurrenceScheduledTrial;
  report: DecisionClarityTrialReport;
}): DecisionClarityPermutationRecurrenceTrialReport {
  return {
    sequenceNumber: args.trial.sequenceNumber,
    cycleNumber: args.trial.cycleNumber,
    blockNumber: args.trial.blockNumber,
    permutationId: args.trial.permutationId,
    positionWithinBlock: args.trial.positionWithinBlock,
    contract: args.trial.contract,
    sourceBuilder: args.report.sourceBuilder,
    requestFingerprint: args.report.requestFingerprint,
    status: args.report.status,
    completionState: args.report.completionState,
    summary: args.report.summary,
    issues: args.report.issues,
    blockedBySequenceNumber: args.report.blockedBySequenceNumber,
    evidence: args.report.evidence,
  };
}

function buildBlockedPermutationRecurrenceTrialReport(args: {
  trial: DecisionClarityPermutationRecurrenceScheduledTrial;
  fingerprints: readonly DecisionClarityCanonicalFingerprint[];
  blockedBySequenceNumber: number;
  reason: string;
}): DecisionClarityPermutationRecurrenceTrialReport {
  return toPermutationRecurrenceTrialReport({
    trial: args.trial,
    report: buildBlockedDecisionClarityTrialReport({
      trial: phase10CompatibleTrial(args.trial),
      spec: buildDecisionClaritySpec(args.trial.contract, "<permutation-recurrence-blocked-trial>"),
      fingerprints: args.fingerprints,
      blockedBySequenceNumber: args.blockedBySequenceNumber,
      reason: args.reason,
    }),
  });
}

function emptyPositionCounts() {
  return Object.fromEntries(
    DECISION_CLARITY_PERMUTATION_RECURRENCE_POSITIONS.map((position) => [position, 0]),
  ) as Record<DecisionClarityPermutationRecurrencePosition, number>;
}

function descriptiveStats(
  values: readonly number[],
): Omit<
  DecisionClarityPermutationRecurrenceLatencySummary,
  "serviceDeadlineMissCount" | "hardNonCompletionCount" | "smallSampleDescriptive"
> {
  if (values.length === 0) {
    return {
      sampleCount: 0,
      minimum: null,
      median: null,
      maximum: null,
      mean: null,
      standardDeviation: null,
      p95: null,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sampleCount = sorted.length;
  const minimum = sorted[0] ?? null;
  const maximum = sorted.at(-1) ?? null;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sampleCount;
  const median =
    sampleCount % 2 === 1
      ? sorted[(sampleCount - 1) / 2]!
      : (sorted[sampleCount / 2 - 1]! + sorted[sampleCount / 2]!) / 2;
  const variance =
    sampleCount === 1
      ? 0
      : sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sampleCount;
  const p95Index = Math.min(sampleCount - 1, Math.ceil(sampleCount * 0.95) - 1);

  return {
    sampleCount,
    minimum,
    median,
    maximum,
    mean,
    standardDeviation: Math.sqrt(variance),
    p95: sorted[p95Index] ?? null,
  };
}

function isTimelyValidState(state: DecisionClarityCompletionState | null): boolean {
  return state === "TIMELY_VALID_COMPLETION";
}

function isAttributableAFailureState(state: DecisionClarityCompletionState | null): boolean {
  return (
    state === "TIMELY_INVALID_COMPLETION" ||
    state === "LATE_VALID_COMPLETION" ||
    state === "LATE_INVALID_COMPLETION" ||
    state === "HARD_NON_COMPLETION"
  );
}

function makesBlockUnusable(state: DecisionClarityCompletionState): boolean {
  return (
    state === "BLOCKED" ||
    state === "PROVENANCE_FAILURE" ||
    state === "REQUEST_NOT_SENT" ||
    state === "TRANSPORT_FAILURE" ||
    state === "PROCESS_FAILURE"
  );
}

function isUnusableTrial(trial: DecisionClarityPermutationRecurrenceTrialReport | null): boolean {
  return (
    trial === null ||
    !trial.requestFingerprint.allFieldsMatched ||
    makesBlockUnusable(trial.completionState)
  );
}

function formatNumber(value: number | null): string {
  return value === null ? "null" : Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function expectedPermutationForBlock(
  blockNumber: number,
): (typeof DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE)[number] {
  const index =
    (blockNumber - 1) % DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.length;
  return DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE[index]!;
}

function auditDecisionClarityPermutationRecurrenceSchedule(
  schedule: readonly DecisionClarityPermutationRecurrenceLedgerEntryLike[],
): DecisionClarityPermutationRecurrenceScheduleAudit {
  const appearancesByContract = Object.fromEntries(
    DECISION_CLARITY_CONTRACTS.map((contract) => [contract, 0]),
  ) as Record<DecisionClarityContract, number>;
  const appearancesByPermutation = Object.fromEntries(
    DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.map((entry) => [
      entry.permutationId,
      0,
    ]),
  ) as Record<DecisionClarityPermutationRecurrencePermutationId, number>;
  const appearancesByPosition = Object.fromEntries(
    DECISION_CLARITY_CONTRACTS.map((contract) => [contract, emptyPositionCounts()]),
  ) as Record<
    DecisionClarityContract,
    Record<DecisionClarityPermutationRecurrencePosition, number>
  >;
  const blockCountsByCycle: Record<number, number> = {};
  const issues: string[] = [];

  if (schedule.length !== DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_TRIALS) {
    issues.push(
      `expected exactly ${DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_TRIALS} trials, found ${schedule.length}`,
    );
  }

  const blockMap = new Map<number, DecisionClarityPermutationRecurrenceLedgerEntryLike[]>();
  const seenSequenceNumbers = new Set<number>();
  const seenBlocks = new Set<number>();
  const seenCycles = new Set<number>();

  for (const trial of schedule) {
    blockMap.set(trial.blockNumber, [...(blockMap.get(trial.blockNumber) ?? []), trial]);
    seenSequenceNumbers.add(trial.sequenceNumber);
    seenBlocks.add(trial.blockNumber);
    seenCycles.add(trial.cycleNumber);

    if (DECISION_CLARITY_CONTRACTS.includes(trial.contract as DecisionClarityContract)) {
      const contract = trial.contract as DecisionClarityContract;
      appearancesByContract[contract] += 1;
      if (
        DECISION_CLARITY_PERMUTATION_RECURRENCE_POSITIONS.includes(
          trial.positionWithinBlock as DecisionClarityPermutationRecurrencePosition,
        )
      ) {
        const position = trial.positionWithinBlock as DecisionClarityPermutationRecurrencePosition;
        appearancesByPosition[contract][position] += 1;
      } else {
        issues.push(
          `sequence ${trial.sequenceNumber} has invalid positionWithinBlock=${trial.positionWithinBlock}`,
        );
      }
    } else {
      issues.push(`sequence ${trial.sequenceNumber} has unknown contract=${trial.contract}`);
    }

    if (
      !DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.some(
        (entry) => entry.permutationId === trial.permutationId,
      )
    ) {
      issues.push(
        `sequence ${trial.sequenceNumber} has unknown permutationId=${trial.permutationId}`,
      );
    }
  }

  if (seenSequenceNumbers.size !== schedule.length) {
    issues.push("sequence numbers must be unique");
  }
  if (seenBlocks.size !== DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS) {
    issues.push(
      `expected exactly ${DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS} blocks, found ${seenBlocks.size}`,
    );
  }
  if (seenCycles.size !== DECISION_CLARITY_PERMUTATION_RECURRENCE_CYCLES) {
    issues.push(
      `expected exactly ${DECISION_CLARITY_PERMUTATION_RECURRENCE_CYCLES} cycles, found ${seenCycles.size}`,
    );
  }

  const sortedSequenceNumbers = [...seenSequenceNumbers].sort((left, right) => left - right);
  for (let index = 0; index < sortedSequenceNumbers.length; index += 1) {
    const expected = index + 1;
    if (sortedSequenceNumbers[index] !== expected) {
      issues.push("sequence numbers must be contiguous from 1 through 108");
      break;
    }
  }

  const sortedBlockNumbers = [...seenBlocks].sort((left, right) => left - right);
  for (let index = 0; index < sortedBlockNumbers.length; index += 1) {
    const expected = index + 1;
    if (sortedBlockNumbers[index] !== expected) {
      issues.push("block numbers must be contiguous from 1 through 36");
      break;
    }
  }

  const sortedCycles = [...seenCycles].sort((left, right) => left - right);
  for (let index = 0; index < sortedCycles.length; index += 1) {
    const expected = index + 1;
    if (sortedCycles[index] !== expected) {
      issues.push("cycle numbers must be contiguous from 1 through 6");
      break;
    }
  }

  for (const contract of DECISION_CLARITY_CONTRACTS) {
    if (appearancesByContract[contract] !== 36) {
      issues.push(
        `contract ${contract} must appear exactly 36 times, found ${appearancesByContract[contract]}`,
      );
    }
    for (const position of DECISION_CLARITY_PERMUTATION_RECURRENCE_POSITIONS) {
      if (appearancesByPosition[contract][position] !== 12) {
        issues.push(
          `contract ${contract} must appear exactly 12 times in position ${position}, found ${appearancesByPosition[contract][position]}`,
        );
      }
    }
  }

  for (const blockTrials of blockMap.values()) {
    const cycleNumber = blockTrials[0]?.cycleNumber;
    if (cycleNumber !== undefined) {
      blockCountsByCycle[cycleNumber] = (blockCountsByCycle[cycleNumber] ?? 0) + 1;
    }
    const permutationId = blockTrials[0]?.permutationId;
    if (
      permutationId !== undefined &&
      DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.some(
        (entry) => entry.permutationId === permutationId,
      )
    ) {
      appearancesByPermutation[
        permutationId as DecisionClarityPermutationRecurrencePermutationId
      ] += 1;
    }
  }

  for (const entry of DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE) {
    if (appearancesByPermutation[entry.permutationId] !== 6) {
      issues.push(
        `permutation ${entry.permutationId} must appear exactly 6 times, found ${appearancesByPermutation[entry.permutationId]}`,
      );
    }
  }

  for (
    let cycleNumber = 1;
    cycleNumber <= DECISION_CLARITY_PERMUTATION_RECURRENCE_CYCLES;
    cycleNumber += 1
  ) {
    if (blockCountsByCycle[cycleNumber] !== 6) {
      issues.push(
        `cycle ${cycleNumber} must contain exactly 6 blocks, found ${blockCountsByCycle[cycleNumber] ?? 0}`,
      );
    }
  }

  for (
    let blockNumber = 1;
    blockNumber <= DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS;
    blockNumber += 1
  ) {
    const blockTrials = blockMap.get(blockNumber) ?? [];
    if (blockTrials.length !== DECISION_CLARITY_PERMUTATION_RECURRENCE_TRIALS_PER_BLOCK) {
      issues.push(
        `block ${blockNumber} must contain exactly 3 trials, found ${blockTrials.length}`,
      );
      continue;
    }

    const expectedPermutation = expectedPermutationForBlock(blockNumber);
    const expectedCycleNumber =
      Math.floor(
        (blockNumber - 1) / DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.length,
      ) + 1;
    const cycleNumbers = new Set(blockTrials.map((trial) => trial.cycleNumber));
    if (cycleNumbers.size !== 1 || !cycleNumbers.has(expectedCycleNumber)) {
      issues.push(`block ${blockNumber} must belong to cycle ${expectedCycleNumber}`);
    }

    const permutationIds = new Set(blockTrials.map((trial) => trial.permutationId));
    if (permutationIds.size !== 1 || !permutationIds.has(expectedPermutation.permutationId)) {
      issues.push(`block ${blockNumber} must use permutation ${expectedPermutation.permutationId}`);
    }

    const positions = [...new Set(blockTrials.map((trial) => trial.positionWithinBlock))].sort(
      (left, right) => left - right,
    );
    if (positions.length !== 3 || positions[0] !== 1 || positions[1] !== 2 || positions[2] !== 3) {
      issues.push(`block ${blockNumber} must use positions 1, 2, and 3 exactly once`);
    }

    const blockContracts = blockTrials
      .slice()
      .sort((left, right) => left.positionWithinBlock - right.positionWithinBlock)
      .map((trial) => trial.contract);
    if (
      blockContracts.length !== expectedPermutation.contracts.length ||
      blockContracts.some((contract, index) => contract !== expectedPermutation.contracts[index])
    ) {
      issues.push(
        `block ${blockNumber} must match the exact permutation order ${expectedPermutation.contracts.join(" -> ")}`,
      );
    }

    if (
      new Set(blockTrials.map((trial) => trial.contract)).size !== DECISION_CLARITY_CONTRACTS.length
    ) {
      issues.push(`block ${blockNumber} must contain A, A_PRIME, and B exactly once`);
    }
  }

  const targetPermutations = DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.filter(
    (entry) => entry.targetPermutation,
  );
  if (targetPermutations.length !== 1) {
    issues.push("exactly one permutation must be marked as the target permutation");
  }
  const targetPermutationId = targetPermutations[0]?.permutationId ?? null;
  if (targetPermutationId !== DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION) {
    issues.push(
      `target permutation must be ${DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION}`,
    );
  }
  if (
    targetPermutations[0]?.contracts.join(" -> ") !==
    DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE[3]!.contracts.join(" -> ")
  ) {
    issues.push("target permutation must match the exact order A_PRIME -> B -> A");
  }

  return {
    passed: issues.length === 0,
    totalTrials: schedule.length,
    totalBlocks: blockMap.size,
    totalCycles: seenCycles.size,
    totalPermutations: Object.values(appearancesByPermutation).filter((count) => count > 0).length,
    targetPermutationId:
      targetPermutationId as DecisionClarityPermutationRecurrencePermutationId | null,
    appearancesByContract,
    appearancesByPermutation,
    appearancesByPosition,
    blockCountsByCycle,
    issues,
  };
}

export function validateDecisionClarityPermutationRecurrenceSchedule(
  schedule: readonly DecisionClarityPermutationRecurrenceLedgerEntryLike[],
): DecisionClarityPermutationRecurrenceScheduleAudit {
  const audit = auditDecisionClarityPermutationRecurrenceSchedule(schedule);
  if (!audit.passed) {
    throw new Error(
      `invalid decision-clarity permutation recurrence schedule: ${audit.issues.join("; ")}`,
    );
  }
  return audit;
}

export function buildDecisionClarityPermutationRecurrenceSchedule(): readonly DecisionClarityPermutationRecurrenceScheduledTrial[] {
  const trials: DecisionClarityPermutationRecurrenceScheduledTrial[] = [];
  let sequenceNumber = 1;
  let blockNumber = 1;

  for (
    let cycleNumber = 1;
    cycleNumber <= DECISION_CLARITY_PERMUTATION_RECURRENCE_CYCLES;
    cycleNumber += 1
  ) {
    for (const permutation of DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE) {
      permutation.contracts.forEach((contract, index) => {
        const positionWithinBlock = (index + 1) as DecisionClarityPermutationRecurrencePosition;
        trials.push({
          sequenceNumber,
          repetitionNumber: cycleNumber,
          sequencePosition: positionWithinBlock,
          cycleNumber,
          blockNumber,
          permutationId: permutation.permutationId,
          positionWithinBlock,
          contract,
        });
        sequenceNumber += 1;
      });
      blockNumber += 1;
    }
  }

  validateDecisionClarityPermutationRecurrenceSchedule(trials);
  return trials;
}

export function buildDecisionClarityPermutationRecurrenceCanonicalFingerprints(args: {
  config: LocalVlmResolvedConfig;
  overlayBytes: Uint8Array;
  overlayMediaType: string;
  observationRunId: string;
}): readonly DecisionClarityCanonicalFingerprint[] {
  return buildDecisionClarityCanonicalFingerprints(args);
}

function buildPermutationFindings(
  trials: readonly DecisionClarityPermutationRecurrenceTrialReport[],
): readonly DecisionClarityPermutationRecurrencePermutationFinding[] {
  const findings: DecisionClarityPermutationRecurrencePermutationFinding[] = [];

  for (const permutation of DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE) {
    for (const contract of DECISION_CLARITY_CONTRACTS) {
      const matchingTrials = trials.filter(
        (trial) => trial.permutationId === permutation.permutationId && trial.contract === contract,
      );
      const timelyValidCount = matchingTrials.filter(
        (trial) => trial.completionState === "TIMELY_VALID_COMPLETION",
      ).length;
      const timelyInvalidCount = matchingTrials.filter(
        (trial) => trial.completionState === "TIMELY_INVALID_COMPLETION",
      ).length;
      const lateValidCount = matchingTrials.filter(
        (trial) => trial.completionState === "LATE_VALID_COMPLETION",
      ).length;
      const lateInvalidCount = matchingTrials.filter(
        (trial) => trial.completionState === "LATE_INVALID_COMPLETION",
      ).length;
      const hardNonCompletionCount = matchingTrials.filter(
        (trial) => trial.completionState === "HARD_NON_COMPLETION",
      ).length;
      const requestNotSentCount = matchingTrials.filter(
        (trial) => trial.completionState === "REQUEST_NOT_SENT",
      ).length;
      const transportFailureCount = matchingTrials.filter(
        (trial) => trial.completionState === "TRANSPORT_FAILURE",
      ).length;
      const processFailureCount = matchingTrials.filter(
        (trial) => trial.completionState === "PROCESS_FAILURE",
      ).length;
      const provenanceFailureCount = matchingTrials.filter(
        (trial) => trial.completionState === "PROVENANCE_FAILURE",
      ).length;
      const blockedCount = matchingTrials.filter((trial) => trial.status === "BLOCKED").length;
      const fingerprintMismatchCount = matchingTrials.filter(
        (trial) => !trial.requestFingerprint.allFieldsMatched,
      ).length;
      const completionLatencies = matchingTrials
        .map((trial) => trial.evidence?.completionLatencyMs ?? null)
        .filter((value): value is number => value !== null);

      findings.push({
        permutationId: permutation.permutationId,
        permutationLabel: permutation.label,
        targetPermutation: permutation.targetPermutation,
        contract,
        expectedAppearances: 6,
        executedAppearances: matchingTrials.length - blockedCount,
        timelyValidCount,
        timelyInvalidCount,
        lateValidCount,
        lateInvalidCount,
        hardNonCompletionCount,
        requestNotSentCount,
        transportFailureCount,
        processFailureCount,
        provenanceFailureCount,
        blockedCount,
        fingerprintMismatchCount,
        completeEvidence:
          matchingTrials.length === 6 &&
          blockedCount === 0 &&
          fingerprintMismatchCount === 0 &&
          provenanceFailureCount === 0 &&
          requestNotSentCount === 0 &&
          transportFailureCount === 0 &&
          processFailureCount === 0,
        latencySummary: {
          ...descriptiveStats(completionLatencies),
          serviceDeadlineMissCount: lateValidCount + lateInvalidCount + hardNonCompletionCount,
          hardNonCompletionCount,
          smallSampleDescriptive: true,
        },
      });
    }
  }

  return findings;
}

function buildPositionFindings(
  trials: readonly DecisionClarityPermutationRecurrenceTrialReport[],
): readonly DecisionClarityPermutationRecurrencePositionFinding[] {
  return DECISION_CLARITY_PERMUTATION_RECURRENCE_POSITIONS.map((position) => {
    const matchingTrials = trials.filter(
      (trial) => trial.contract === "A" && trial.positionWithinBlock === position,
    );
    return {
      position,
      appearances: matchingTrials.length,
      timelyValidCount: matchingTrials.filter((trial) => isTimelyValidState(trial.completionState))
        .length,
      attributableFailureCount: matchingTrials.filter(
        (trial) =>
          trial.requestFingerprint.allFieldsMatched &&
          isAttributableAFailureState(trial.completionState),
      ).length,
      unusableCount: matchingTrials.filter((trial) => isUnusableTrial(trial)).length,
    };
  });
}

function buildBlockRecords(
  trials: readonly DecisionClarityPermutationRecurrenceTrialReport[],
): readonly DecisionClarityPermutationRecurrenceBlockRecord[] {
  const records: DecisionClarityPermutationRecurrenceBlockRecord[] = [];

  for (
    let blockNumber = 1;
    blockNumber <= DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS;
    blockNumber += 1
  ) {
    const expectedPermutation = expectedPermutationForBlock(blockNumber);
    const cycleNumber =
      Math.floor(
        (blockNumber - 1) / DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.length,
      ) + 1;
    const blockTrials = trials.filter((trial) => trial.blockNumber === blockNumber);
    const aTrial = blockTrials.find((trial) => trial.contract === "A") ?? null;
    const aPrimeTrial = blockTrials.find((trial) => trial.contract === "A_PRIME") ?? null;
    const bTrial = blockTrials.find((trial) => trial.contract === "B") ?? null;
    const issues: string[] = [];

    if (blockTrials.length !== DECISION_CLARITY_PERMUTATION_RECURRENCE_TRIALS_PER_BLOCK) {
      issues.push(
        `expected ${DECISION_CLARITY_PERMUTATION_RECURRENCE_TRIALS_PER_BLOCK} trials, found ${blockTrials.length}`,
      );
    }
    if (aTrial === null) issues.push("missing Contract A trial");
    if (aPrimeTrial === null) issues.push("missing Contract A_PRIME trial");
    if (bTrial === null) issues.push("missing Contract B trial");
    for (const trial of [aTrial, aPrimeTrial, bTrial]) {
      if (trial !== null && !trial.requestFingerprint.allFieldsMatched) {
        issues.push(`${trial.contract} fingerprint mismatch`);
      }
      if (trial !== null && makesBlockUnusable(trial.completionState)) {
        issues.push(`${trial.contract} unusable terminal state=${trial.completionState}`);
      }
    }

    const blockUsable = [aTrial, aPrimeTrial, bTrial].every((trial) => !isUnusableTrial(trial));

    records.push({
      cycleNumber,
      blockNumber,
      permutationId:
        (blockTrials[0]?.permutationId as
          DecisionClarityPermutationRecurrencePermutationId | undefined) ??
        expectedPermutation.permutationId,
      targetPermutation: expectedPermutation.targetPermutation,
      aSequenceNumber: aTrial?.sequenceNumber ?? null,
      aPosition: aTrial?.positionWithinBlock ?? null,
      aCompletionState: aTrial?.completionState ?? null,
      aTimelyValid: isTimelyValidState(aTrial?.completionState ?? null),
      aAttributableFailure:
        blockUsable && aTrial !== null && isAttributableAFailureState(aTrial.completionState),
      aCompletionLatencyMs: aTrial?.evidence?.completionLatencyMs ?? null,
      aPrimeCompletionState: aPrimeTrial?.completionState ?? null,
      bCompletionState: bTrial?.completionState ?? null,
      blockUsable,
      issues,
    });
  }

  return records;
}

function buildControlStability(
  trials: readonly DecisionClarityPermutationRecurrenceTrialReport[],
): readonly DecisionClarityPermutationRecurrenceControlStability[] {
  return (["A_PRIME", "B"] as const).map((contract) => {
    const timelyValidCount = trials.filter(
      (trial) => trial.contract === contract && trial.completionState === "TIMELY_VALID_COMPLETION",
    ).length;
    return {
      contract,
      timelyValidCount,
      minimumRequired: DECISION_CLARITY_PERMUTATION_RECURRENCE_CONTROL_MIN_TIMELY_VALID,
      stable: timelyValidCount >= DECISION_CLARITY_PERMUTATION_RECURRENCE_CONTROL_MIN_TIMELY_VALID,
    };
  });
}

function emptyFailureCountRecord() {
  return Object.fromEntries(
    DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.map((entry) => [
      entry.permutationId,
      0,
    ]),
  ) as Record<DecisionClarityPermutationRecurrencePermutationId, number>;
}

function emptyFailureCycleRecord() {
  return Object.fromEntries(
    DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.map((entry) => [
      entry.permutationId,
      [] as number[],
    ]),
  ) as Record<DecisionClarityPermutationRecurrencePermutationId, number[]>;
}

function normalizedFailureCyclesByPermutation(
  cyclesByPermutation: Record<DecisionClarityPermutationRecurrencePermutationId, readonly number[]>,
): Record<DecisionClarityPermutationRecurrencePermutationId, readonly number[]> {
  return Object.fromEntries(
    DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.map((entry) => [
      entry.permutationId,
      [...new Set(cyclesByPermutation[entry.permutationId])].sort((left, right) => left - right),
    ]),
  ) as unknown as Record<DecisionClarityPermutationRecurrencePermutationId, readonly number[]>;
}

export function classifyDecisionClarityPermutationRecurrenceTrials(
  trials: readonly DecisionClarityPermutationRecurrenceTrialReport[],
): {
  scheduleAudit: DecisionClarityPermutationRecurrenceScheduleAudit;
  permutationFindings: readonly DecisionClarityPermutationRecurrencePermutationFinding[];
  positionFindings: readonly DecisionClarityPermutationRecurrencePositionFinding[];
  blockRecords: readonly DecisionClarityPermutationRecurrenceBlockRecord[];
  controlStability: readonly DecisionClarityPermutationRecurrenceControlStability[];
  classification: DecisionClarityPermutationRecurrenceClassification;
} {
  const scheduleAudit = auditDecisionClarityPermutationRecurrenceSchedule(trials);
  const permutationFindings = buildPermutationFindings(trials);
  const positionFindings = buildPositionFindings(trials);
  const blockRecords = buildBlockRecords(trials);
  const controlStability = buildControlStability(trials);
  const aPrimeControl = controlStability.find((finding) => finding.contract === "A_PRIME")!;
  const bControl = controlStability.find((finding) => finding.contract === "B")!;
  const failureCountsByPermutation = emptyFailureCountRecord();
  const failureCyclesByPermutation = emptyFailureCycleRecord();

  for (const blockRecord of blockRecords) {
    if (!blockRecord.aAttributableFailure) continue;
    failureCountsByPermutation[blockRecord.permutationId] += 1;
    failureCyclesByPermutation[blockRecord.permutationId].push(blockRecord.cycleNumber);
  }

  const targetFailureCount =
    failureCountsByPermutation[DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION];
  const totalAttributableAFailures = Object.values(failureCountsByPermutation).reduce(
    (sum, value) => sum + value,
    0,
  );
  const nonTargetEntries = DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.filter(
    (entry) => !entry.targetPermutation,
  ).map((entry) => ({
    permutationId: entry.permutationId,
    failureCount: failureCountsByPermutation[entry.permutationId],
    failureCycles: [...new Set(failureCyclesByPermutation[entry.permutationId])].sort(
      (left, right) => left - right,
    ),
  }));
  const highestNonTargetFailureCount = Math.max(
    0,
    ...nonTargetEntries.map((entry) => entry.failureCount),
  );
  const highestNonTargetPermutationIds =
    highestNonTargetFailureCount === 0
      ? []
      : nonTargetEntries
          .filter((entry) => entry.failureCount === highestNonTargetFailureCount)
          .map((entry) => entry.permutationId);
  const contradictingPermutationIds = nonTargetEntries
    .filter((entry) => entry.failureCount >= 3 && entry.failureCycles.length >= 3)
    .map((entry) => entry.permutationId);
  const targetFailureCycles = [
    ...new Set(
      failureCyclesByPermutation[DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION],
    ),
  ].sort((left, right) => left - right);
  const notes: string[] = [];

  const completeEvidenceGateSatisfied =
    scheduleAudit.passed &&
    trials.length === DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_TRIALS &&
    blockRecords.length === DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS &&
    trials.every((trial) => trial.status !== "BLOCKED") &&
    trials.every((trial) => trial.requestFingerprint.allFieldsMatched) &&
    trials.every((trial) => trial.completionState !== "PROVENANCE_FAILURE") &&
    trials.every((trial) => trial.completionState !== "REQUEST_NOT_SENT") &&
    trials.every((trial) => trial.completionState !== "TRANSPORT_FAILURE") &&
    trials.every((trial) => trial.completionState !== "PROCESS_FAILURE") &&
    blockRecords.every((record) => record.blockUsable) &&
    aPrimeControl.stable &&
    bControl.stable;

  if (!scheduleAudit.passed) {
    notes.push(`The trial ledger failed schedule validation: ${scheduleAudit.issues.join("; ")}`);
  }
  if (trials.length !== DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_TRIALS) {
    notes.push(
      `The trial ledger must contain all ${DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_TRIALS} scheduled trials.`,
    );
  }
  if (blockRecords.length !== DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS) {
    notes.push(
      `The block ledger must contain all ${DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS} scheduled blocks.`,
    );
  }
  if (trials.some((trial) => trial.status === "BLOCKED")) {
    notes.push("At least one scheduled trial was blocked by an earlier terminal failure.");
  }
  if (trials.some((trial) => !trial.requestFingerprint.allFieldsMatched)) {
    notes.push("At least one trial failed canonical fingerprint verification.");
  }
  if (trials.some((trial) => trial.completionState === "PROVENANCE_FAILURE")) {
    notes.push("At least one trial ended in provenance failure.");
  }
  if (trials.some((trial) => trial.completionState === "REQUEST_NOT_SENT")) {
    notes.push("At least one trial never reached transmission.");
  }
  if (trials.some((trial) => trial.completionState === "TRANSPORT_FAILURE")) {
    notes.push("At least one trial ended in transport failure.");
  }
  if (trials.some((trial) => trial.completionState === "PROCESS_FAILURE")) {
    notes.push("At least one trial ended in process failure.");
  }
  const unusableBlocks = blockRecords.filter((record) => !record.blockUsable).length;
  if (unusableBlocks > 0) {
    notes.push(`${unusableBlocks} block record(s) were unusable for attribution.`);
  }
  if (!aPrimeControl.stable) {
    notes.push(
      `Contract A_PRIME timely-valid count was ${aPrimeControl.timelyValidCount}, below the required ${aPrimeControl.minimumRequired}.`,
    );
  }
  if (!bControl.stable) {
    notes.push(
      `Contract B timely-valid count was ${bControl.timelyValidCount}, below the required ${bControl.minimumRequired}.`,
    );
  }

  if (!completeEvidenceGateSatisfied) {
    return {
      scheduleAudit,
      permutationFindings,
      positionFindings,
      blockRecords,
      controlStability,
      classification: {
        recurrenceStatus: "INSUFFICIENT_EVIDENCE",
        completeEvidenceGateSatisfied: false,
        targetPermutationId: DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION,
        targetFailureCount,
        totalAttributableAFailures,
        highestNonTargetFailureCount,
        highestNonTargetPermutationIds,
        contradictingPermutationIds,
        attributableAFailureCountsByPermutation: failureCountsByPermutation,
        failureCyclesByPermutation: normalizedFailureCyclesByPermutation(
          failureCyclesByPermutation,
        ),
        aPrimeTimelyValidCount: aPrimeControl.timelyValidCount,
        bTimelyValidCount: bControl.timelyValidCount,
        notes,
      },
    };
  }

  const targetLead = targetFailureCount - highestNonTargetFailureCount;
  const supported =
    targetFailureCount >= 3 &&
    nonTargetEntries.every((entry) => entry.failureCount <= 1) &&
    targetLead >= 2 &&
    targetFailureCycles.length >= 3 &&
    aPrimeControl.stable &&
    bControl.stable;
  const noTargetRecurrenceObserved =
    targetFailureCount <= 1 &&
    totalAttributableAFailures <= 2 &&
    aPrimeControl.stable &&
    bControl.stable;
  const contradicted =
    targetFailureCount <= 1 &&
    contradictingPermutationIds.length > 0 &&
    aPrimeControl.stable &&
    bControl.stable;

  let recurrenceStatus: DecisionClarityPermutationRecurrenceClassificationName =
    "INSUFFICIENT_EVIDENCE";

  if (supported) {
    recurrenceStatus = "TARGET_PERMUTATION_RECURRENCE_SUPPORTED";
    notes.push(
      `Target permutation ${DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION} met the preregistered recurrence thresholds.`,
    );
  } else if (contradicted) {
    recurrenceStatus = "TARGET_PERMUTATION_RECURRENCE_CONTRADICTED";
    notes.push(
      `Non-target permutation(s) ${contradictingPermutationIds.join(", ")} met the preregistered contradiction thresholds while ${DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION} did not.`,
    );
  } else if (noTargetRecurrenceObserved) {
    recurrenceStatus = "NO_TARGET_PERMUTATION_RECURRENCE_OBSERVED";
    notes.push(
      "No target-permutation recurrence was observed under the preregistered bounded criteria.",
    );
  } else {
    if (targetFailureCount === 2) {
      notes.push(
        "The target permutation produced 2 attributable failures, below the threshold of 3.",
      );
    }
    if (targetFailureCount >= 3 && targetFailureCycles.length < 3) {
      notes.push("Target-permutation failures did not occur across at least 3 distinct cycles.");
    }
    if (targetLead === 1) {
      notes.push(
        "The target permutation led the nearest non-target permutation by only 1 failure.",
      );
    }
    const failingPermutations = Object.entries(failureCountsByPermutation)
      .filter(([, count]) => count > 0)
      .map(([permutationId]) => permutationId);
    if (failingPermutations.length > 1) {
      notes.push("Attributable Contract A failures were distributed across multiple permutations.");
    }
    if (notes.length === 0) {
      notes.push(
        "The complete target-permutation schedule produced a pattern that did not satisfy a preregistered terminal classification.",
      );
    }
  }

  return {
    scheduleAudit,
    permutationFindings,
    positionFindings,
    blockRecords,
    controlStability,
    classification: {
      recurrenceStatus,
      completeEvidenceGateSatisfied: true,
      targetPermutationId: DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION,
      targetFailureCount,
      totalAttributableAFailures,
      highestNonTargetFailureCount,
      highestNonTargetPermutationIds,
      contradictingPermutationIds,
      attributableAFailureCountsByPermutation: failureCountsByPermutation,
      failureCyclesByPermutation: normalizedFailureCyclesByPermutation(failureCyclesByPermutation),
      aPrimeTimelyValidCount: aPrimeControl.timelyValidCount,
      bTimelyValidCount: bControl.timelyValidCount,
      notes,
    },
  };
}

export async function runLocalVlmDecisionClarityPermutationRecurrenceDiagnostic(args: {
  config: LocalVlmResolvedConfig;
  scenarioId: string;
  sourceArtifactRef: string;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  serviceDeadlineMs?: number;
  hardCeilingMs?: number;
  mutatePreparedTrialRequest?: (
    trial: DecisionClarityPermutationRecurrenceScheduledTrial,
    prepared: DecisionClarityPreparedTrialRequest,
  ) => DecisionClarityPreparedTrialRequest;
  mutateLaunchSpec?: (
    trial: DecisionClarityPermutationRecurrenceScheduledTrial,
    launchSpec: LlamaServerLaunchSpec,
  ) => LlamaServerLaunchSpec;
  inspectPreparedTrialRequest?: (
    trial: DecisionClarityPermutationRecurrenceScheduledTrial,
    prepared: DecisionClarityPreparedTrialRequest,
  ) => void;
  inspectTransmittedRequestBody?: (
    trial: DecisionClarityPermutationRecurrenceScheduledTrial,
    requestBody: ReturnType<typeof buildVisionChatRequestBody>,
  ) => void;
}): Promise<DecisionClarityPermutationRecurrenceDiagnosticReport> {
  const serviceDeadlineMs = args.serviceDeadlineMs ?? DECISION_CLARITY_SERVICE_DEADLINE_MS;
  const hardCeilingMs = args.hardCeilingMs ?? DECISION_CLARITY_HARD_CEILING_MS;
  if (hardCeilingMs <= serviceDeadlineMs) {
    throw new Error("hardCeilingMs must be greater than serviceDeadlineMs");
  }

  const runtimeVersion = await readLlamaVersionOutput(args.config);
  const fingerprintOverlay = await buildDecisionClarityFingerprintOverlay({
    sourceBytes: args.sourceBytes,
    sourceMediaType: args.sourceMediaType,
    sourceWidth: args.sourceWidth,
    sourceHeight: args.sourceHeight,
  });
  const requestFingerprints = buildDecisionClarityPermutationRecurrenceCanonicalFingerprints({
    config: args.config,
    overlayBytes: fingerprintOverlay.overlayBytes,
    overlayMediaType: fingerprintOverlay.overlayMediaType,
    observationRunId: randomUUID(),
  });
  const schedule = buildDecisionClarityPermutationRecurrenceSchedule();
  validateDecisionClarityPermutationRecurrenceSchedule(schedule);
  const trials: DecisionClarityPermutationRecurrenceTrialReport[] = [];
  let fatalStopReason: string | null = null;
  let blockedBySequenceNumber: number | null = null;

  for (const trial of schedule) {
    if (fatalStopReason !== null && blockedBySequenceNumber !== null) {
      trials.push(
        buildBlockedPermutationRecurrenceTrialReport({
          trial,
          fingerprints: requestFingerprints,
          blockedBySequenceNumber,
          reason: fatalStopReason,
        }),
      );
      continue;
    }

    const result = await runOneDecisionClarityTrial({
      config: args.config,
      trial: phase10CompatibleTrial(trial),
      sourceBytes: args.sourceBytes,
      sourceMediaType: args.sourceMediaType,
      sourceWidth: args.sourceWidth,
      sourceHeight: args.sourceHeight,
      fingerprints: requestFingerprints,
      serviceDeadlineMs,
      hardCeilingMs,
      mutatePreparedTrialRequest: args.mutatePreparedTrialRequest
        ? (_trial, prepared) => args.mutatePreparedTrialRequest!(trial, prepared)
        : undefined,
      mutateLaunchSpec: args.mutateLaunchSpec
        ? (_trial, launchSpec) => args.mutateLaunchSpec!(trial, launchSpec)
        : undefined,
      inspectPreparedTrialRequest: args.inspectPreparedTrialRequest
        ? (_trial, prepared) => args.inspectPreparedTrialRequest!(trial, prepared)
        : undefined,
      inspectTransmittedRequestBody: args.inspectTransmittedRequestBody
        ? (_trial, requestBody) => args.inspectTransmittedRequestBody!(trial, requestBody)
        : undefined,
    });

    trials.push(
      toPermutationRecurrenceTrialReport({
        trial,
        report: result.report,
      }),
    );

    if (result.fatalStopReason !== null) {
      fatalStopReason = result.fatalStopReason;
      blockedBySequenceNumber = trial.sequenceNumber;
    }
  }

  const classified = classifyDecisionClarityPermutationRecurrenceTrials(trials);

  return {
    schemaVersion: DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    gitCommit: currentGitCommit(),
    runtime: {
      runtimeKind: args.config.runtimeKind,
      executableDigest: args.config.llamaExecutableSha256,
      runtimeVersion,
      modelDigest: args.config.modelSha256,
      projectorDigest: args.config.mmprojSha256,
      modelDisplayId: args.config.modelDisplayId,
      host: args.config.host,
      contextSize: args.config.contextSize,
      maxOutputTokens: args.config.maxOutputTokens,
      temperature: args.config.temperature,
      seed: args.config.seed,
      configuredRequestTimeoutMs: args.config.requestTimeoutMs,
    },
    deadlines: {
      serviceDeadlineMs,
      hardCeilingMs,
    },
    source: {
      scenarioId: args.scenarioId,
      sourceArtifactRef: args.sourceArtifactRef,
      sourceMediaType: args.sourceMediaType,
      sourceWidth: args.sourceWidth,
      sourceHeight: args.sourceHeight,
    },
    schedule: {
      cycles: DECISION_CLARITY_PERMUTATION_RECURRENCE_CYCLES,
      blocksPerCycle: DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.length,
      trialsPerBlock: DECISION_CLARITY_PERMUTATION_RECURRENCE_TRIALS_PER_BLOCK,
      totalBlocks: DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_BLOCKS,
      totalTrials: DECISION_CLARITY_PERMUTATION_RECURRENCE_TOTAL_TRIALS,
      targetPermutationId: DECISION_CLARITY_PERMUTATION_RECURRENCE_TARGET_PERMUTATION,
      permutations: DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.map((entry) => ({
        permutationId: entry.permutationId,
        contracts: [...entry.contracts],
        label: entry.label,
        targetPermutation: entry.targetPermutation,
      })),
    },
    scheduleAudit: classified.scheduleAudit,
    requestFingerprints,
    trials,
    permutationFindings: classified.permutationFindings,
    positionFindings: classified.positionFindings,
    blockRecords: classified.blockRecords,
    controlStability: classified.controlStability,
    classification: classified.classification,
    fatalStopReason,
  };
}

function cleanupSummary(report: DecisionClarityPermutationRecurrenceDiagnosticReport) {
  const executedTrials = report.trials.filter((trial) => trial.evidence !== null);
  return {
    executedTrials: executedTrials.length,
    cleanupCompletedCount: executedTrials.filter((trial) => trial.evidence?.cleanupCompleted)
      .length,
    forcedTerminationCount: executedTrials.filter((trial) => trial.evidence?.forcedTermination)
      .length,
    workspaceResidueCount: executedTrials.filter(
      (trial) => (trial.evidence?.workspaceBytesAfterCleanup ?? 0) > 0,
    ).length,
  };
}

function reconciliationSummary(report: DecisionClarityPermutationRecurrenceDiagnosticReport) {
  return {
    contractAppearances: report.trials.length,
    positionAppearances: report.trials.length,
    blockRecords: report.blockRecords.length,
    permutationAppearances: report.trials.length,
    aTrialsCountedOnce: report.blockRecords.filter((record) => record.aSequenceNumber !== null)
      .length,
  };
}

export async function writeDecisionClarityPermutationRecurrenceDiagnosticFiles(args: {
  report: DecisionClarityPermutationRecurrenceDiagnosticReport;
  outputDir: string;
  stem: string;
}): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(args.outputDir, { recursive: true });
  const jsonPath = join(args.outputDir, `${args.stem}.json`);
  const markdownPath = join(args.outputDir, `${args.stem}.md`);
  const cleanup = cleanupSummary(args.report);
  const reconciliation = reconciliationSummary(args.report);
  const aFindings = args.report.permutationFindings.filter((finding) => finding.contract === "A");
  const controlFindings = args.report.permutationFindings.filter(
    (finding) => finding.contract === "A_PRIME" || finding.contract === "B",
  );
  const markdown = [
    `# ${args.stem}`,
    "",
    "## Provenance",
    "",
    `- Schema version: \`${args.report.schemaVersion}\``,
    `- Git commit: \`${args.report.gitCommit}\``,
    `- Runtime kind: \`${args.report.runtime.runtimeKind}\``,
    `- Runtime version: ${args.report.runtime.runtimeVersion ?? "null"}`,
    `- Model digest: \`${args.report.runtime.modelDigest}\``,
    `- Projector digest: ${args.report.runtime.projectorDigest ?? "null"}`,
    `- Source: \`${args.report.source.sourceArtifactRef}\``,
    `- Service deadline: ${args.report.deadlines.serviceDeadlineMs} ms`,
    `- Hard ceiling: ${args.report.deadlines.hardCeilingMs} ms`,
    "",
    "## Schedule Audit",
    "",
    `- Passed: ${String(args.report.scheduleAudit.passed)}`,
    `- Total trials: ${args.report.scheduleAudit.totalTrials}`,
    `- Total blocks: ${args.report.scheduleAudit.totalBlocks}`,
    `- Total cycles: ${args.report.scheduleAudit.totalCycles}`,
    `- Total permutations: ${args.report.scheduleAudit.totalPermutations}`,
    `- Target permutation: ${args.report.scheduleAudit.targetPermutationId ?? "null"}`,
    ...DECISION_CLARITY_CONTRACTS.map(
      (contract) =>
        `- ${contract} appearances: total=${args.report.scheduleAudit.appearancesByContract[contract]}; pos1=${args.report.scheduleAudit.appearancesByPosition[contract][1]}; pos2=${args.report.scheduleAudit.appearancesByPosition[contract][2]}; pos3=${args.report.scheduleAudit.appearancesByPosition[contract][3]}`,
    ),
    ...DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.map(
      (entry) =>
        `- ${entry.permutationId} (${entry.label}): ${args.report.scheduleAudit.appearancesByPermutation[entry.permutationId]} block(s); target=${String(entry.targetPermutation)}`,
    ),
    `- Issues: ${args.report.scheduleAudit.issues.length === 0 ? "none" : args.report.scheduleAudit.issues.join("; ")}`,
    "",
    "## Complete 108-Trial Ledger",
    "",
    ...args.report.trials.map((trial) => {
      const preview = trial.evidence?.boundedOutputPreview ?? "null";
      return `- #${trial.sequenceNumber} cycle${trial.cycleNumber} block${trial.blockNumber} ${trial.permutationId} pos${trial.positionWithinBlock} ${trial.contract}: ${trial.status}; completionState=${trial.completionState}; fingerprintVerified=${String(trial.requestFingerprint.allFieldsMatched)}; blockedBy=${trial.blockedBySequenceNumber ?? "null"}; completionLatencyMs=${trial.evidence?.completionLatencyMs ?? "null"}; timeoutStage=${trial.evidence?.timeoutStage ?? "null"}; preview=${preview}`;
    }),
    "",
    "## A Findings By Permutation",
    "",
    ...aFindings.map(
      (finding) =>
        `- ${finding.permutationId} (${finding.permutationLabel}): expected=${finding.expectedAppearances}; executed=${finding.executedAppearances}; timelyValid=${finding.timelyValidCount}; timelyInvalid=${finding.timelyInvalidCount}; lateValid=${finding.lateValidCount}; lateInvalid=${finding.lateInvalidCount}; hardNonCompletion=${finding.hardNonCompletionCount}; requestNotSent=${finding.requestNotSentCount}; transportFailure=${finding.transportFailureCount}; processFailure=${finding.processFailureCount}; provenanceFailure=${finding.provenanceFailureCount}; blocked=${finding.blockedCount}; fingerprintMismatch=${finding.fingerprintMismatchCount}; completeEvidence=${String(finding.completeEvidence)}`,
    ),
    "",
    "## A Findings By Position",
    "",
    ...args.report.positionFindings.map(
      (finding) =>
        `- Position ${finding.position}: appearances=${finding.appearances}; timelyValid=${finding.timelyValidCount}; attributableFailure=${finding.attributableFailureCount}; unusable=${finding.unusableCount}`,
    ),
    "",
    "## A_PRIME And B Stability Findings",
    "",
    ...args.report.controlStability.map(
      (finding) =>
        `- ${finding.contract}: timelyValid=${finding.timelyValidCount}; minimumRequired=${finding.minimumRequired}; stable=${String(finding.stable)}`,
    ),
    ...controlFindings.map(
      (finding) =>
        `- ${finding.contract} in ${finding.permutationId} (${finding.permutationLabel}): expected=${finding.expectedAppearances}; executed=${finding.executedAppearances}; timelyValid=${finding.timelyValidCount}; timelyInvalid=${finding.timelyInvalidCount}; lateValid=${finding.lateValidCount}; lateInvalid=${finding.lateInvalidCount}; hardNonCompletion=${finding.hardNonCompletionCount}; requestNotSent=${finding.requestNotSentCount}; transportFailure=${finding.transportFailureCount}; processFailure=${finding.processFailureCount}; provenanceFailure=${finding.provenanceFailureCount}; blocked=${finding.blockedCount}; fingerprintMismatch=${finding.fingerprintMismatchCount}; completeEvidence=${String(finding.completeEvidence)}`,
    ),
    "",
    "## 36 Block Records",
    "",
    ...args.report.blockRecords.map(
      (record) =>
        `- Block ${record.blockNumber} cycle ${record.cycleNumber} ${record.permutationId}: target=${String(record.targetPermutation)}; A=#${record.aSequenceNumber ?? "null"} pos=${record.aPosition ?? "null"} state=${record.aCompletionState ?? "null"} timelyValid=${String(record.aTimelyValid)} attributableFailure=${String(record.aAttributableFailure)} latency=${record.aCompletionLatencyMs ?? "null"}; A_PRIME=${record.aPrimeCompletionState ?? "null"}; B=${record.bCompletionState ?? "null"}; usable=${String(record.blockUsable)}; issues=${record.issues.length === 0 ? "none" : record.issues.join("; ")}`,
    ),
    "",
    "## Latency Summaries",
    "",
    ...aFindings.map(
      (finding) =>
        `- ${finding.permutationId} (${finding.permutationLabel}) A latency: min=${formatNumber(finding.latencySummary.minimum)}; median=${formatNumber(finding.latencySummary.median)}; max=${formatNumber(finding.latencySummary.maximum)}; mean=${formatNumber(finding.latencySummary.mean)}; sd=${formatNumber(finding.latencySummary.standardDeviation)}; p95=${formatNumber(finding.latencySummary.p95)}; serviceDeadlineMisses=${finding.latencySummary.serviceDeadlineMissCount}; hardNonCompletion=${finding.latencySummary.hardNonCompletionCount}; descriptiveOnly=${String(finding.latencySummary.smallSampleDescriptive)}`,
    ),
    "",
    "## Final Classification",
    "",
    `- Classification: ${args.report.classification.recurrenceStatus}`,
    `- Complete evidence gate satisfied: ${String(args.report.classification.completeEvidenceGateSatisfied)}`,
    `- Target permutation: ${args.report.classification.targetPermutationId}`,
    `- Target attributable A failure count: ${args.report.classification.targetFailureCount}`,
    `- Total attributable A failures: ${args.report.classification.totalAttributableAFailures}`,
    `- Highest non-target failure count: ${args.report.classification.highestNonTargetFailureCount}`,
    `- Highest non-target permutation(s): ${args.report.classification.highestNonTargetPermutationIds.join(", ") || "none"}`,
    `- Contradicting permutation(s): ${args.report.classification.contradictingPermutationIds.join(", ") || "none"}`,
    `- A_PRIME timely-valid count: ${args.report.classification.aPrimeTimelyValidCount}`,
    `- B timely-valid count: ${args.report.classification.bTimelyValidCount}`,
    ...DECISION_CLARITY_PERMUTATION_RECURRENCE_SCHEDULE_TEMPLATE.map(
      (entry) =>
        `- ${entry.permutationId} attributable A failures: ${args.report.classification.attributableAFailureCountsByPermutation[entry.permutationId]}; cycles=${args.report.classification.failureCyclesByPermutation[entry.permutationId].join(", ") || "none"}`,
    ),
    `- Notes: ${args.report.classification.notes.length === 0 ? "none" : args.report.classification.notes.join(" ")}`,
    "",
    "## RDR Evidence Boundary",
    "",
    `- Complete evidence gate: ${args.report.classification.completeEvidenceGateSatisfied ? "satisfied" : "failed"}`,
    `- Fatal stop reason: ${args.report.fatalStopReason ?? "none"}`,
    `- Infrastructure outcomes attributable: no`,
    `- Fingerprint mismatches allowed: no`,
    `- Provenance failures allowed: no`,
    `- Blocked trials allowed: no`,
    `- Unusable blocks allowed: no`,
    "",
    "## Prohibited Interpretations",
    "",
    "- Do not interpret infrastructure failure as hard non-completion.",
    "- Do not attribute recurrence when fingerprints differ.",
    "- Do not treat A_PRIME or B outcomes as Contract A recurrence events.",
    "- Do not classify from position totals alone.",
    "- Do not use latency to override terminal-state classification.",
    "- Diagnostic success does not authorize production prompt replacement.",
    "",
    "## Cleanup And Reconciliation Summary",
    "",
    `- Executed trials with evidence: ${cleanup.executedTrials}`,
    `- Cleanup completed count: ${cleanup.cleanupCompletedCount}`,
    `- Forced termination count: ${cleanup.forcedTerminationCount}`,
    `- Workspace residue count: ${cleanup.workspaceResidueCount}`,
    `- Trial appearances reconciled: ${reconciliation.contractAppearances}`,
    `- Position appearances reconciled: ${reconciliation.positionAppearances}`,
    `- Block records reconciled: ${reconciliation.blockRecords}`,
    `- Permutation appearances reconciled: ${reconciliation.permutationAppearances}`,
    `- A trials counted once in block records: ${reconciliation.aTrialsCountedOnce}`,
    "",
  ].join("\n");

  await writeFile(jsonPath, `${JSON.stringify(args.report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  return { jsonPath, markdownPath };
}
