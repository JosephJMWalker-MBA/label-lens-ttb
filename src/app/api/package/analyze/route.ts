import { createHash, randomUUID } from "node:crypto";

import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import type { ExtractionInput } from "@/pipeline/extractor/extractor.types";
import {
  createAnalysisRun,
  packagePreparationComplete,
  validNormalizedRegion,
  type PackagePanelMachineRun,
  type SellerPackageDraft,
} from "@/features/package-preparation/package-model";
import {
  WINE_PACKAGE_CATEGORY_DEFINITIONS,
  WINE_PACKAGE_PROFILE,
} from "@/features/package-preparation/package-profile";
import { getExecutableProvenance } from "@/server/runtime-provenance";
import { ALLOWED_MEDIA_TYPES, MAX_IMAGE_BYTES } from "@/server/resource-policy";
import { issueAppendToken } from "@/server/append-token";
import { validatePanelIdentityList } from "@/server/submissions/panel-identity";

export const runtime = "nodejs";

const MAX_PACKAGE_PANELS = 6;
const MAX_PACKAGE_REQUEST_BYTES = MAX_IMAGE_BYTES * MAX_PACKAGE_PANELS + 2 * 1024 * 1024;
const ALLOWED_FIELDS = new Set(["packageDraft", "file"]);

function error(code: string, message: string, status: number): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

