/**
 * Issue #149 — the terminal archive adjudication.
 *
 * Runs LAST, after the verified artifact, the exact-ID redownload, the digest
 * comparison, the content re-verification and the receipt. It is the only place
 * an over-limit result may fail the workflow, and it refuses to adjudicate at
 * all unless preservation already happened.
 */
import { existsSync, readFileSync } from "node:fs";

import { archiveAdjudication, type ArchiveVolumeReport } from "./lib/issue-149-archive-volume";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
};
const present = (file: string | null): boolean => file !== null && existsSync(file);

const reportPath = argument("volume-report");
if (!present(reportPath)) {
  process.stderr.write(
    `${JSON.stringify({ status: "HALTED", reason: "ARCHIVE_VOLUME_REPORT_ABSENT" })}\n`,
  );
  process.exitCode = 1;
} else {
  const report = JSON.parse(readFileSync(reportPath!, "utf8")) as ArchiveVolumeReport;
  const verdict = archiveAdjudication({
    report,
    verifiedArtifactUploaded: argument("artifact-id") !== null && argument("artifact-id") !== "",
    verificationReceiptCreated: present(argument("receipt")),
  });
  const text = `${JSON.stringify({ ...verdict, rawBytes: report.rawBytes, overLimit: report.overLimit }, null, 2)}\n`;
  if (verdict.ok) process.stdout.write(text);
  else {
    process.stderr.write(text);
    process.exitCode = 1;
  }
}
