#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";

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
  terminalStatus: string | null;
  verdict: string | null;
  haltCode: string | null;
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
      const record = JSON.parse(line) as Record<string, unknown>;
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
  const terminalStatus = typeof terminal?.status === "string" ? terminal.status : null;
  const verdict = typeof terminal?.verdict === "string" ? terminal.verdict : null;
  const haltCode = typeof terminal?.haltCode === "string" ? terminal.haltCode : null;
  const scientificResultProduced =
    typeof terminal?.scientificResultProduced === "boolean"
      ? terminal.scientificResultProduced
      : null;
  const terminalRecordFound = terminal !== null && parsed.count === 1 && !parsed.malformed;
  const reportCoherent = terminalRecordFound;
  const successfulVerdict =
    verdict === "COMPLETE_DETERMINISTIC_EVIDENCE" || verdict === "COMPLETE_WITH_NONDETERMINISM";
  const coherenceChecks = {
    reportCoherent,
    terminalRecordFound,
    successfulScientific:
      reportCoherent &&
      input.containerExitStatus === 0 &&
      terminalStatus === "ACQUISITION_COMPLETE" &&
      successfulVerdict &&
      scientificResultProduced === true &&
      haltCode === null,
    ocrRuntimeFailure:
      reportCoherent &&
      input.containerExitStatus !== 0 &&
      terminalStatus === "ACQUISITION_RUNTIME_FAILURE" &&
      verdict === "RUNTIME_FAILURE" &&
      scientificResultProduced === false &&
      haltCode === "OCR_RUNTIME_FAILURE",
    incompleteEvidence:
      reportCoherent &&
      input.containerExitStatus !== 0 &&
      verdict === "INCOMPLETE_EVIDENCE" &&
      scientificResultProduced === false,
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

if (process.argv[1]?.includes("issue-149-adjudicate-acquisition-outcome")) {
  try {
    process.exitCode = main();
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