function parseDraft(value: FormDataEntryValue | null): SellerPackageDraft | null {
  if (typeof value !== "string" || value.length > 1_000_000) return null;
  try {
    const draft = JSON.parse(value) as SellerPackageDraft;
    if (draft.schemaVersion !== "seller-package-draft.v1") return null;
    if (!draft.packageId || !Array.isArray(draft.panels) || !Array.isArray(draft.categories)) {
      return null;
    }
    if (
      draft.profile?.id !== WINE_PACKAGE_PROFILE.id ||
      draft.profile?.version !== WINE_PACKAGE_PROFILE.version
    ) {
      return null;
    }
    if (draft.panels.length < 1 || draft.panels.length > MAX_PACKAGE_PANELS) return null;
    const draftPanelIds = draft.panels.map((panel) => panel.panelId);
    if (!validatePanelIdentityList(draftPanelIds).ok) return null;
    const panelIds = new Set(draftPanelIds);
    if (panelIds.size !== draft.panels.length) return null;
    if (new Set(draft.panels.map((panel) => panel.order)).size !== draft.panels.length) return null;
    const categoryIds = draft.categories.map((category) => category.categoryId);
    const expectedCategoryIds = WINE_PACKAGE_CATEGORY_DEFINITIONS.map(
      (definition) => definition.categoryId,
    );
    if (
      categoryIds.length !== expectedCategoryIds.length ||
      categoryIds.some((categoryId) => !expectedCategoryIds.includes(categoryId))
    ) {
      return null;
    }
    if (
      !draft.categories.every((category) =>
        category.regions.every(
          (region) => validNormalizedRegion(region) && region.categoryId === category.categoryId,
        ),
      )
    )
      return null;
    if (
      !draft.categories.every((category) =>
        category.regions.every((region) => panelIds.has(region.panelId)),
      )
    ) {
      return null;
    }
    if (!packagePreparationComplete(draft, WINE_PACKAGE_CATEGORY_DEFINITIONS)) return null;
    return draft;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PACKAGE_REQUEST_BYTES) {
    return error("PACKAGE_REQUEST_TOO_LARGE", "The package is larger than this slice allows.", 413);
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("multipart/form-data")) {
    return error("PACKAGE_REQUEST_NOT_MULTIPART", "Send the package as multipart form data.", 415);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("INVALID_PACKAGE_REQUEST", "The package request could not be read.", 400);
  }
  if ([...new Set(form.keys())].some((key) => !ALLOWED_FIELDS.has(key))) {
    return error(
      "UNDECLARED_PACKAGE_FIELD",
      "The package request contains an unexpected field.",
      400,
    );
  }

  const draft = parseDraft(form.get("packageDraft"));
  if (!draft) return error("INVALID_PACKAGE_DRAFT", "The saved package draft is invalid.", 422);
  const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
  if (files.length !== draft.panels.length) {
    return error(
      "PACKAGE_PANEL_COUNT_MISMATCH",
      "Every ordered panel must include one image.",
      400,
    );
  }

  const executable = await getExecutableProvenance();
  const panelRuns: PackagePanelMachineRun[] = [];
  for (let index = 0; index < draft.panels.length; index += 1) {
    const panel = draft.panels[index];
    const file = files[index];
    if (!ALLOWED_MEDIA_TYPES.includes(file.type as (typeof ALLOWED_MEDIA_TYPES)[number])) {
      return error("UNSUPPORTED_PACKAGE_PANEL", "Every panel must be a PNG or JPEG image.", 415);
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return error("INVALID_PACKAGE_PANEL_SIZE", "A package panel is empty or too large.", 413);
    }
    if (file.size !== panel.byteSize || file.type !== panel.mediaType) {
      return error(
        "PACKAGE_PANEL_METADATA_MISMATCH",
        "A panel's file metadata no longer matches the saved draft.",
        409,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== panel.checksumSha256) {
      return error(
        "PACKAGE_PANEL_CHECKSUM_MISMATCH",
        "A panel no longer matches the saved draft.",
        409,
      );
    }

    const input: ExtractionInput = {
      imageBytes: bytes,
      artifactRef: `package-panel-${panel.panelId}`,
      derivativeSha256: sha,
      processedAt: new Date().toISOString(),
      extractionAdapterId: executable.extractionAdapterId,
      extractionAdapterVersion: executable.extractionAdapterVersion,
      ocrEngine: executable.ocrEngine,
      parserId: executable.parserId,
      parserVersion: executable.parserVersion,
    };
    const extracted = await extractLabelEvidenceDetailed(input);
    if (!extracted.ok) {
      return error(
        "PACKAGE_PANEL_EXTRACTION_FAILED",
        "A package panel could not be analyzed.",
        422,
      );
    }
    if (
      extracted.value.debug.decoded.width !== panel.width ||
      extracted.value.debug.decoded.height !== panel.height
    ) {
      return error(
        "PACKAGE_PANEL_DIMENSIONS_MISMATCH",
        "A panel's decoded dimensions no longer match the saved draft.",
        409,
      );
    }

    const observations = {
      provenance: extracted.value.response.provenance,
      brandName: extracted.value.response.fields.brandName,
      alcoholStatement: extracted.value.response.fields.alcoholStatement,
    };
    const machinePayload = {
      schemaVersion: "package-panel-machine-record.v1",
      packageId: draft.packageId,
      panel,
      sourceSha256: sha,
      observations,
      versionManifest: executable,
    };
    const machineResultId = createHash("sha256")
      .update(canonicalStringify(machinePayload))
      .digest("hex");
    const integrity = createHash("sha256").update(canonicalStringify(machinePayload)).digest("hex");

    const tokenResult = issueAppendToken(machineResultId);
    if (!tokenResult.ok) {
      return error(
        "APPEND_SIGNING_KEY_UNAVAILABLE",
        "The append-authorization service is not configured.",
        500,
      );
    }
    const appendToken = tokenResult.token;

    panelRuns.push({
      panelId: panel.panelId,
      machineResultId,
      observations,
      exportJson: canonicalStringify({
        ...machinePayload,
        appendToken,
        integrity: {
          algorithm: "sha256",
          scope: "canonical-package-panel-machine-payload",
          value: integrity,
        },
      }),
    });
  }

  const recordedAt = new Date().toISOString();
  const analysisRun = createAnalysisRun({
    draft,
    panelRuns,
    analysisRunId: `package-analysis-${randomUUID()}`,
    recordedAt,
  });
  return Response.json({ ok: true, data: { analysisRun } });
}
