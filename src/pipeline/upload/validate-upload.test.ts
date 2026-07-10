import { describe, expect, it } from "vitest";

import { MAX_UPLOAD_BYTES, validateUpload } from "./validate-upload";

const png = { name: "label.png", type: "image/png", size: 1_024 };

describe("validateUpload", () => {
  it("accepts a supported image within the size limit", () => {
    const result = validateUpload(png);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("image/png");
    }
  });

  it("rejects an empty file", () => {
    const result = validateUpload({ ...png, size: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("EMPTY_FILE");
    }
  });

  it("rejects an unsupported type with a readable message", () => {
    const result = validateUpload({ name: "label.pdf", type: "application/pdf", size: 2_048 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED_TYPE");
      expect(result.error.message).toMatch(/png, jpeg, or webp/i);
    }
  });

  it("rejects a file over the size limit", () => {
    const result = validateUpload({ ...png, size: MAX_UPLOAD_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_TOO_LARGE");
    }
  });
});
