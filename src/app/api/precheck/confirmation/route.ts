import { appendFieldConfirmationToResult } from "@/server/precheck-service";
import type {
  PrecheckFieldConfirmationRequest,
  PrecheckServiceError,
} from "@/server/precheck-service.types";
import {
  HUMAN_FIELD_CONFIRMATION_DECISION_TYPES,
  REVIEWABLE_FIELD_IDS,
} from "@/pipeline/result/result.types";
import type { HumanFieldGeometry } from "@/pipeline/result/result.types";

// Node runtime is required because rebuilding the checksum uses node:crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_BY_CODE: Partial<Record<PrecheckServiceError["code"], number>> = {
  INVALID_SUBMITTED_RESULT: 422,
  INVALID_FIELD_CONFIRMATION: 400,
  MISSING_APPEND_TOKEN: 401,
  INVALID_APPEND_TOKEN: 403,
  APPEND_SIGNING_KEY_UNAVAILABLE: 500,
  EXPORT_CHECKSUM_FAILED: 500,
  REPORT_FAILED: 500,
};

/** A parsed JSON body is usable only if it is a plain (non-null, non-array) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(code: PrecheckServiceError["code"], message: string): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status: STATUS_BY_CODE[code] ?? 400 },
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

/**
 * Append one human field confirmation to a previously returned, validated
 * result. The client submits the canonical JSON export it received; the server
 * re-validates it and never trusts client-supplied observations or ids.
 */
export async function POST(request: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return errorResponse("INVALID_FIELD_CONFIRMATION", "Send a JSON confirmation request.");
  }
  if (!isPlainObject(parsed)) {
    return errorResponse("INVALID_FIELD_CONFIRMATION", "Send a JSON confirmation object.");
  }
  const body = parsed;

  const decisionType = asString(body.decisionType);
  if (!HUMAN_FIELD_CONFIRMATION_DECISION_TYPES.includes(decisionType as never)) {
    return errorResponse("INVALID_FIELD_CONFIRMATION", "Select a supported confirmation action.");
  }

  const fieldId = asString(body.fieldId);
  if (!REVIEWABLE_FIELD_IDS.includes(fieldId as never)) {
    return errorResponse("INVALID_FIELD_CONFIRMATION", "Select a supported field to confirm.");
  }

  const geometryIn = isPlainObject(body.humanGeometry) ? body.humanGeometry : null;
  const humanProvenance: HumanFieldGeometry["provenance"] =
    geometryIn?.provenance === "human-confirmed-machine-region"
      ? "human-confirmed-machine-region"
      : "human-selected-region";
  const humanGeometry = geometryIn
    ? {
        unit: "normalized-image-relative" as const,
        provenance: humanProvenance,
        imageIndex: asNumber(geometryIn.imageIndex),
        x: asNumber(geometryIn.x),
        y: asNumber(geometryIn.y),
        width: asNumber(geometryIn.width),
        height: asNumber(geometryIn.height),
      }
    : undefined;

  const fileIn = (body.file as Record<string, unknown>) ?? {};
  const serviceRequest: PrecheckFieldConfirmationRequest = {
    exportJson: asString(body.exportJson),
    appendToken: asString(body.appendToken),
    fieldId: fieldId as PrecheckFieldConfirmationRequest["fieldId"],
    decisionType: decisionType as PrecheckFieldConfirmationRequest["decisionType"],
    ...(asString(body.correctedValue).trim() !== ""
      ? { correctedValue: asString(body.correctedValue) }
      : {}),
    ...(asString(body.alternateId).trim() !== ""
      ? { alternateId: asString(body.alternateId) }
      : {}),
    ...(asString(body.note).trim() !== "" ? { note: asString(body.note) } : {}),
    ...(humanGeometry !== undefined ? { humanGeometry } : {}),
    recordedAt: new Date().toISOString(),
    file: {
      displayName: asString(fileIn.displayName) || "label image",
      mediaType: asString(fileIn.mediaType) || "image/jpeg",
      byteSize: typeof fileIn.byteSize === "number" ? fileIn.byteSize : 0,
      source: fileIn.source === "sample" ? "sample" : "upload",
    },
  };

  const result = appendFieldConfirmationToResult(serviceRequest);
  if (!result.ok) return errorResponse(result.error.code, result.error.message);

  return Response.json({ ok: true, data: result.value }, { status: 200 });
}
