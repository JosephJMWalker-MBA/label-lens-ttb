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

export const DECISION_CLARITY_REPLICATION_SCHEMA_VERSION =
  "local-vlm-decision-clarity-replication.v1" as const;
export const DECISION_CLARITY_REPLICATION_CLASSIFICATIONS = [
  "REPLICATION_SUPPORTED",
  "NO_REPLICATION_EFFECT_OBSERVED",
  "REPLICATION_CONTRADICTED",
  "INSUFFICIENT_EVIDENCE",
] as const;
export const DECISION_CLARITY_REPLICATION_BLOCK_OUTCOMES = [
  "A_PRIME_FAVORED",
  "A_FAVORED",
  "TIED_TIMELY_VALID",
  "TIED_NON_TIMELY_VALID",
  "UNUSABLE",
] as const;
export const DECISION_CLARITY_REPLICATION_CYCLES = 2 as const;
export const DECISION_CLARITY_REPLICATION_TRIALS_PER_BLOCK = 3 as const;
export const DECISION_CLARITY_REPLICATION_TOTAL_BLOCKS = 12 as const;
export const DECISION_CLARITY_REPLICATION_TOTAL_TRIALS = 36 as const;
export const DECISION_CLARITY_REPLICATION_CONTROL_MIN_TIMELY_VALID = 11 as const;

const DECISION_CLARITY_REPLICATION_POSITIONS = [1, 2, 3] as const;
const DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE = [
  { permutationId: "A_A_PRIME_B", contracts: ["A", "A_PRIME", "B"] as const },
  { permutationId: "A_B_A_PRIME", contracts: ["A", "B", "A_PRIME"] as const },
  { permutationId: "A_PRIME_A_B", contracts: ["A_PRIME", "A", "B"] as const },
  { permutationId: "A_PRIME_B_A", contracts: ["A_PRIME", "B", "A"] as const },
  { permutationId: "B_A_A_PRIME", contracts: ["B", "A", "A_PRIME"] as const },
  { permutationId: "B_A_PRIME_A", contracts: ["B", "A_PRIME", "A"] as const },
] as const;

type DecisionClarityReplicationClassificationName =
  (typeof DECISION_CLARITY_REPLICATION_CLASSIFICATIONS)[number];
type DecisionClarityReplicationBlockOutcome =
  (typeof DECISION_CLARITY_REPLICATION_BLOCK_OUTCOMES)[number];
type DecisionClarityReplicationPermutationId =
  (typeof DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE)[number]["permutationId"];
type DecisionClarityReplicationPosition = (typeof DECISION_CLARITY_REPLICATION_POSITIONS)[number];

type DecisionClarityReplicationLedgerEntryLike = {
  sequenceNumber: number;
  cycleNumber: number;
  blockNumber: number;
  permutationId: string;
  positionWithinBlock: number;
  contract: string;
};

export interface DecisionClarityReplicationScheduledTrial extends DecisionClarityScheduledTrial {
  cycleNumber: number;
  blockNumber: number;
  permutationId: DecisionClarityReplicationPermutationId;
  positionWithinBlock: DecisionClarityReplicationPosition;
}

