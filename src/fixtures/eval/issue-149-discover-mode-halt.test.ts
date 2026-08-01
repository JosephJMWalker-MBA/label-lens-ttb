/**
 * Issue #149 — discover mode halts before OCR.
 *
 * Non-OCR, and load-bearing: it drives the REAL runner `main()` with the
 * extractor, the acquisition API and the writer all mocked, and fails if any of
 * them is invoked. A comment saying "discover returns early" is not a control;
 * this is.
 */
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

  it("keeps the committed mode file at exactly discover", async () => {
    const { readFileSync } = await import("node:fs");
    const mode = readFileSync(
      "artifacts/issue-149-brand-complete-evidence-acquisition/workflow-mode.txt",
      "utf8",
    );
    expect(mode).toBe("discover\n");
    expect(mode.trim()).not.toBe("execute");
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
    expect(workflow).toContain("harness revision: 8");
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
    // The gate itself rejects today.
    const authorization = JSON.parse(
      readFileSync(
        "artifacts/issue-149-brand-complete-evidence-acquisition/execute-authorization.json",
        "utf8",
      ),
    ) as { status: string };
    expect(authorization.status).toBe("EXECUTE_NOT_AUTHORIZED");
  });
});
