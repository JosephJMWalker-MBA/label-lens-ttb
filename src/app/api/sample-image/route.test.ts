import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SAMPLE_IMAGE_RELATIVE_PATH } from "@/server/sample-image";

import { GET } from "./route";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("GET /api/sample-image", () => {
  it("serves the exact bundled sample fixture bytes the pre-check analyzes", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");

    const served = new Uint8Array(await res.arrayBuffer());
    const fixture = new Uint8Array(readFileSync(join(process.cwd(), SAMPLE_IMAGE_RELATIVE_PATH)));

    // Integrity: the browser-visible preview is byte-identical to the server-side
    // bundled sample fixture (same source the sample pre-check reads).
    expect(served.byteLength).toBe(fixture.byteLength);
    expect(sha256(served)).toBe(sha256(fixture));
  });

  it("declares an accurate content-length", async () => {
    const res = await GET();
    const served = new Uint8Array(await res.arrayBuffer());
    expect(res.headers.get("content-length")).toBe(String(served.byteLength));
  });
});
