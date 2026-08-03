#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type AcquisitionOutcomeClass =
  | "SCIENTIFIC_RESULT_COMPLETE"
  | "OCR_RUNTIME_FAILURE"
  | "INCOMPLETE_EVIDENCE"
  | "ACQUISITION_RUNNER_FAILURE";

export interface AcquisitionOutcomeReport {
  containerExitStatus: number;
  terminalRecordFound: boolean;
  terminalRecordCount: number;
  reportMalformed: boolean;
  malformedLineCount: number;
  reportCoherent: boolean;
  terminalSchemaValid: boolean;
  terminalFieldErrors: string[];
  haltCodePresent: boolean;
  terminalStatus: string | null;
  verdict: string | null;
  haltCode: unknown;
  scientificResultProduced: boolean | null;
  outcomeClass: AcquisitionOutcomeClass;
  coherenceChecks: Record<string, boolean>;
  finalDecision: string;
}

function parseJsonlTerminal(file: string): {
  terminal: Record<string, unknown> | null;
  count: number;
  malformed: boolean;
  malformedLineCount: number;
} {
  if (!existsSync(file)) {
    return { terminal: null, count: 0, malformed: true, malformedLineCount: 1 };
  }
  let malformed = false;
  let malformedLineCount = 0;
  const terminals: Record<string, unknown>[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        malformed = true;
        malformedLineCount += 1;
        continue;
      }
      const record = parsed as Record<string, unknown>;
      if (typeof record.status === "string" && record.status.startsWith("ACQUISITION_")) {
        terminals.push(record);
      }
    } catch {
      malformed = true;
      malformedLineCount += 1;
    }
  }
  return {
    terminal: terminals.length >= 1 ? terminals[0] : null,
    count: terminals.length,
    malformed,
    malformedLineCount,
  };
}

export function adjudicateAcquisitionOutcome(input: {
  acquisitionReportPath: string;
  containerExitStatus: number;
}): AcquisitionOutcomeReport {
  const parsed = parseJsonlTerminal(input.acquisitionReportPath);
  const terminal = parsed.terminal;
  const terminalHas = (field: string): boolean =>
    terminal !== null && Object.prototype.hasOwnProperty.call(terminal, field);
  const terminalFieldErrors: string[] = [];
  const terminalStatus = typeof terminal?.status === "string" ? terminal.status : null;
  const verdict = typeof terminal?.verdict === "string" ? terminal.verdict : null;
  const haltCodePresent = terminalHas("haltCode");
  const haltCode = haltCodePresent ? terminal?.haltCode : undefined;
  const scientificResultProduced =
    typeof terminal?.scientificResultProduced === "boolean"
      ? terminal.scientificResultProduced
      : null;
  const terminalRecordFound = terminal !== null && parsed.count === 1 && !parsed.malformed;
  if (terminal !== null) {
    if (!terminalHas("status") || typeof terminal.status !== "string") {
      terminalFieldErrors.push("status");
    }
    if (!terminalHas("verdict") || typeof terminal.verdict !== "string") {
      terminalFieldErrors.push("verdict");
    }
    if (
      !terminalHas("scientificResultProduced") ||
      typeof terminal.scientificResultProduced !== "boolean"
    ) {
      terminalFieldErrors.push("scientificResultProduced");
    }
    if (
      !haltCodePresent ||
      !(terminal.haltCode === null || typeof terminal.haltCode === "string")
    ) {
      terminalFieldErrors.push("haltCode");
    }
  }
  const terminalSchemaValid = terminal !== null && terminalFieldErrors.length === 0;
  const reportCoherent = terminalRecordFound;
  const successfulVerdict =
    verdict === "COMPLETE_DETERMINISTIC_EVIDENCE" || verdict === "COMPLETE_WITH_NONDETERMINISM";
  const coherenceChecks = {
    reportCoherent,
    terminalRecordFound,
    successfulScientific:
      reportCoherent &&
      terminalSchemaValid &&
      input.containerExitStatus === 0 &&
      terminalStatus === "ACQUISITION_COMPLETE" &&
      successfulVerdict &&
      scientificResultProduced === true &&
      haltCode === null,
    ocrRuntimeFailure:
      reportCoherent &&
      terminalSchemaValid &&
      input.containerExitStatus !== 0 &&
      terminalStatus === "ACQUISITION_RUNTIME_FAILURE" &&
      verdict === "RUNTIME_FAILURE" &&
      scientificResultProduced === false &&
      haltCode === "OCR_RUNTIME_FAILURE",
    incompleteEvidence:
      reportCoherent &&
      terminalSchemaValid &&
      input.containerExitStatus !== 0 &&
      terminalStatus === "ACQUISITION_COMPLETE" &&
      verdict === "INCOMPLETE_EVIDENCE" &&
      scientificResultProduced === false &&
      haltCode === null,
  };
  let outcomeClass: AcquisitionOutcomeClass = "ACQUISITION_RUNNER_FAILURE";
  let finalDecision = "ACQUISITION_RUNNER_FAILURE";
  if (coherenceChecks.successfulScientific) {
    outcomeClass = "SCIENTIFIC_RESULT_COMPLETE";
    finalDecision = "SCIENTIFIC_RESULT_COMPLETE";
  } else if (coherenceChecks.ocrRuntimeFailure) {
    outcomeClass = "OCR_RUNTIME_FAILURE";
    finalDecision = "OCR_RUNTIME_FAILURE";
  } else if (coherenceChecks.incompleteEvidence && terminalRecordFound) {
    outcomeClass = "INCOMPLETE_EVIDENCE";
    finalDecision = "INCOMPLETE_EVIDENCE";
  }
  return {
    containerExitStatus: input.containerExitStatus,
    terminalRecordFound,
    terminalRecordCount: parsed.count,
    reportMalformed: parsed.malformed,
    malformedLineCount: parsed.malformedLineCount,
    reportCoherent,
    terminalSchemaValid,
    terminalFieldErrors,
    haltCodePresent,
    terminalStatus,
    verdict,
    haltCode,
    scientificResultProduced,
    outcomeClass,
    coherenceChecks,
    finalDecision,
  };
}

export function main(argv = process.argv): number {
  const report = argv[2];
  const status = Number(argv[3]);
  const out = argv[4] ?? "acquisition-outcome-report.json";
  if (!report || !Number.isInteger(status)) {
    throw new Error(
      "usage: adjudicate-acquisition-outcome <acquisition-report.jsonl> <exit-status> [out.json]",
    );
  }
  const adjudicated = adjudicateAcquisitionOutcome({
    acquisitionReportPath: report,
    containerExitStatus: status,
  });
  writeFileSync(out, `${JSON.stringify(adjudicated, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(adjudicated)}\n`);
  return 0;
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    process.exitCode = main();
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
