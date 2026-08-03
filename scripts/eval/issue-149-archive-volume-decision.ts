/**
 * Issue #149 — the archive-volume measurement, as a workflow entrypoint.
 *
 * NONFATAL by construction: it measures, writes `archive-volume-report.json`,
 * and exits 0 whether or not the limit was exceeded. The stop is a later,
 * terminal adjudication that runs only after the verified artifact and its
 * receipt exist.
 *
 *   --bytes <n>     the measured byte count
 *   --report <file> where to write the report
 */
import { writeFileSync } from "node:fs";

import { decideArchiveVolume } from "./lib/issue-149-archive-volume";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
};

const report = decideArchiveVolume(Number(argument("bytes") ?? "0"));
const text = `${JSON.stringify(report, null, 2)}\n`;
writeFileSync(argument("report") ?? "archive-volume-report.json", text);
process.stdout.write(text);
