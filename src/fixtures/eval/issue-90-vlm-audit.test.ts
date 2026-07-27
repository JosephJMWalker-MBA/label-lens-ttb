// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveLocalVlmConfig } from "./vision-observer/local-vlm/llama-server-config";

const ROOT = process.cwd();
const PRODUCTION_SURFACES = [
  "src/app/api/package/analyze/route.ts",
  "src/pipeline/extractor/extractor.ts",
  "src/pipeline/extractor/extractor.types.ts",
  "src/pipeline/analyzer/analyzer.types.ts",
  "src/features/package-preparation/package-model.ts",
  "src/features/package-preparation/PackagePreparationWorkspace.tsx",
  "src/features/package-preparation/ReviewWorkspaceContainer.tsx",
  "src/features/package-preparation/AgentReviewSubmissionDock.tsx",
  "src/features/package-preparation/agent-submission-contract.ts",
] as const;

const VLM_BOUNDARY_TOKENS =
  /vision-observer|local-vlm|LLAMA_SERVER|VLM_|VisionObserver|CanonicalRegionProposal|observerProposals|ocrHandoff|ocrInspectionRegion/i;

function readProjectFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const projectPath = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(projectPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [projectPath] : [];
  });
}

describe("issue 90 VLM production influence audit", () => {
  it("keeps package analysis and persistence/UI contracts free of observer inputs and outputs", () => {
    for (const file of PRODUCTION_SURFACES) {
      expect(readProjectFile(file), file).not.toMatch(VLM_BOUNDARY_TOKENS);
    }
  });

  it("routes package analysis directly through the OCR extractor without an observer hook", () => {
    const route = readProjectFile("src/app/api/package/analyze/route.ts");
    expect(route).toMatch(/extractLabelEvidenceDetailed\(input\)/);
    expect(route).toMatch(/selectGovernmentWarningObservation/);
    expect(route).not.toMatch(/runVisionObserverLifecycle|LlamaServerVisionObserverAdapter/);

    const extractorTypes = readProjectFile("src/pipeline/extractor/extractor.types.ts");
    const extractionInput = extractorTypes.slice(
      extractorTypes.indexOf("export interface ExtractionInput"),
      extractorTypes.indexOf("export type SellerRegionTargetCategoryId"),
    );
    expect(extractionInput).toMatch(/sellerRegionTargets\?: SellerRegionOcrTarget\[\]/);
    expect(extractionInput).not.toMatch(VLM_BOUNDARY_TOKENS);
  });

  it("does not consume canonical observer proposals in production OCR or selection", () => {
    const consumers = sourceFiles("src")
      .filter((file) => !file.startsWith("src/fixtures/eval/"))
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) =>
        /CanonicalRegionProposal|ocrHandoff|ocrInspectionRegion/.test(readProjectFile(file)),
      );

    expect(consumers.map((file) => relative(ROOT, join(ROOT, file)))).toEqual([]);
  });

  it("keeps fake observers confined to evaluation fixtures and tests", () => {
    const fakeObserverFiles = sourceFiles("src").filter((file) =>
      /FakeVisionObserverAdapter|fake observer|fake-server/i.test(readProjectFile(file)),
    );

    expect(fakeObserverFiles.every((file) => file.startsWith("src/fixtures/eval/"))).toBe(true);
  });

  it("fails closed when local VLM configuration is absent", async () => {
    const result = await resolveLocalVlmConfig({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_CONFIG");
      expect(result.error.issues.join(" ")).toMatch(/LLAMA_SERVER_BIN/);
      expect(result.error.issues.join(" ")).toMatch(/VLM_MODEL_PATH/);
    }
  });

  it("does not allow VLM text fields in package findings or export contracts", () => {
    const packageModel = readProjectFile("src/features/package-preparation/package-model.ts");
    const findingAndExportContracts = [
      "PackageCategoryAnalysis",
      "PackagePanelMachineRun",
      "PackageAnalysisRun",
      "PackageExportPayload",
    ].map((symbol) => {
      const start = packageModel.indexOf(`export interface ${symbol}`);
      const next = packageModel.indexOf("\nexport ", start + 1);
      return packageModel.slice(start, next === -1 ? undefined : next);
    });

    expect(findingAndExportContracts.join("\n")).not.toMatch(VLM_BOUNDARY_TOKENS);
    expect(findingAndExportContracts.join("\n")).not.toMatch(
      /reasonCodes|description|rawResponse/i,
    );
  });
});
