/**
 * Issue #149 — actor 2's raw verification and actor 3's identity-leak scan, as
 * workflow entrypoints.
 *
 * Thin CLIs over the tested implementations, so the workflow runs the SAME code
 * the tests drive rather than a second copy of the rules. Neither writes into
 * `raw/`.
 *
 *   --raw <dir>            the raw evidence root (holds primary/ and repeat/)
 *   --manifest <file>      the truth-free input manifest, for the expected IDs
 *   --identity             additionally run the Job C identity-leak scan
 *   --id-map <file>        the historical inventory (Job C only)
 *   --truth-keys <file>    the canonical forbidden-key inventory
 *   --report <file>        where to write the report, OUTSIDE raw/
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { sha256Bytes } from "./lib/issue-149-evidence-canonical";
import { verifyNoHistoricalIdentity, verifyRawEvidence } from "./lib/issue-149-raw-verifier";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const rawRoot = argument("raw") ?? "output/raw";
const manifestPath = argument("manifest") ?? "preparation/input/truth-free-input-manifest.json";
const reportPath = argument("report") ?? "raw-verification-report.json";

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  cases: Array<{ opaqueItemId: string }>;
};
const expectedItemIds = manifest.cases.map((item) => item.opaqueItemId);

const raw = verifyRawEvidence({ rawRoot, expectedItemIds });

let identity: ReturnType<typeof verifyNoHistoricalIdentity> | null = null;
if (flag("identity")) {
  // Job C receives the minimal inventory and NOTHING else — no acceptable
  // values, no truth labels, no expected field values, no classifications.
  const idMapPath = argument("id-map");
  const truthKeysPath = argument("truth-keys");
  const idMap =
    idMapPath !== null && existsSync(idMapPath)
      ? (JSON.parse(readFileSync(idMapPath, "utf8")) as {
          map: Array<{ historicalCaseId: string; historicalImagePath: string }>;
        })
      : { map: [] };
  const forbiddenEvidenceKeys =
    truthKeysPath !== null && existsSync(truthKeysPath)
      ? (JSON.parse(readFileSync(truthKeysPath, "utf8")) as string[])
      : [];
  identity = verifyNoHistoricalIdentity({
    rawRoot,
    historicalCaseIds: idMap.map.map((entry) => entry.historicalCaseId),
    historicalImagePaths: idMap.map.map((entry) => entry.historicalImagePath),
    forbiddenEvidenceKeys,
  });
}

const report = {
  rawVerification: raw,
  identityVerification: identity,
  ok: raw.ok && (identity === null || identity.ok),
};
const text = `${JSON.stringify(report, null, 2)}\n`;
// OUTSIDE raw/. A verifier that wrote into the evidence it verifies would change
// the thing it just measured.
writeFileSync(reportPath, text);
process.stdout.write(text);
process.stderr.write(`report digest: ${sha256Bytes(text)}\n`);

if (!report.ok) process.exitCode = 1;
