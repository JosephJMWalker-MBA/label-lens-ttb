/**
 * Issue #149 — discover mode halts before OCR.
 *
 * Non-OCR, and load-bearing: it drives the REAL runner `main()` with the
 * extractor, the acquisition API and the writer all mocked, and fails if any of
 * them is invoked. A comment saying "discover returns early" is not a control;
 * this is.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/pipeline/extractor/extractor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pipeline/extractor/extractor")>()),
  extractLabelEvidenceDetailed: vi.fn(),
}));

vi.mock("../../../scripts/eval/lib/issue-149-candidate-adapter", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../scripts/eval/lib/issue-149-candidate-adapter")
  >()),
  acquireProductionBrandEvidence: vi.fn(),
  writeSealedEvidencePackage: vi.fn(),
}));

vi.mock("../../../scripts/eval/lib/issue-149-runtime-discovery", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../scripts/eval/lib/issue-149-runtime-discovery")
  >()),
  runRuntimeDiscovery: vi.fn(),
}));

import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";

import {
  acquireProductionBrandEvidence,
  writeSealedEvidencePackage,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";
import { runRuntimeDiscovery } from "../../../scripts/eval/lib/issue-149-runtime-discovery";
import {
  declaredModeMarker,
  main,
  resolveRunnerMode,
} from "../../../scripts/eval/issue-149-brand-evidence-acquisition-run";

/**
 * The committed control state: the mode file and the authorization artifact,
 * read together.
 *
 * These are ONE state, not two independent facts, and the tests assert its
 * COHERENCE rather than today's value. Asserting `discover` and
 * `EXECUTE_NOT_AUTHORIZED` literally froze the pre-transition state into
 * ordinary CI — and the frozen transition commit may change only the mode file
 * and the authorization artifact, so it could not have repaired them. Pushing it
 * would have started the acquisition workflow and turned ordinary CI red by
 * construction.
 *
 * No trimming and no whitespace normalization: the mode bytes are exact.
 */
const CONTROL_STATE_ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const LOWER_HEX_40 = /^[0-9a-f]{40}$/;

type ControlState = "discover" | "execute" | "complete";

interface CommittedControlState {
  modeBytes: string;
  status: string;
  reviewedImplementationSha: string | null;
  state: ControlState | null;
  coherent: boolean;
  reason: string | null;
}

/** Classify a mode/authorization pair. Every incoherent pairing is rejected. */
function classifyControlState(
  modeBytes: string,
  status: string,
  reviewedImplementationSha: string | null,
): CommittedControlState {
  const base = { modeBytes, status, reviewedImplementationSha };
  const incoherent = (reason: string): CommittedControlState => ({
    ...base,
    state: null,
    coherent: false,
    reason,
  });
  const hasSha =
    typeof reviewedImplementationSha === "string" && LOWER_HEX_40.test(reviewedImplementationSha);

  if (modeBytes === "discover\n") {
    if (status !== "EXECUTE_NOT_AUTHORIZED") {
      return incoherent(`discover requires EXECUTE_NOT_AUTHORIZED, found ${status}`);
    }
    if (reviewedImplementationSha !== null) {
      return incoherent("discover requires a null reviewedImplementationSha");
    }
    return { ...base, state: "discover", coherent: true, reason: null };
  }
  if (modeBytes === "execute\n") {
    if (status !== "EXECUTE_AUTHORIZED") {
      return incoherent(`execute requires EXECUTE_AUTHORIZED, found ${status}`);
    }
    if (!hasSha) return incoherent("execute requires a full lowercase 40-hex reviewed SHA");
    return { ...base, state: "execute", coherent: true, reason: null };
  }
  if (modeBytes === "complete\n") {
    if (status !== "EXECUTE_AUTHORIZED") {
      return incoherent(`complete requires EXECUTE_AUTHORIZED, found ${status}`);
    }
    if (!hasSha) return incoherent("complete requires a full lowercase 40-hex reviewed SHA");
    return { ...base, state: "complete", coherent: true, reason: null };
  }
  return incoherent(`mode bytes ${JSON.stringify(modeBytes)} are not an exact governed mode`);
}