export interface DecisionClarityReplicationLatencySummary {
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

export interface DecisionClarityReplicationTrialReport {
  sequenceNumber: number;
  cycleNumber: number;
  blockNumber: number;
  permutationId: DecisionClarityReplicationPermutationId;
  positionWithinBlock: DecisionClarityReplicationPosition;
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

export interface DecisionClarityReplicationContractFinding {
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
  latencySummary: DecisionClarityReplicationLatencySummary;
}

export interface DecisionClarityReplicationPositionFinding {
  contract: DecisionClarityContract;
  position: DecisionClarityReplicationPosition;
  appearances: number;
  timelyValidCount: number;
  allOtherTerminalCount: number;
}

export interface DecisionClarityReplicationBlockComparison {
  cycleNumber: number;
  blockNumber: number;
  permutationId: DecisionClarityReplicationPermutationId;
  aSequenceNumber: number | null;
  aPrimeSequenceNumber: number | null;
  aPosition: DecisionClarityReplicationPosition | null;
  aPrimePosition: DecisionClarityReplicationPosition | null;
  aCompletionState: DecisionClarityCompletionState | null;
  aPrimeCompletionState: DecisionClarityCompletionState | null;
  aTimelyValid: boolean;
  aPrimeTimelyValid: boolean;
  blockOutcome: DecisionClarityReplicationBlockOutcome;
  aCompletionLatencyMs: number | null;
  aPrimeCompletionLatencyMs: number | null;
  rawLatencyDifferenceMs: number | null;
  percentageDifference: number | null;
}

export interface DecisionClarityReplicationControlStability {
  contract: "B";
  timelyValidCount: number;
  minimumRequired: number;
  stable: boolean;
}

export interface DecisionClarityReplicationScheduleAudit {
  passed: boolean;
  totalTrials: number;
  totalBlocks: number;
  appearancesByContract: Record<DecisionClarityContract, number>;
  appearancesByPermutation: Record<DecisionClarityReplicationPermutationId, number>;
  appearancesByPosition: Record<
    DecisionClarityContract,
    Record<DecisionClarityReplicationPosition, number>
  >;
  blockCountsByCycle: Record<number, number>;
  issues: readonly string[];
}

export interface DecisionClarityReplicationClassification {
  replicationEffect: DecisionClarityReplicationClassificationName;
  completeEvidenceGateSatisfied: boolean;
  aTimelyValidCount: number;
  aPrimeTimelyValidCount: number;
  bTimelyValidCount: number;
  aPrimeFavoredBlocks: number;
  aFavoredBlocks: number;
  tiedTimelyValidBlocks: number;
  tiedNonTimelyValidBlocks: number;
  unusableBlocks: number;
  distinctAPrimeFavoredPermutations: number;
  distinctAFavoredPermutations: number;
  notes: readonly string[];
}

export interface DecisionClarityReplicationDiagnosticReport {
  schemaVersion: typeof DECISION_CLARITY_REPLICATION_SCHEMA_VERSION;
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
    permutations: readonly {
      permutationId: DecisionClarityReplicationPermutationId;
      contracts: readonly DecisionClarityContract[];
    }[];
  };
  scheduleAudit: DecisionClarityReplicationScheduleAudit;
  requestFingerprints: readonly DecisionClarityCanonicalFingerprint[];
  trials: readonly DecisionClarityReplicationTrialReport[];
  contractFindings: readonly DecisionClarityReplicationContractFinding[];
  positionFindings: readonly DecisionClarityReplicationPositionFinding[];
  blockComparisons: readonly DecisionClarityReplicationBlockComparison[];
  controlStability: DecisionClarityReplicationControlStability;
  classification: DecisionClarityReplicationClassification;
  fatalStopReason: string | null;
}

function currentGitCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function phase10CompatibleTrial(
  trial: DecisionClarityReplicationScheduledTrial,
): DecisionClarityScheduledTrial {
  return {
    sequenceNumber: trial.sequenceNumber,
    repetitionNumber: trial.repetitionNumber,
    sequencePosition: trial.sequencePosition,
    contract: trial.contract,
  };
}

function toReplicationTrialReport(args: {
  trial: DecisionClarityReplicationScheduledTrial;
  report: DecisionClarityTrialReport;
}): DecisionClarityReplicationTrialReport {
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

function buildBlockedReplicationTrialReport(args: {
  trial: DecisionClarityReplicationScheduledTrial;
  fingerprints: readonly DecisionClarityCanonicalFingerprint[];
  blockedBySequenceNumber: number;
  reason: string;
}): DecisionClarityReplicationTrialReport {
  return toReplicationTrialReport({
    trial: args.trial,
    report: buildBlockedDecisionClarityTrialReport({
      trial: phase10CompatibleTrial(args.trial),
      spec: buildDecisionClaritySpec(args.trial.contract, "<replication-blocked-trial>"),
      fingerprints: args.fingerprints,
      blockedBySequenceNumber: args.blockedBySequenceNumber,
      reason: args.reason,
    }),
  });
}

function emptyPositionCounts() {
  return Object.fromEntries(
    DECISION_CLARITY_REPLICATION_POSITIONS.map((position) => [position, 0]),
  ) as Record<DecisionClarityReplicationPosition, number>;
}

function descriptiveStats(
  values: readonly number[],
): Omit<
  DecisionClarityReplicationLatencySummary,
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

function isInfrastructureFailureState(state: DecisionClarityCompletionState): boolean {
  return (
    state === "REQUEST_NOT_SENT" || state === "TRANSPORT_FAILURE" || state === "PROCESS_FAILURE"
  );
}

function isNonAttributableTrial(trial: DecisionClarityReplicationTrialReport | null): boolean {
  return (
    trial === null ||
    !trial.requestFingerprint.allFieldsMatched ||
    trial.completionState === "BLOCKED" ||
    trial.completionState === "PROVENANCE_FAILURE" ||
    isInfrastructureFailureState(trial.completionState)
  );
}

function formatNumber(value: number | null): string {
  return value === null ? "null" : Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function percentageDifference(left: number | null, right: number | null): number | null {
  if (left === null || right === null || left === 0) return null;
  return ((right - left) / left) * 100;
}

function expectedPermutationForBlock(
  blockNumber: number,
): (typeof DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE)[number] {
  const index = (blockNumber - 1) % DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE.length;
  return DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE[index]!;
}

function auditDecisionClarityReplicationSchedule(
  schedule: readonly DecisionClarityReplicationLedgerEntryLike[],
): DecisionClarityReplicationScheduleAudit {
  const appearancesByContract = Object.fromEntries(
    DECISION_CLARITY_CONTRACTS.map((contract) => [contract, 0]),
  ) as Record<DecisionClarityContract, number>;
  const appearancesByPermutation = Object.fromEntries(
    DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE.map((entry) => [entry.permutationId, 0]),
  ) as Record<DecisionClarityReplicationPermutationId, number>;
  const appearancesByPosition = Object.fromEntries(
    DECISION_CLARITY_CONTRACTS.map((contract) => [contract, emptyPositionCounts()]),
  ) as Record<DecisionClarityContract, Record<DecisionClarityReplicationPosition, number>>;
  const blockCountsByCycle: Record<number, number> = {};
  const issues: string[] = [];

  if (schedule.length !== DECISION_CLARITY_REPLICATION_TOTAL_TRIALS) {
    issues.push(
      `expected exactly ${DECISION_CLARITY_REPLICATION_TOTAL_TRIALS} trials, found ${schedule.length}`,
    );
  }

  const blockMap = new Map<number, DecisionClarityReplicationLedgerEntryLike[]>();
  const seenSequenceNumbers = new Set<number>();
  const seenBlocks = new Set<number>();

  for (const trial of schedule) {
    blockMap.set(trial.blockNumber, [...(blockMap.get(trial.blockNumber) ?? []), trial]);
    seenBlocks.add(trial.blockNumber);
    seenSequenceNumbers.add(trial.sequenceNumber);

    if (DECISION_CLARITY_CONTRACTS.includes(trial.contract as DecisionClarityContract)) {
      const contract = trial.contract as DecisionClarityContract;
      appearancesByContract[contract] += 1;
      if (
        DECISION_CLARITY_REPLICATION_POSITIONS.includes(
          trial.positionWithinBlock as DecisionClarityReplicationPosition,
        )
      ) {
        const position = trial.positionWithinBlock as DecisionClarityReplicationPosition;
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
      !DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE.some(
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
  if (seenBlocks.size !== DECISION_CLARITY_REPLICATION_TOTAL_BLOCKS) {
    issues.push(
      `expected exactly ${DECISION_CLARITY_REPLICATION_TOTAL_BLOCKS} blocks, found ${seenBlocks.size}`,
    );
  }

  const sortedSequenceNumbers = [...seenSequenceNumbers].sort((left, right) => left - right);
  for (let index = 0; index < sortedSequenceNumbers.length; index += 1) {
    const expected = index + 1;
    if (sortedSequenceNumbers[index] !== expected) {
      issues.push("sequence numbers must be contiguous from 1 through 36");
      break;
    }
  }

  const sortedBlockNumbers = [...seenBlocks].sort((left, right) => left - right);
  for (let index = 0; index < sortedBlockNumbers.length; index += 1) {
    const expected = index + 1;
    if (sortedBlockNumbers[index] !== expected) {
      issues.push("block numbers must be contiguous from 1 through 12");
      break;
    }
  }

  for (const contract of DECISION_CLARITY_CONTRACTS) {
    if (appearancesByContract[contract] !== 12) {
      issues.push(
        `contract ${contract} must appear exactly 12 times, found ${appearancesByContract[contract]}`,
      );
    }
    for (const position of DECISION_CLARITY_REPLICATION_POSITIONS) {
      if (appearancesByPosition[contract][position] !== 4) {
        issues.push(
          `contract ${contract} must appear exactly 4 times in position ${position}, found ${appearancesByPosition[contract][position]}`,
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
      DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE.some(
        (entry) => entry.permutationId === permutationId,
      )
    ) {
      appearancesByPermutation[permutationId as DecisionClarityReplicationPermutationId] += 1;
    }
  }

  for (const entry of DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE) {
    if (appearancesByPermutation[entry.permutationId] !== 2) {
      issues.push(
        `permutation ${entry.permutationId} must appear exactly twice, found ${appearancesByPermutation[entry.permutationId]}`,
      );
    }
  }

  for (let cycleNumber = 1; cycleNumber <= DECISION_CLARITY_REPLICATION_CYCLES; cycleNumber += 1) {
    if (blockCountsByCycle[cycleNumber] !== 6) {
      issues.push(
        `cycle ${cycleNumber} must contain exactly 6 blocks, found ${blockCountsByCycle[cycleNumber] ?? 0}`,
      );
    }
  }

  for (
    let blockNumber = 1;
    blockNumber <= DECISION_CLARITY_REPLICATION_TOTAL_BLOCKS;
    blockNumber += 1
  ) {
    const blockTrials = blockMap.get(blockNumber) ?? [];
    if (blockTrials.length !== DECISION_CLARITY_REPLICATION_TRIALS_PER_BLOCK) {
      issues.push(
        `block ${blockNumber} must contain exactly 3 trials, found ${blockTrials.length}`,
      );
      continue;
    }

    const expectedPermutation = expectedPermutationForBlock(blockNumber);
    const expectedCycleNumber =
      Math.floor((blockNumber - 1) / DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE.length) + 1;
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
  }

  return {
    passed: issues.length === 0,
    totalTrials: schedule.length,
    totalBlocks: blockMap.size,
    appearancesByContract,
    appearancesByPermutation,
    appearancesByPosition,
    blockCountsByCycle,
    issues,
  };
}

export function validateDecisionClarityReplicationSchedule(
  schedule: readonly DecisionClarityReplicationLedgerEntryLike[],
): DecisionClarityReplicationScheduleAudit {
  const audit = auditDecisionClarityReplicationSchedule(schedule);
  if (!audit.passed) {
    throw new Error(`invalid decision-clarity replication schedule: ${audit.issues.join("; ")}`);
  }
  return audit;
}

export function buildDecisionClarityReplicationSchedule(): readonly DecisionClarityReplicationScheduledTrial[] {
  const trials: DecisionClarityReplicationScheduledTrial[] = [];
  let sequenceNumber = 1;
  let blockNumber = 1;

  for (let cycleNumber = 1; cycleNumber <= DECISION_CLARITY_REPLICATION_CYCLES; cycleNumber += 1) {
    for (const permutation of DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE) {
      permutation.contracts.forEach((contract, index) => {
        const positionWithinBlock = (index + 1) as DecisionClarityReplicationPosition;
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

  validateDecisionClarityReplicationSchedule(trials);
  return trials;
}

export function buildDecisionClarityReplicationCanonicalFingerprints(args: {
  config: LocalVlmResolvedConfig;
  overlayBytes: Uint8Array;
  overlayMediaType: string;
  observationRunId: string;
}): readonly DecisionClarityCanonicalFingerprint[] {
  return buildDecisionClarityCanonicalFingerprints(args);
}

function buildContractFindings(
  trials: readonly DecisionClarityReplicationTrialReport[],
): readonly DecisionClarityReplicationContractFinding[] {
  return DECISION_CLARITY_CONTRACTS.map((contract) => {
    const contractTrials = trials.filter((trial) => trial.contract === contract);
    const timelyValidCount = contractTrials.filter(
      (trial) => trial.completionState === "TIMELY_VALID_COMPLETION",
    ).length;
    const timelyInvalidCount = contractTrials.filter(
      (trial) => trial.completionState === "TIMELY_INVALID_COMPLETION",
    ).length;
    const lateValidCount = contractTrials.filter(
      (trial) => trial.completionState === "LATE_VALID_COMPLETION",
    ).length;
    const lateInvalidCount = contractTrials.filter(
      (trial) => trial.completionState === "LATE_INVALID_COMPLETION",
    ).length;
    const hardNonCompletionCount = contractTrials.filter(
      (trial) => trial.completionState === "HARD_NON_COMPLETION",
    ).length;
    const requestNotSentCount = contractTrials.filter(
      (trial) => trial.completionState === "REQUEST_NOT_SENT",
    ).length;
    const transportFailureCount = contractTrials.filter(
      (trial) => trial.completionState === "TRANSPORT_FAILURE",
    ).length;
    const processFailureCount = contractTrials.filter(
      (trial) => trial.completionState === "PROCESS_FAILURE",
    ).length;
    const provenanceFailureCount = contractTrials.filter(
      (trial) => trial.completionState === "PROVENANCE_FAILURE",
    ).length;
    const blockedCount = contractTrials.filter((trial) => trial.status === "BLOCKED").length;
    const fingerprintMismatchCount = contractTrials.filter(
      (trial) => !trial.requestFingerprint.allFieldsMatched,
    ).length;
    const completionLatencies = contractTrials
      .map((trial) => trial.evidence?.completionLatencyMs ?? null)
      .filter((value): value is number => value !== null);

    return {
      contract,
      expectedAppearances: 12,
      executedAppearances: contractTrials.length - blockedCount,
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
        contractTrials.length === 12 &&
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
    };
  });
}

function buildPositionFindings(
  trials: readonly DecisionClarityReplicationTrialReport[],
): readonly DecisionClarityReplicationPositionFinding[] {
  const findings: DecisionClarityReplicationPositionFinding[] = [];
  for (const contract of DECISION_CLARITY_CONTRACTS) {
    for (const position of DECISION_CLARITY_REPLICATION_POSITIONS) {
      const matchingTrials = trials.filter(
        (trial) => trial.contract === contract && trial.positionWithinBlock === position,
      );
      const timelyValidCount = matchingTrials.filter((trial) =>
        isTimelyValidState(trial.completionState),
      ).length;
      findings.push({
        contract,
        position,
        appearances: matchingTrials.length,
        timelyValidCount,
        allOtherTerminalCount: matchingTrials.length - timelyValidCount,
      });
    }
  }
  return findings;
}

function buildBlockComparisons(
  trials: readonly DecisionClarityReplicationTrialReport[],
): readonly DecisionClarityReplicationBlockComparison[] {
  const comparisons: DecisionClarityReplicationBlockComparison[] = [];

  for (
    let blockNumber = 1;
    blockNumber <= DECISION_CLARITY_REPLICATION_TOTAL_BLOCKS;
    blockNumber += 1
  ) {
    const blockTrials = trials.filter((trial) => trial.blockNumber === blockNumber);
    const expectedPermutation = expectedPermutationForBlock(blockNumber);
    const cycleNumber =
      Math.floor((blockNumber - 1) / DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE.length) + 1;
    const aTrial = blockTrials.find((trial) => trial.contract === "A") ?? null;
    const aPrimeTrial = blockTrials.find((trial) => trial.contract === "A_PRIME") ?? null;
    const aCompletionLatencyMs = aTrial?.evidence?.completionLatencyMs ?? null;
    const aPrimeCompletionLatencyMs = aPrimeTrial?.evidence?.completionLatencyMs ?? null;
    const aTimelyValid = isTimelyValidState(aTrial?.completionState ?? null);
    const aPrimeTimelyValid = isTimelyValidState(aPrimeTrial?.completionState ?? null);
    const unusable = isNonAttributableTrial(aTrial) || isNonAttributableTrial(aPrimeTrial);

    const blockOutcome = unusable
      ? "UNUSABLE"
      : aPrimeTimelyValid && !aTimelyValid
        ? "A_PRIME_FAVORED"
        : aTimelyValid && !aPrimeTimelyValid
          ? "A_FAVORED"
          : aTimelyValid && aPrimeTimelyValid
            ? "TIED_TIMELY_VALID"
            : "TIED_NON_TIMELY_VALID";

    comparisons.push({
      cycleNumber,
      blockNumber,
      permutationId:
        (blockTrials[0]?.permutationId as DecisionClarityReplicationPermutationId | undefined) ??
        expectedPermutation.permutationId,
      aSequenceNumber: aTrial?.sequenceNumber ?? null,
      aPrimeSequenceNumber: aPrimeTrial?.sequenceNumber ?? null,
      aPosition: aTrial?.positionWithinBlock ?? null,
      aPrimePosition: aPrimeTrial?.positionWithinBlock ?? null,
      aCompletionState: aTrial?.completionState ?? null,
      aPrimeCompletionState: aPrimeTrial?.completionState ?? null,
      aTimelyValid,
      aPrimeTimelyValid,
      blockOutcome,
      aCompletionLatencyMs,
      aPrimeCompletionLatencyMs,
      rawLatencyDifferenceMs:
        aCompletionLatencyMs === null || aPrimeCompletionLatencyMs === null
          ? null
          : aPrimeCompletionLatencyMs - aCompletionLatencyMs,
      percentageDifference: percentageDifference(aCompletionLatencyMs, aPrimeCompletionLatencyMs),
    });
  }

  return comparisons;
}

export function classifyDecisionClarityReplicationTrials(
  trials: readonly DecisionClarityReplicationTrialReport[],
): {
  scheduleAudit: DecisionClarityReplicationScheduleAudit;
  contractFindings: readonly DecisionClarityReplicationContractFinding[];
  positionFindings: readonly DecisionClarityReplicationPositionFinding[];
  blockComparisons: readonly DecisionClarityReplicationBlockComparison[];
  controlStability: DecisionClarityReplicationControlStability;
  classification: DecisionClarityReplicationClassification;
} {
  const scheduleAudit = auditDecisionClarityReplicationSchedule(trials);
  const contractFindings = buildContractFindings(trials);
  const positionFindings = buildPositionFindings(trials);
  const blockComparisons = buildBlockComparisons(trials);
  const aFinding = contractFindings.find((finding) => finding.contract === "A")!;
  const aPrimeFinding = contractFindings.find((finding) => finding.contract === "A_PRIME")!;
  const bFinding = contractFindings.find((finding) => finding.contract === "B")!;
  const aPrimeFavoredBlocks = blockComparisons.filter(
    (comparison) => comparison.blockOutcome === "A_PRIME_FAVORED",
  );
  const aFavoredBlocks = blockComparisons.filter(
    (comparison) => comparison.blockOutcome === "A_FAVORED",
  );
  const tiedTimelyValidBlocks = blockComparisons.filter(
    (comparison) => comparison.blockOutcome === "TIED_TIMELY_VALID",
  ).length;
  const tiedNonTimelyValidBlocks = blockComparisons.filter(
    (comparison) => comparison.blockOutcome === "TIED_NON_TIMELY_VALID",
  ).length;
  const unusableBlocks = blockComparisons.filter(
    (comparison) => comparison.blockOutcome === "UNUSABLE",
  ).length;
  const distinctAPrimeFavoredPermutations = new Set(
    aPrimeFavoredBlocks.map((comparison) => comparison.permutationId),
  ).size;
  const distinctAFavoredPermutations = new Set(
    aFavoredBlocks.map((comparison) => comparison.permutationId),
  ).size;
  const controlStability: DecisionClarityReplicationControlStability = {
    contract: "B",
    timelyValidCount: bFinding.timelyValidCount,
    minimumRequired: DECISION_CLARITY_REPLICATION_CONTROL_MIN_TIMELY_VALID,
    stable: bFinding.timelyValidCount >= DECISION_CLARITY_REPLICATION_CONTROL_MIN_TIMELY_VALID,
  };

  const notes: string[] = [];
  const completeEvidenceGateSatisfied =
    scheduleAudit.passed &&
    trials.length === DECISION_CLARITY_REPLICATION_TOTAL_TRIALS &&
    contractFindings.every((finding) => finding.blockedCount === 0) &&
    contractFindings.every((finding) => finding.fingerprintMismatchCount === 0) &&
    contractFindings.every((finding) => finding.provenanceFailureCount === 0) &&
    contractFindings.every((finding) => finding.requestNotSentCount === 0) &&
    contractFindings.every((finding) => finding.transportFailureCount === 0) &&
    contractFindings.every((finding) => finding.processFailureCount === 0) &&
    unusableBlocks === 0;

  if (!scheduleAudit.passed) {
    notes.push(`The trial ledger failed schedule validation: ${scheduleAudit.issues.join("; ")}`);
  }
  if (trials.length !== DECISION_CLARITY_REPLICATION_TOTAL_TRIALS) {
    notes.push(
      `The trial ledger must contain all ${DECISION_CLARITY_REPLICATION_TOTAL_TRIALS} scheduled trials.`,
    );
  }
  if (contractFindings.some((finding) => finding.blockedCount > 0)) {
    notes.push("At least one scheduled trial was blocked by an earlier terminal failure.");
  }
  if (contractFindings.some((finding) => finding.fingerprintMismatchCount > 0)) {
    notes.push("At least one trial failed canonical fingerprint verification.");
  }
  if (contractFindings.some((finding) => finding.provenanceFailureCount > 0)) {
    notes.push("At least one trial ended in provenance failure.");
  }
  if (contractFindings.some((finding) => finding.requestNotSentCount > 0)) {
    notes.push("At least one trial never reached transmission.");
  }
  if (contractFindings.some((finding) => finding.transportFailureCount > 0)) {
    notes.push("At least one trial ended in transport failure.");
  }
  if (contractFindings.some((finding) => finding.processFailureCount > 0)) {
    notes.push("At least one trial ended in process failure.");
  }
  if (unusableBlocks > 0) {
    notes.push(`${unusableBlocks} block comparison(s) were unusable.`);
  }
  if (!controlStability.stable) {
    notes.push(
      `Contract B timely-valid count was ${controlStability.timelyValidCount}, below the required ${controlStability.minimumRequired}.`,
    );
  }

  if (!completeEvidenceGateSatisfied) {
    return {
      scheduleAudit,
      contractFindings,
      positionFindings,
      blockComparisons,
      controlStability,
      classification: {
        replicationEffect: "INSUFFICIENT_EVIDENCE",
        completeEvidenceGateSatisfied: false,
        aTimelyValidCount: aFinding.timelyValidCount,
        aPrimeTimelyValidCount: aPrimeFinding.timelyValidCount,
        bTimelyValidCount: bFinding.timelyValidCount,
        aPrimeFavoredBlocks: aPrimeFavoredBlocks.length,
        aFavoredBlocks: aFavoredBlocks.length,
        tiedTimelyValidBlocks,
        tiedNonTimelyValidBlocks,
        unusableBlocks,
        distinctAPrimeFavoredPermutations,
        distinctAFavoredPermutations,
        notes,
      },
    };
  }

  const timelyValidDifference = aPrimeFinding.timelyValidCount - aFinding.timelyValidCount;
  const supported =
    timelyValidDifference >= 3 &&
    aPrimeFavoredBlocks.length >= 3 &&
    aFavoredBlocks.length <= 1 &&
    distinctAPrimeFavoredPermutations >= 3 &&
    controlStability.stable;
  const contradicted =
    timelyValidDifference <= -3 &&
    aFavoredBlocks.length >= 3 &&
    aPrimeFavoredBlocks.length <= 1 &&
    distinctAFavoredPermutations >= 3 &&
    controlStability.stable;
  const noEffect =
    Math.abs(timelyValidDifference) <= 1 &&
    aPrimeFavoredBlocks.length <= 1 &&
    aFavoredBlocks.length <= 1 &&
    controlStability.stable;

  let replicationEffect: DecisionClarityReplicationClassificationName = "INSUFFICIENT_EVIDENCE";
  if (supported) {
    replicationEffect = "REPLICATION_SUPPORTED";
    notes.push("Contract A_PRIME met the preregistered replication thresholds versus Contract A.");
  } else if (contradicted) {
    replicationEffect = "REPLICATION_CONTRADICTED";
    notes.push(
      "Contract A met the preregistered contradiction thresholds versus Contract A_PRIME.",
    );
  } else if (noEffect) {
    replicationEffect = "NO_REPLICATION_EFFECT_OBSERVED";
    notes.push(
      "No material replication effect was observed under the preregistered bounded criteria.",
    );
  } else {
    if (Math.abs(timelyValidDifference) === 2) {
      notes.push("The timely-valid difference was 2, below the preregistered threshold of 3.");
    }
    if (aPrimeFavoredBlocks.length > 1 && aFavoredBlocks.length > 1) {
      notes.push("Block direction was mixed across the complete counterbalanced schedule.");
    }
    if (aPrimeFavoredBlocks.length >= 3 && distinctAPrimeFavoredPermutations < 3) {
      notes.push(
        "A_PRIME-favored blocks were not distributed across at least 3 distinct permutations.",
      );
    }
    if (aFavoredBlocks.length >= 3 && distinctAFavoredPermutations < 3) {
      notes.push("A-favored blocks were not distributed across at least 3 distinct permutations.");
    }
    if (notes.length === 0) {
      notes.push(
        "The complete counterbalanced schedule produced a pattern that did not satisfy a preregistered terminal classification.",
      );
    }
  }

  return {
    scheduleAudit,
    contractFindings,
    positionFindings,
    blockComparisons,
    controlStability,
    classification: {
      replicationEffect,
      completeEvidenceGateSatisfied: true,
      aTimelyValidCount: aFinding.timelyValidCount,
      aPrimeTimelyValidCount: aPrimeFinding.timelyValidCount,
      bTimelyValidCount: bFinding.timelyValidCount,
      aPrimeFavoredBlocks: aPrimeFavoredBlocks.length,
      aFavoredBlocks: aFavoredBlocks.length,
      tiedTimelyValidBlocks,
      tiedNonTimelyValidBlocks,
      unusableBlocks,
      distinctAPrimeFavoredPermutations,
      distinctAFavoredPermutations,
      notes,
    },
  };
}

export async function runLocalVlmDecisionClarityReplicationDiagnostic(args: {
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
    trial: DecisionClarityReplicationScheduledTrial,
    prepared: DecisionClarityPreparedTrialRequest,
  ) => DecisionClarityPreparedTrialRequest;
  mutateLaunchSpec?: (
    trial: DecisionClarityReplicationScheduledTrial,
    launchSpec: LlamaServerLaunchSpec,
  ) => LlamaServerLaunchSpec;
  inspectPreparedTrialRequest?: (
    trial: DecisionClarityReplicationScheduledTrial,
    prepared: DecisionClarityPreparedTrialRequest,
  ) => void;
  inspectTransmittedRequestBody?: (
    trial: DecisionClarityReplicationScheduledTrial,
    requestBody: ReturnType<typeof buildVisionChatRequestBody>,
  ) => void;
}): Promise<DecisionClarityReplicationDiagnosticReport> {
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
  const requestFingerprints = buildDecisionClarityReplicationCanonicalFingerprints({
    config: args.config,
    overlayBytes: fingerprintOverlay.overlayBytes,
    overlayMediaType: fingerprintOverlay.overlayMediaType,
    observationRunId: randomUUID(),
  });
  const schedule = buildDecisionClarityReplicationSchedule();
  validateDecisionClarityReplicationSchedule(schedule);
  const trials: DecisionClarityReplicationTrialReport[] = [];
  let fatalStopReason: string | null = null;
  let blockedBySequenceNumber: number | null = null;

  for (const trial of schedule) {
    if (fatalStopReason !== null && blockedBySequenceNumber !== null) {
      trials.push(
        buildBlockedReplicationTrialReport({
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
      toReplicationTrialReport({
        trial,
        report: result.report,
      }),
    );

    if (result.fatalStopReason !== null) {
      fatalStopReason = result.fatalStopReason;
      blockedBySequenceNumber = trial.sequenceNumber;
    }
  }

  const classified = classifyDecisionClarityReplicationTrials(trials);

  return {
    schemaVersion: DECISION_CLARITY_REPLICATION_SCHEMA_VERSION,
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
      cycles: DECISION_CLARITY_REPLICATION_CYCLES,
      blocksPerCycle: DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE.length,
      trialsPerBlock: DECISION_CLARITY_REPLICATION_TRIALS_PER_BLOCK,
      totalBlocks: DECISION_CLARITY_REPLICATION_TOTAL_BLOCKS,
      totalTrials: DECISION_CLARITY_REPLICATION_TOTAL_TRIALS,
      permutations: DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE.map((entry) => ({
        permutationId: entry.permutationId,
        contracts: [...entry.contracts],
      })),
    },
    scheduleAudit: classified.scheduleAudit,
    requestFingerprints,
    trials,
    contractFindings: classified.contractFindings,
    positionFindings: classified.positionFindings,
    blockComparisons: classified.blockComparisons,
    controlStability: classified.controlStability,
    classification: classified.classification,
    fatalStopReason,
  };
}

function cleanupSummary(report: DecisionClarityReplicationDiagnosticReport) {
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

export async function writeDecisionClarityReplicationDiagnosticFiles(args: {
  report: DecisionClarityReplicationDiagnosticReport;
  outputDir: string;
  stem: string;
}): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(args.outputDir, { recursive: true });
  const jsonPath = join(args.outputDir, `${args.stem}.json`);
  const markdownPath = join(args.outputDir, `${args.stem}.md`);
  const cleanup = cleanupSummary(args.report);
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
    ...DECISION_CLARITY_CONTRACTS.map(
      (contract) =>
        `- ${contract} appearances: total=${args.report.scheduleAudit.appearancesByContract[contract]}; pos1=${args.report.scheduleAudit.appearancesByPosition[contract][1]}; pos2=${args.report.scheduleAudit.appearancesByPosition[contract][2]}; pos3=${args.report.scheduleAudit.appearancesByPosition[contract][3]}`,
    ),
    ...DECISION_CLARITY_REPLICATION_SCHEDULE_TEMPLATE.map(
      (entry) =>
        `- ${entry.permutationId}: ${args.report.scheduleAudit.appearancesByPermutation[entry.permutationId]} block(s)`,
    ),
    `- Issues: ${args.report.scheduleAudit.issues.length === 0 ? "none" : args.report.scheduleAudit.issues.join("; ")}`,
    "",
    "## Complete Trial Ledger",
    "",
    ...args.report.trials.map((trial) => {
      const preview = trial.evidence?.boundedOutputPreview ?? "null";
      return `- #${trial.sequenceNumber} cycle${trial.cycleNumber} block${trial.blockNumber} ${trial.permutationId} pos${trial.positionWithinBlock} ${trial.contract}: ${trial.status}; completionState=${trial.completionState}; fingerprintVerified=${String(trial.requestFingerprint.allFieldsMatched)}; blockedBy=${trial.blockedBySequenceNumber ?? "null"}; completionLatencyMs=${trial.evidence?.completionLatencyMs ?? "null"}; timeoutStage=${trial.evidence?.timeoutStage ?? "null"}; preview=${preview}`;
    }),
    "",
    "## Contract Findings",
    "",
    ...args.report.contractFindings.map((finding) => {
      return `- ${finding.contract}: expected=${finding.expectedAppearances}; executed=${finding.executedAppearances}; timelyValid=${finding.timelyValidCount}; timelyInvalid=${finding.timelyInvalidCount}; lateValid=${finding.lateValidCount}; lateInvalid=${finding.lateInvalidCount}; hardNonCompletion=${finding.hardNonCompletionCount}; requestNotSent=${finding.requestNotSentCount}; transportFailure=${finding.transportFailureCount}; processFailure=${finding.processFailureCount}; provenanceFailure=${finding.provenanceFailureCount}; blocked=${finding.blockedCount}; fingerprintMismatch=${finding.fingerprintMismatchCount}; completeEvidence=${String(finding.completeEvidence)}; latency[min=${formatNumber(finding.latencySummary.minimum)}, median=${formatNumber(finding.latencySummary.median)}, max=${formatNumber(finding.latencySummary.maximum)}, mean=${formatNumber(finding.latencySummary.mean)}, sd=${formatNumber(finding.latencySummary.standardDeviation)}, p95=${formatNumber(finding.latencySummary.p95)}]`;
    }),
    "",
    "## Position Findings",
    "",
    ...args.report.positionFindings.map(
      (finding) =>
        `- ${finding.contract} position ${finding.position}: appearances=${finding.appearances}; timelyValid=${finding.timelyValidCount}; allOtherTerminal=${finding.allOtherTerminalCount}`,
    ),
    "",
    "## Block Comparisons",
    "",
    ...args.report.blockComparisons.map(
      (comparison) =>
        `- block ${comparison.blockNumber} cycle ${comparison.cycleNumber} ${comparison.permutationId}: outcome=${comparison.blockOutcome}; A=#${comparison.aSequenceNumber ?? "null"} pos=${comparison.aPosition ?? "null"} state=${comparison.aCompletionState ?? "null"} latency=${comparison.aCompletionLatencyMs ?? "null"}; A_PRIME=#${comparison.aPrimeSequenceNumber ?? "null"} pos=${comparison.aPrimePosition ?? "null"} state=${comparison.aPrimeCompletionState ?? "null"} latency=${comparison.aPrimeCompletionLatencyMs ?? "null"}; delta=${comparison.rawLatencyDifferenceMs ?? "null"}; pct=${comparison.percentageDifference === null ? "null" : `${comparison.percentageDifference.toFixed(2)}%`}`,
    ),
    "",
    "## B Stability Result",
    "",
    `- Contract B timely-valid count: ${args.report.controlStability.timelyValidCount}`,
    `- Minimum required: ${args.report.controlStability.minimumRequired}`,
    `- Stable: ${String(args.report.controlStability.stable)}`,
    "",
    "## Final Classification",
    "",
    `- Classification: ${args.report.classification.replicationEffect}`,
    `- Complete evidence gate satisfied: ${String(args.report.classification.completeEvidenceGateSatisfied)}`,
    `- A timely-valid count: ${args.report.classification.aTimelyValidCount}`,
    `- A_PRIME timely-valid count: ${args.report.classification.aPrimeTimelyValidCount}`,
    `- B timely-valid count: ${args.report.classification.bTimelyValidCount}`,
    `- A_PRIME favored blocks: ${args.report.classification.aPrimeFavoredBlocks}`,
    `- A favored blocks: ${args.report.classification.aFavoredBlocks}`,
    `- Tied timely-valid blocks: ${args.report.classification.tiedTimelyValidBlocks}`,
    `- Tied non-timely-valid blocks: ${args.report.classification.tiedNonTimelyValidBlocks}`,
    `- Unusable blocks: ${args.report.classification.unusableBlocks}`,
    `- Distinct A_PRIME-favored permutations: ${args.report.classification.distinctAPrimeFavoredPermutations}`,
    `- Distinct A-favored permutations: ${args.report.classification.distinctAFavoredPermutations}`,
    `- Notes: ${args.report.classification.notes.length === 0 ? "none" : args.report.classification.notes.join(" ")}`,
    "",
    "## Evidence Boundary",
    "",
    `- Complete evidence gate: ${args.report.classification.completeEvidenceGateSatisfied ? "satisfied" : "failed"}`,
    `- Fatal stop reason: ${args.report.fatalStopReason ?? "none"}`,
    `- Infrastructure contamination allowed: no`,
    `- Fingerprint mismatches allowed: no`,
    `- Blocked trials allowed: no`,
    "",
    "## Prohibited Interpretations",
    "",
    "- Do not promote infrastructure failure into hard non-completion.",
    "- Do not attribute any effect when Contract B is unstable.",
    "- Do not use latency to override differing timely-valid outcomes.",
    "- Do not attribute any effect when a block comparison is unusable.",
    "",
    "## Cleanup Summary",
    "",
    `- Executed trials: ${cleanup.executedTrials}`,
    `- Cleanup completed: ${cleanup.cleanupCompletedCount}/${cleanup.executedTrials}`,
    `- Forced terminations: ${cleanup.forcedTerminationCount}`,
    `- Residual workspace count: ${cleanup.workspaceResidueCount}`,
  ].join("\n");

  await writeFile(jsonPath, `${JSON.stringify(args.report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown}\n`, "utf8");

  return { jsonPath, markdownPath };
}
