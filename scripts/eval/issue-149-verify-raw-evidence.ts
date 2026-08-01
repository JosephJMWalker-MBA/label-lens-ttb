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
 *   --identity                    additionally run the Job C identity-leak scan
 *   --identity-inventory <file>   the minimal identity inventory (Job C only)
 *   --identity-manifest <file>    its frozen digest and counts
 *   --report <file>        where to write the report, OUTSIDE raw/
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { sha256Bytes } from "./lib/issue-149-evidence-canonical";
import {
  IdentityInventoryError,
  loadIdentityInventory,
  verifyNoHistoricalIdentity,
  verifyRawEvidence,
} from "./lib/issue-149-raw-verifier";

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

/**
 * The one boundary that decides an exit code.
 *
 * A halt prints its governed code as JSON rather than a stack trace: the
 * workflow and the rehearsal both read this output, and an uncaught throw is
 * neither greppable nor a stated outcome.
 */
try {
  const raw = verifyRawEvidence({ rawRoot, expectedItemIds });

  let identity: ReturnType<typeof verifyNoHistoricalIdentity> | null = null;
  if (flag("identity")) {
    // Job C receives the minimal inventory and NOTHING else — no acceptable
    // values, no truth labels, no expected field values, no classifications.
    //
    // A missing file is a HALT, never an empty inventory. The previous version
    // defaulted both to `[]`, so Job C would scan for zero markers and report
    // clean: a check that could not fail.
    const inventoryPath = argument("identity-inventory");
    const manifestFile = argument("identity-manifest");
    const inventory = loadIdentityInventory({
      inventoryText:
        inventoryPath !== null && existsSync(inventoryPath)
          ? readFileSync(inventoryPath, "utf8")
          : null,
      expected:
        manifestFile !== null && existsSync(manifestFile)
          ? (JSON.parse(readFileSync(manifestFile, "utf8")) as {
              inventorySha256: string;
              historicalCaseIdCount: number;
              historicalImagePathCount: number;
              forbiddenEvidenceKeyCount: number;
            })
          : null,
    });
    identity = verifyNoHistoricalIdentity({ rawRoot, ...inventory });
  }

  const report = {
    rawVerification: raw,
    identityVerification: identity,
    ok: raw.ok && (identity === null || identity.ok),
  };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  // OUTSIDE raw/. A verifier that wrote into the evidence it verifies would
  // change the thing it just measured.
  writeFileSync(reportPath, text);
  process.stdout.write(text);
  process.stderr.write(`report digest: ${sha256Bytes(text)}\n`);

  if (!report.ok) process.exitCode = 1;
} catch (cause) {
  const halt = {
    status: "HALTED",
    reason:
      cause instanceof IdentityInventoryError ? cause.code : "VERIFICATION_UNEXPECTED_FAILURE",
    detail: cause instanceof Error ? cause.message : String(cause),
    ok: false,
  };
  const text = `${JSON.stringify(halt, null, 2)}\n`;
  writeFileSync(reportPath, text);
  process.stderr.write(text);
  process.exitCode = 1;
}
