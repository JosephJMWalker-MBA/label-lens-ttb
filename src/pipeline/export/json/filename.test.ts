import { describe, expect, it } from "vitest";

import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";

import { buildJsonExport } from "./build-json-export";
import { suggestedExportFilename } from "./filename";
import type { PrecheckJsonExport } from "./json-export.types";

function exportObject(): PrecheckJsonExport {
  const r = assemblePrecheckResult(buildAssembleInput());
  if (!r.ok) throw new Error("assembly failed");
  const e = buildJsonExport(r.value);
  if (!e.ok) throw new Error("export failed");
  return e.value;
}

describe("suggestedExportFilename", () => {
  it("is deterministic and contains the machine-result identity", () => {
    const e = exportObject();
    const a = suggestedExportFilename(e);
    const b = suggestedExportFilename(e);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value).toBe(b.value);
      expect(a.value).toContain(e.generatedFrom.machineResultId);
      expect(a.value).toBe(`label-lens-wine-precheck-${e.generatedFrom.machineResultId}.json`);
    }
  });

  it("contains no slashes, traversal, whitespace, or absolute path", () => {
    const out = suggestedExportFilename(exportObject());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value).not.toMatch(/[\\/]/);
      expect(out.value).not.toContain("..");
      expect(out.value).not.toMatch(/\s/);
      expect(out.value.startsWith("/")).toBe(false);
      // No date/time digits beyond the fixed hex identity pattern.
      expect(out.value).toMatch(
        /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.json$/,
      );
    }
  });

  it("rejects an invalid machine-result identity", () => {
    const e = exportObject();
    const bad = { ...e, generatedFrom: { ...e.generatedFrom, machineResultId: "../etc/passwd" } };
    const out = suggestedExportFilename(bad);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_FILENAME_IDENTITY");
  });
});
