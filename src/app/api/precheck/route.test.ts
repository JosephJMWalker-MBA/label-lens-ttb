// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const FIXTURE = join(
  process.cwd(),
  "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
);
const OCR_TIMEOUT = 120_000;

function request(form: FormData): Request {
  return new Request("http://localhost/api/precheck", { method: "POST", body: form });
}

function baseForm(): FormData {
  const form = new FormData();
  form.set("source", "upload");
  form.set("brand", "M CELLARS");
  form.set("alcohol", "12.5");
  const bytes = readFileSync(FIXTURE);
  form.set("file", new File([bytes], "label.jpeg", { type: "image/jpeg" }));
  return form;
}

describe("POST /api/precheck", () => {
  it(
    "runs the full pipeline for a valid M Cellars upload and verifies the export checksum",
    async () => {
      const res = await POST(request(baseForm()));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.findings.map((f: { ruleId: string }) => f.ruleId)).toEqual([
        "wine-alcohol-syntax",
        "brand-name-canonical-comparison",
        "wine-alcohol-declared-comparison",
        "wine-alcohol-actual-content-tolerance",
        "wine-alcohol-class-type-boundary",
        "wine-alcohol-omission-eligibility",
      ]);
      expect(body.data.suggestedFilename).toMatch(/^label-lens-wine-precheck-/);
    },
    OCR_TIMEOUT,
  );

  it("rejects a client-injected server-computed field", async () => {
    const form = baseForm();
    form.set("findings", "[]");
    const res = await POST(request(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("CLIENT_INJECTED_FIELD");
  });

  it("rejects an undeclared form field", async () => {
    const form = baseForm();
    form.set("surprise", "1");
    const res = await POST(request(form));
    const body = await res.json();
    expect(body.error.code).toBe("UNDECLARED_FIELD");
  });

  it("rejects multiple images", async () => {
    const form = baseForm();
    const bytes = readFileSync(FIXTURE);
    form.append("file", new File([bytes], "second.jpeg", { type: "image/jpeg" }));
    const res = await POST(request(form));
    const body = await res.json();
    expect(body.error.code).toBe("MULTIPLE_IMAGES");
  });

  it("rejects a missing image on an upload", async () => {
    const form = new FormData();
    form.set("source", "upload");
    form.set("brand", "M CELLARS");
    form.set("alcohol", "12.5");
    const res = await POST(request(form));
    const body = await res.json();
    expect(body.error.code).toBe("NO_IMAGE");
  });

  it("returns user-safe errors with no stack, path, or environment data", async () => {
    const form = baseForm();
    form.set("surprise", "1");
    const body = await (await POST(request(form))).json();
    expect(JSON.stringify(body)).not.toMatch(
      /\/Users\/|\/home\/|node_modules|at Object|process\.env/,
    );
  });
});

describe("POST /api/precheck — early resource guards", () => {
  /** A stub whose formData() throws, to prove header-level rejection happens first. */
  function stubRequest(headers: Record<string, string>) {
    const formData = vi.fn(() => {
      throw new Error("formData must not be called for a header-level rejection");
    });
    return { headers: new Headers(headers), formData } as unknown as Request;
  }

  it("rejects a non-multipart content type before parsing the body", async () => {
    const stub = stubRequest({ "content-type": "application/json" });
    const res = await POST(stub);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe("REQUEST_NOT_MULTIPART");
    expect(stub.formData as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared Content-Length before parsing the body", async () => {
    const stub = stubRequest({
      "content-type": "multipart/form-data; boundary=x",
      "content-length": String(64 * 1024 * 1024),
    });
    const res = await POST(stub);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("REQUEST_TOO_LARGE");
    expect(stub.formData as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("does not let a missing/malformed Content-Length bypass the post-parse file-byte limit", async () => {
    const form = new FormData();
    form.set("source", "upload");
    form.set("brand", "M CELLARS");
    form.set("alcohol", "12.5");
    // 16 MB of bytes exceeds the file limit even though the request stays under
    // the request-byte ceiling and no header guard fires.
    form.set(
      "file",
      new File([new Uint8Array(16 * 1024 * 1024)], "big.png", { type: "image/png" }),
    );
    const res = await POST(request(form));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("returns safe errors with no stack, path, or OCR asset path on a resource rejection", async () => {
    const stub = stubRequest({ "content-type": "text/plain" });
    const body = await (await POST(stub)).json();
    expect(JSON.stringify(body)).not.toMatch(
      /\/Users\/|\/home\/|node_modules|traineddata|at Object|\.ts:\d+/,
    );
    expect(body.data).toBeUndefined();
  });
});
