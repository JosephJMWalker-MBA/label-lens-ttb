/**
 * Issue #149 — the Stage 1 command assertions actually fail.
 *
 * Non-OCR. Every case runs the REAL `assert-adapter-surface.sh` against a
 * TEMPORARY MODIFIED COPY of the adapter. Nothing tracked is written.
 *
 * ## Why this exists
 *
 * `commands.sh` previously printed `grep -c` counts guarded with `|| true` and
 * exited zero regardless of what they said — so a missing public API, a missing
 * input snapshot, or a resurrected obsolete entrypoint all "passed". A check
 * that has never been observed to fail is not known to be a check.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const SCRIPT = path.join(process.cwd(), ROOT, "assert-adapter-surface.sh");
const ADAPTER = path.join(process.cwd(), "scripts/eval/lib/issue-149-candidate-adapter.ts");

const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-command-assertions-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Run the real assertion script; return its exit code and stderr. */
function runAssertions(adapterPath: string): { code: number; output: string } {
  try {
    const stdout = execFileSync("bash", [SCRIPT, adapterPath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    return { code: 0, output: stdout };
  } catch (cause) {
    const failure = cause as { status?: number; stderr?: string; stdout?: string };
    return { code: failure.status ?? -1, output: `${failure.stderr ?? ""}${failure.stdout ?? ""}` };
  }
}

/** A temporary adapter copy with one edit applied. */
function mutatedAdapter(name: string, edit: (source: string) => string): string {
  const target = path.join(scratch, `${name}.ts`);
  writeFileSync(target, edit(readFileSync(ADAPTER, "utf8")));
  return target;
}

describe("Issue #149 Stage 1 command assertions are load-bearing", () => {
  it("passes on the real current adapter", () => {
    const result = runAssertions(ADAPTER);
    expect(result.code).toBe(0);
    expect(result.output).toContain("ADAPTER_SOURCE_SURFACE_VERIFIED");
  });

  it("fails when the required public API is missing", () => {
    const copy = mutatedAdapter("no-api", (source) =>
      source.replace(
        "export async function acquireProductionBrandEvidence",
        "async function acquireProductionBrandEvidence",
      ),
    );
    const result = runAssertions(copy);
    expect(result.code).toBe(1);
    expect(result.output).toContain("PUBLIC_API_COUNT_MISMATCH");
  });

  it("fails when the required public API is DUPLICATED", () => {
    const copy = mutatedAdapter(
      "two-api",
      (source) =>
        `${source}\nexport async function acquireProductionBrandEvidence(other) { return other; }\n`,
    );
    const result = runAssertions(copy);
    expect(result.code).toBe(1);
    expect(result.output).toContain("PUBLIC_API_COUNT_MISMATCH");
  });

  it("fails when the pre-await input snapshot is gone", () => {
    const copy = mutatedAdapter("no-snapshot", (source) =>
      source.replace(
        "const snapshot = snapshotAcquisitionInput(input);",
        "const snapshot = input;",
      ),
    );
    const result = runAssertions(copy);
    expect(result.code).toBe(1);
    expect(result.output).toContain("INPUT_SNAPSHOT_COUNT_MISMATCH");
  });

  it("fails when the boundary stops sealing its output", () => {
    const copy = mutatedAdapter("no-seal", (source) =>
      source.replace("return sealSuccessfulItem(", "return rawEvidence("),
    );
    const result = runAssertions(copy);
    expect(result.code).toBe(1);
    expect(result.output).toContain("SEALED_RETURN_COUNT_MISMATCH");
  });

  it("fails when an obsolete public entrypoint reappears", () => {
    const copy = mutatedAdapter(
      "obsolete",
      (source) =>
        `${source}\nexport function finalizeProductionBrandEvidence(debug, id) { return { debug, id }; }\n`,
    );
    const result = runAssertions(copy);
    expect(result.code).toBe(1);
    expect(result.output).toContain("OBSOLETE_PUBLIC_API_PRESENT");
  });

  it("fails when the raw mutable evidence result type reappears", () => {
    const copy = mutatedAdapter(
      "raw-result",
      (source) =>
        `${source}\nexport interface ProductionBrandEvidenceSuccess { detailed: unknown }\n`,
    );
    const result = runAssertions(copy);
    expect(result.code).toBe(1);
    expect(result.output).toContain("RAW_EVIDENCE_RESULT_TYPE_PRESENT");
  });

  it("does not claim to prove the RUNTIME export namespace", () => {
    // These are source assertions. The runtime namespace is asserted by
    // dynamically importing the real module, in issue-149-sealed-evidence.test.ts.
    const script = readFileSync(SCRIPT, "utf8");
    expect(script).toContain("NOT prove the runtime export namespace");
    expect(script).toContain("issue-149-sealed-evidence.test.ts");
  });

  it("is invoked by commands.sh, and commands.sh is syntactically valid", () => {
    const commands = readFileSync(path.join(process.cwd(), ROOT, "commands.sh"), "utf8");
    expect(commands).toContain("assert-adapter-surface.sh");
    // The `|| true`-and-print pattern that made the old block non-load-bearing.
    expect(commands).not.toContain('echo "public API: $(grep -c');
    execFileSync("bash", ["-n", path.join(process.cwd(), ROOT, "commands.sh")], {
      cwd: process.cwd(),
    });
    execFileSync("bash", ["-n", SCRIPT], { cwd: process.cwd() });
  });

  it("leaves the tracked adapter untouched", () => {
    const before = readFileSync(ADAPTER);
    copyFileSync(ADAPTER, path.join(scratch, "untouched.ts"));
    expect(readFileSync(ADAPTER).equals(before)).toBe(true);
  });
});
