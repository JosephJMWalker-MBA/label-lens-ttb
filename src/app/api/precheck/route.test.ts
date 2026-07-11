// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
