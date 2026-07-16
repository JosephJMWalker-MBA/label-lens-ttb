// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseJsonExport } from "@/pipeline/export/json/parse-json-export";
import { resolveLangPath } from "@/pipeline/extractor/ocr-engine";

import { runPrecheckService } from "./precheck-service";
import { getExecutableProvenance, resetExecutableProvenanceCache } from "./runtime-provenance";

const FIXTURE = join(
  process.cwd(),
  "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
);
const OCR_TIMEOUT = 120_000;

function committedTrainedDataSha(): string {
  const bytes = readFileSync(join(resolveLangPath(), "eng.traineddata"));
  return createHash("sha256").update(bytes).digest("hex");
}

afterEach(() => {
  delete process.env.LABEL_LENS_BUILD_COMMIT;
  delete process.env.RENDER_GIT_COMMIT;
  resetExecutableProvenanceCache();
});

describe("getExecutableProvenance — one canonical source", () => {
  it("records the OCR model digest of the actually vendored eng.traineddata", async () => {
    resetExecutableProvenanceCache();
    const prov = await getExecutableProvenance();
    expect(prov.ocrEngine.kind).toBe("ocr");
    if (prov.ocrEngine.kind === "ocr") {
      expect(prov.ocrEngine.modelId).toBe("eng");
      expect(prov.ocrEngine.modelSha256).toBe(committedTrainedDataSha());
    }
    expect(prov.rules.length).toBe(6);
    expect(prov.authorities.length).toBeGreaterThan(0);
  });

  it("is deterministic for identical executable inputs (no clock, no random id)", async () => {
    resetExecutableProvenanceCache();
    const a = await getExecutableProvenance();
    const b = await getExecutableProvenance();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("labels the development fallback honestly and never fakes a deployed commit", async () => {
    delete process.env.LABEL_LENS_BUILD_COMMIT;
    delete process.env.RENDER_GIT_COMMIT;
    resetExecutableProvenanceCache();
    const dev = await getExecutableProvenance();
    expect(dev.applicationBuild.gitCommitSha).toBeUndefined();
    expect(dev.applicationBuild.commitProvenance).toBe("unavailable-development-fallback");
  });

  it("prefers LABEL_LENS_BUILD_COMMIT over RENDER_GIT_COMMIT when both are set", async () => {
    process.env.LABEL_LENS_BUILD_COMMIT = "deadbeefcafef00d";
    process.env.RENDER_GIT_COMMIT = "feedface12345678";
    resetExecutableProvenanceCache();
    const built = await getExecutableProvenance();
    expect(built.applicationBuild.gitCommitSha).toBe("deadbeefcafef00d");
    expect(built.applicationBuild.commitProvenance).toBe("build-environment");
  });

  it("uses RENDER_GIT_COMMIT when the explicit override is absent", async () => {
    delete process.env.LABEL_LENS_BUILD_COMMIT;
    process.env.RENDER_GIT_COMMIT = "feedface12345678";
    resetExecutableProvenanceCache();
    const built = await getExecutableProvenance();
    expect(built.applicationBuild.gitCommitSha).toBe("feedface12345678");
    expect(built.applicationBuild.commitProvenance).toBe("build-environment");
  });

  it("ignores whitespace-only commit variables", async () => {
    process.env.LABEL_LENS_BUILD_COMMIT = "   ";
    process.env.RENDER_GIT_COMMIT = "\n\t ";
    resetExecutableProvenanceCache();
    const built = await getExecutableProvenance();
    expect(built.applicationBuild.gitCommitSha).toBeUndefined();
    expect(built.applicationBuild.commitProvenance).toBe("unavailable-development-fallback");
  });

  it("re-reads the commit source only after the provenance cache is reset", async () => {
    process.env.LABEL_LENS_BUILD_COMMIT = "deadbeefcafef00d";
    const initial = await getExecutableProvenance();
    expect(initial.applicationBuild.gitCommitSha).toBe("deadbeefcafef00d");

    delete process.env.LABEL_LENS_BUILD_COMMIT;
    process.env.RENDER_GIT_COMMIT = "feedface12345678";
    const cached = await getExecutableProvenance();
    expect(cached.applicationBuild.gitCommitSha).toBe("deadbeefcafef00d");
    expect(JSON.stringify(cached)).toBe(JSON.stringify(initial));

    resetExecutableProvenanceCache();
    const refreshed = await getExecutableProvenance();
    expect(refreshed.applicationBuild.gitCommitSha).toBe("feedface12345678");
    expect(refreshed.applicationBuild.commitProvenance).toBe("build-environment");
  });
});

describe("runPrecheckService provenance (real OCR)", () => {
  it(
    "records source == derivative == uploaded-byte SHA with distinct roles, and one model identity across layers",
    async () => {
      const bytes = new Uint8Array(readFileSync(FIXTURE));
      const uploadedSha = createHash("sha256").update(bytes).digest("hex");

      const out = await runPrecheckService({
        source: "upload",
        imageBytes: bytes,
        filename: "label.jpeg",
        mediaType: "image/jpeg",
        declaredBrand: "M CELLARS",
        declaredAlcohol: "12.5",
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;

      const parsed = parseJsonExport(out.value.exportJson);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const manifest = parsed.value.versionManifest;

      // Source and derivative are the same bytes, recorded in both roles.
      expect(manifest.sourceArtifactSha256).toBe(uploadedSha);
      expect(manifest.sanitizedDerivativeSha256).toBe(uploadedSha);
      expect(manifest.derivativeRelationship).toBe("same_bytes");
      // Roles stay distinct fields (not collapsed to one).
      expect(Object.keys(manifest)).toEqual(
        expect.arrayContaining(["sourceArtifactSha256", "sanitizedDerivativeSha256"]),
      );

      // One OCR model identity across analyzer, manifest, and the committed file.
      const committed = committedTrainedDataSha();
      const analyzerOcr = parsed.value.observations.provenance.ocrEngine;
      const manifestOcr = manifest.ocrEngine;
      expect(analyzerOcr.kind).toBe("ocr");
      expect(manifestOcr.kind).toBe("ocr");
      if (analyzerOcr.kind === "ocr" && manifestOcr.kind === "ocr") {
        expect(analyzerOcr.modelSha256).toBe(committed);
        expect(manifestOcr.modelSha256).toBe(committed);
      }

      // The readable report carries the same concise provenance.
      expect(out.value.report.html).toContain(uploadedSha);
      expect(out.value.report.html).toContain(committed);
      expect(out.value.report.html).toMatch(/same_bytes/);
    },
    OCR_TIMEOUT,
  );
});
