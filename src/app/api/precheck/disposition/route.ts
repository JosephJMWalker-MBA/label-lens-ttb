import { appendDispositionToResult } from "@/server/precheck-service";
import type {
  PrecheckDispositionRequest,
  PrecheckServiceError,
} from "@/server/precheck-service.types";
import { RESULT_DISPOSITION_DECISIONS } from "@/pipeline/result/result.types";

// Node runtime is required because rebuilding the checksum uses node:crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_BY_CODE: Partial<Record<PrecheckServiceError["code"], number>> = {
  INVALID_SUBMITTED_RESULT: 422,
  STALE_SUBMITTED_RESULT: 409,
  INVALID_DISPOSITION: 400,
  INVALID_DISPOSITION_REFERENCE: 400,
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

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === "string");
  return strings.length > 0 ? strings : undefined;
}

/**
 * Append one operator disposition to a previously returned, validated result.
 *
 * The client submits the canonical JSON export it received; the server
 * re-validates it and never trusts client-supplied findings, observations,
 * manifests, or the machine-result id. `recordedAt` is generated here, at the
 * workflow boundary — never inside deterministic machine-result assembly.
 */
export async function POST(request: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return errorResponse("INVALID_DISPOSITION", "Send a JSON disposition request.");
  }
  // Reject null, arrays, and JSON primitives before touching any field, so a
  // non-object body can never dereference into an uncaught TypeError.
  if (!isPlainObject(parsed)) {
    return errorResponse("INVALID_DISPOSITION", "Send a JSON disposition object.");
  }
  const body = parsed;

  const decision = asString(body.decision);
  if (!RESULT_DISPOSITION_DECISIONS.includes(decision as never)) {
    return errorResponse("INVALID_DISPOSITION", "Select a supported internal-workflow decision.");
  }

  const references = {
    ...(asOptionalStringArray((body.references as Record<string, unknown>)?.ruleIds)
      ? { ruleIds: asOptionalStringArray((body.references as Record<string, unknown>).ruleIds) }
      : {}),
    ...(asOptionalStringArray((body.references as Record<string, unknown>)?.checkIds)
      ? { checkIds: asOptionalStringArray((body.references as Record<string, unknown>).checkIds) }
      : {}),
  };

  const fileIn = (body.file as Record<string, unknown>) ?? {};
  const serviceRequest: PrecheckDispositionRequest = {
    exportJson: asString(body.exportJson),
    appendToken: asString(body.appendToken),
    actorId: asString(body.actorId),
    decision: decision as PrecheckDispositionRequest["decision"],
    reasonCode: asString(body.reasonCode),
    ...(asString(body.note).trim() !== "" ? { note: asString(body.note) } : {}),
    ...(references.ruleIds || references.checkIds ? { references } : {}),
    // Human-action metadata generated at the workflow boundary, not by the client.
    recordedAt: new Date().toISOString(),
    file: {
      displayName: asString(fileIn.displayName) || "label image",
      mediaType: asString(fileIn.mediaType) || "image/jpeg",
      byteSize: typeof fileIn.byteSize === "number" ? fileIn.byteSize : 0,
      source: fileIn.source === "sample" ? "sample" : "upload",
    },
  };

  const result = appendDispositionToResult(serviceRequest);
  if (!result.ok) return errorResponse(result.error.code, result.error.message);

  return Response.json({ ok: true, data: result.value }, { status: 200 });
}
