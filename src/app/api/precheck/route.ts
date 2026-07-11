import { runPrecheckService } from "@/server/precheck-service";
import type { PrecheckServiceError, PrecheckServiceRequest } from "@/server/precheck-service.types";
import { MAX_REQUEST_BYTES } from "@/server/resource-policy";

// Node runtime is required for sharp, tesseract.js, and the vendored assets.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = new Set(["source", "file", "brand", "alcohol"]);
const INJECTION_FIELDS = new Set([
  "findings",
  "status",
  "observations",
  "evidencestatus",
  "ruleversion",
  "profileversion",
  "authority",
  "machineresultid",
  "checksum",
  "sha256",
  "integrity",
]);

const STATUS_BY_CODE: Record<PrecheckServiceError["code"], number> = {
  NO_IMAGE: 400,
  MULTIPLE_IMAGES: 400,
  UNSUPPORTED_TYPE: 415,
  EMPTY_FILE: 400,
  FILE_TOO_LARGE: 413,
  CORRUPT_IMAGE: 422,
  INVALID_DECLARED_VALUE: 400,
  UNDECLARED_FIELD: 400,
  UNSAFE_FILENAME: 400,
  CLIENT_INJECTED_FIELD: 400,
  EXTRACTION_FAILED: 422,
  PROFILE_MISMATCH: 409,
  ASSEMBLY_FAILED: 422,
  EXPORT_CHECKSUM_FAILED: 500,
  SAMPLE_UNAVAILABLE: 404,
  // Disposition-append codes never arise on this route, but the map is total.
  INVALID_SUBMITTED_RESULT: 422,
  INVALID_DISPOSITION: 400,
  INVALID_DISPOSITION_REFERENCE: 400,
  REPORT_FAILED: 500,
  // Bounded resource-control failures.
  REQUEST_TOO_LARGE: 413,
  REQUEST_NOT_MULTIPART: 415,
  IMAGE_DIMENSIONS_EXCEEDED: 422,
  IMAGE_PIXEL_BUDGET_EXCEEDED: 422,
  MULTI_FRAME_IMAGE_UNSUPPORTED: 422,
};

function errorResponse(code: PrecheckServiceError["code"], message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status: STATUS_BY_CODE[code] });
}

/**
 * The single server boundary for the wine pre-check. It parses one bounded
 * multipart request, rejects undeclared and client-injected fields, and returns
 * only render-safe data. No stack traces, paths, or environment values leak.
 */
export async function POST(request: Request): Promise<Response> {
  // Earliest guards, before any body buffering. A declared Content-Length above
  // the request limit is rejected without calling formData(); a non-multipart
  // request is refused before parsing. When the header is absent or false, the
  // post-buffer file-byte guard in the service still applies.
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return errorResponse("REQUEST_TOO_LARGE", "The request is larger than the allowed size.");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return errorResponse("REQUEST_NOT_MULTIPART", "Send the label image as multipart form data.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("NO_IMAGE", "Send the label image and declared values as form data.");
  }

  for (const key of new Set(form.keys())) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (INJECTION_FIELDS.has(normalized)) {
      return errorResponse(
        "CLIENT_INJECTED_FIELD",
        "Server-computed fields may not be supplied by the client.",
      );
    }
    if (!ALLOWED_FIELDS.has(key)) {
      return errorResponse("UNDECLARED_FIELD", "The request contains an unexpected field.");
    }
  }

  const source = form.get("source") === "sample" ? "sample" : "upload";
  const brand = typeof form.get("brand") === "string" ? (form.get("brand") as string) : "";
  const alcohol = typeof form.get("alcohol") === "string" ? (form.get("alcohol") as string) : "";

  const serviceRequest: PrecheckServiceRequest = {
    source,
    declaredBrand: brand,
    declaredAlcohol: alcohol,
  };

  if (source === "upload") {
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) return errorResponse("NO_IMAGE", "Select one label image.");
    if (files.length > 1)
      return errorResponse("MULTIPLE_IMAGES", "Select exactly one label image.");
    const file = files[0];
    serviceRequest.imageBytes = new Uint8Array(await file.arrayBuffer());
    serviceRequest.mediaType = file.type;
    serviceRequest.filename = file.name;
  }

  const result = await runPrecheckService(serviceRequest);
  if (!result.ok) return errorResponse(result.error.code, result.error.message);

  return Response.json({ ok: true, data: result.value }, { status: 200 });
}