/** Read the real committed control state from disk. */
function committedControlState(): CommittedControlState {
  const modeBytes = readFileSync(
    path.join(process.cwd(), CONTROL_STATE_ROOT, "workflow-mode.txt"),
    "utf8",
  );
  const authorization = JSON.parse(
    readFileSync(
      path.join(process.cwd(), CONTROL_STATE_ROOT, "execute-authorization.json"),
      "utf8",
    ),
  ) as { status: string; reviewedImplementationSha: string | null };
  return classifyControlState(
    modeBytes,
    authorization.status,
    authorization.reviewedImplementationSha,
  );
}

const OCR_ROUTES = [
  extractLabelEvidenceDetailed,
  acquireProductionBrandEvidence,
  writeSealedEvidencePackage,
];

function withMode<T>(mode: string | undefined, body: () => T): T {
  const previous = process.env.ISSUE_149_MODE;
  if (mode === undefined) delete process.env.ISSUE_149_MODE;
  else process.env.ISSUE_149_MODE = mode;
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env.ISSUE_149_MODE;
    else process.env.ISSUE_149_MODE = previous;
  }
}

describe("Issue #149 discover mode halts before any acquisition route", () => {
  it("invokes NONE of the acquisition, extractor or writer routes in discover", async () => {
    for (const route of OCR_ROUTES) vi.mocked(route).mockReset();
    vi.mocked(runRuntimeDiscovery).mockResolvedValue({
      reportVersion: "issue-149-runtime-discovery-v1",
      mode: "discover",
      ok: true,
      ocrEngineInvoked: false,
      acquisitionApiInvoked: false,
      sealedEvidenceWritten: false,
      outputFilesCreated: 0,
      platform: {},
      findings: [],
      experimentControlledFiles: [],
      mounts: [],
      probedWritablePaths: [],
      unavoidableWritablePseudoFilesystems: [],
      bundleFiles: [],
      stagedImages: [],
    });
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const code = await withMode("discover", () => main());

    expect(code).toBe(0);
    expect(runRuntimeDiscovery).toHaveBeenCalledTimes(1);
    // The halt, asserted on the real call graph.
    expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    expect(acquireProductionBrandEvidence).not.toHaveBeenCalled();
    expect(writeSealedEvidencePackage).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it("reports a failing discovery as a nonzero exit, not a pass", async () => {
    vi.mocked(runRuntimeDiscovery).mockResolvedValue({
      reportVersion: "issue-149-runtime-discovery-v1",
      mode: "discover",
      ok: false,
      ocrEngineInvoked: false,
      acquisitionApiInvoked: false,
      sealedEvidenceWritten: false,
      outputFilesCreated: 0,
      platform: {},
      findings: [{ check: "network-unavailable", ok: false, detail: "CONNECTED" }],
      experimentControlledFiles: [],
      mounts: [],
      probedWritablePaths: [],
      unavoidableWritablePseudoFilesystems: [],
      bundleFiles: [],
      stagedImages: [],
    });
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    expect(await withMode("discover", () => main())).toBe(1);
    write.mockRestore();
  });

  it("does nothing at all in complete mode", async () => {
    for (const route of OCR_ROUTES) vi.mocked(route).mockReset();
    vi.mocked(runRuntimeDiscovery).mockReset();
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    expect(await withMode("complete", () => main())).toBe(0);

    expect(runRuntimeDiscovery).not.toHaveBeenCalled();
    for (const route of OCR_ROUTES) expect(route).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it("refuses an absent, empty or unrecognised mode rather than defaulting", () => {
    // Defaulting to discover would be the friendlier failure and the wrong one:
    // a mode the runner invented is not the committed mode.
    for (const bad of [undefined, "", "  ", "DISCOVER", "execute-please", "run"]) {
      expect(() => withMode(bad, () => resolveRunnerMode(process.env))).toThrow(
        /ISSUE_149_MODE must be exactly/,
      );
    }
    expect(withMode("discover", () => resolveRunnerMode(process.env))).toBe("discover");
    expect(withMode("execute", () => resolveRunnerMode(process.env))).toBe("execute");
    expect(withMode("complete", () => resolveRunnerMode(process.env))).toBe("complete");
    expect(declaredModeMarker("discover")).toBe("ISSUE_149_RUNNER_MODE=discover");
  });

  it("commits a COHERENT control state, whichever state it is in", () => {
    const committed = committedControlState();
    expect(committed.reason).toBeNull();
    expect(committed.coherent).toBe(true);
    expect(["discover", "execute", "complete"]).toContain(committed.state);
  });

  it("accepts each governed state and rejects every incoherent pairing", () => {
    const SHA = "a".repeat(40);
    // The three governed states.
    expect(classifyControlState("discover\n", "EXECUTE_NOT_AUTHORIZED", null).state).toBe(
      "discover",
    );
    expect(classifyControlState("execute\n", "EXECUTE_AUTHORIZED", SHA).state).toBe("execute");
    expect(classifyControlState("complete\n", "EXECUTE_AUTHORIZED", SHA).state).toBe("complete");

    // Every incoherent pairing.
    const incoherent: Array<[string, string, string | null]> = [
      ["discover\n", "EXECUTE_AUTHORIZED", SHA],
      ["discover\n", "EXECUTE_NOT_AUTHORIZED", SHA],
      ["execute\n", "EXECUTE_NOT_AUTHORIZED", null],
      ["execute\n", "EXECUTE_AUTHORIZED", null],
      ["execute\n", "EXECUTE_AUTHORIZED", "abc"],
      ["execute\n", "EXECUTE_AUTHORIZED", "A".repeat(40)],
      ["complete\n", "EXECUTE_AUTHORIZED", null],
      ["complete\n", "EXECUTE_NOT_AUTHORIZED", SHA],
      // Non-exact mode bytes. No trimming is permitted.
      ["discover", "EXECUTE_NOT_AUTHORIZED", null],
      [" discover\n", "EXECUTE_NOT_AUTHORIZED", null],
      ["discover\n\n", "EXECUTE_NOT_AUTHORIZED", null],
      ["execute\r\n", "EXECUTE_AUTHORIZED", SHA],
      ["EXECUTE\n", "EXECUTE_AUTHORIZED", SHA],
    ];
    for (const [mode, status, sha] of incoherent) {
      const verdict = classifyControlState(mode, status, sha);
      expect(
        verdict.coherent,
        `${JSON.stringify(mode)} + ${status} + ${sha} must be incoherent`,
      ).toBe(false);
      expect(typeof verdict.reason).toBe("string");
    }
  });

  it("gates OCR on the mode file and the transition gate", async () => {
    const { readFileSync } = await import("node:fs");
    const workflow = readFileSync(
      ".github/workflows/issue-149-brand-evidence-acquisition.yml",
      "utf8",
    );
    // The frozen transport.
    expect(workflow).toContain(
      "branches:\n      - research/issue-149-brand-complete-evidence-acquisition",
    );
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("harness revision: 18");
    for (const forbidden of [
      "schedule:",
      "pull_request_target:",
      "repository_dispatch:",
      "contents: write",
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
    // The OCR job is reachable only through the exact execute mode.
    expect(workflow).toContain("if: needs.resolve-mode.outputs.mode == 'execute'");
    expect(workflow).toContain("if: needs.resolve-mode.outputs.mode == 'discover'");
    // …and cannot start unless the execute-transition gate job succeeded.
    expect(workflow).toContain("needs: [resolve-mode, execute-transition-gate, job-a-prepare]");
    // The OCR job is gated on the transition gate whatever the committed state
    // is. Asserting the current authorization value here would pin the
    // pre-transition state into a test about the workflow's structure.
    const committed = committedControlState();
    expect(committed.coherent, committed.reason ?? "").toBe(true);
    if (committed.state === "discover") {
      expect(committed.status).toBe("EXECUTE_NOT_AUTHORIZED");
    } else {
      expect(committed.status).toBe("EXECUTE_AUTHORIZED");
    }
  });
});
