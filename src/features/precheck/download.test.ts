import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OBJECT_URL_REVOKE_DELAY_MS, triggerDownload } from "./download";

/**
 * Unit coverage for the client download helper. jsdom provides `document`,
 * `Blob`, and `setTimeout`; `URL.createObjectURL`/`revokeObjectURL` are stubbed
 * so we can observe object-URL lifecycle and timing precisely.
 */

interface CapturedBlob {
  text: string;
  type: string;
}

let blobs: CapturedBlob[];
let urls: string[];
let revoked: string[];
let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  blobs = [];
  urls = [];
  revoked = [];
  // jsdom's Blob does not implement .text(); capture the constructor input so we
  // can assert exact content and type without relying on Blob body methods.
  const RealBlob = globalThis.Blob;
  vi.stubGlobal(
    "Blob",
    class extends RealBlob {
      constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
        super(parts, options);
        blobs.push({ text: (parts as string[]).join(""), type: options?.type ?? "" });
      }
    },
  );
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => {
      const u = `blob:test-${urls.length}`;
      urls.push(u);
      return u;
    }),
    revokeObjectURL: vi.fn((u: string) => revoked.push(u)),
  });
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function anchorsWithDownload(): number {
  return document.querySelectorAll("a[download]").length;
}

describe("triggerDownload — blob, filename, and content", () => {
  it("uses the JSON MIME type and preserves exact content", () => {
    const payload = '{"exportType":"wine-precheck-result","integrity":{"value":"abc"}}';
    triggerDownload({ content: payload, filename: "result.json", mimeType: "application/json" });
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe("application/json");
    expect(blobs[0].text).toBe(payload);
  });

  it("uses an HTML UTF-8 MIME type and preserves exact content", () => {
    const html = "<!doctype html><html><body>Réport — café</body></html>";
    triggerDownload({
      content: html,
      filename: "report.html",
      mimeType: "text/html;charset=utf-8",
    });
    expect(blobs[0].type).toBe("text/html;charset=utf-8");
    // Exact content preserved (multibyte characters intact).
    expect(blobs[0].text).toBe(html);
  });

  it("propagates the exact filename to the anchor download attribute", () => {
    const seen: string[] = [];
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      seen.push(this.download);
    });
    triggerDownload({
      content: "x",
      filename: "label-lens-abc.json",
      mimeType: "application/json",
    });
    expect(seen).toEqual(["label-lens-abc.json"]);
  });
});

describe("triggerDownload — anchor dispatch and cleanup", () => {
  it("dispatches a click and removes the temporary anchor", () => {
    triggerDownload({ content: "x", filename: "a.json", mimeType: "application/json" });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(anchorsWithDownload()).toBe(0); // no detached/lingering anchor
  });

  it("revokes the object URL only after a delay, not synchronously", () => {
    vi.useFakeTimers();
    triggerDownload({ content: "x", filename: "a.json", mimeType: "application/json" });
    expect(revoked).toEqual([]); // still valid immediately after the click
    vi.advanceTimersByTime(OBJECT_URL_REVOKE_DELAY_MS);
    expect(revoked).toEqual([urls[0]]);
  });

  it("handles repeated downloads without leaking URLs or anchors", () => {
    vi.useFakeTimers();
    triggerDownload({ content: "1", filename: "a.json", mimeType: "application/json" });
    triggerDownload({ content: "2", filename: "b.html", mimeType: "text/html;charset=utf-8" });
    expect(urls).toHaveLength(2);
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(anchorsWithDownload()).toBe(0);
    vi.advanceTimersByTime(OBJECT_URL_REVOKE_DELAY_MS);
    expect(revoked.sort()).toEqual([...urls].sort());
  });
});

describe("triggerDownload — failure handling", () => {
  it("throws and does not schedule a revoke when object URL creation fails", () => {
    (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("createObjectURL blocked");
    });
    expect(() =>
      triggerDownload({ content: "x", filename: "a.json", mimeType: "application/json" }),
    ).toThrow(/blocked/);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("throws, revokes immediately, and cleans up when the click dispatch fails", () => {
    clickSpy.mockImplementation(() => {
      throw new Error("click failed");
    });
    expect(() =>
      triggerDownload({ content: "x", filename: "a.json", mimeType: "application/json" }),
    ).toThrow(/click failed/);
    // The URL is released right away since nothing started, and no anchor lingers.
    expect(revoked).toEqual([urls[0]]);
    expect(anchorsWithDownload()).toBe(0);
  });
});
