/**
 * Small, reusable client download helper.
 *
 * It saves exact text (or bytes) supplied by the server response — it never
 * reconstructs content from visible fields. The object URL is revoked only after
 * a short delay, so it outlives the synchronous click task before the blob is
 * released. Revoking synchronously in the same tick as the click is a
 * standards-consistent race that can cancel the download in some browsers; that
 * race is the strongest identified cause of the reported "downloads do nothing"
 * symptom, though it was not reproduced in headless Chromium.
 *
 * Only synchronous failures are observable here: if the object URL cannot be
 * created or the click throws, this throws so the caller can surface an
 * accessible error. A browser or embedded webview may still silently ignore an
 * otherwise-successful click — that cannot be reliably detected. Nothing here
 * logs report contents or any sensitive data.
 */

/**
 * How long the object URL stays alive after the click. One second comfortably
 * outlives the initiating click task without retaining report blobs for long
 * during repeated downloads.
 */
export const OBJECT_URL_REVOKE_DELAY_MS = 1_000;

export interface DownloadRequest {
  /** Exact bytes/text from the server response. */
  content: BlobPart;
  /** Server-provided filename; treated as a download name, never a path. */
  filename: string;
  /** MIME type for the Blob (e.g. "application/json", "text/html;charset=utf-8"). */
  mimeType: string;
}

/**
 * Trigger a real browser download of `content`. Creates a Blob and a temporary
 * object URL, dispatches a click on a hidden temporary anchor, removes the
 * anchor immediately, and revokes the object URL after a delay. Throws if the
 * object URL or the click cannot be created/dispatched.
 */
export function triggerDownload({ content, filename, mimeType }: DownloadRequest): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    // The download attribute treats the value as a filename, not a navigable
    // path; the browser sanitizes it. We never interpret it as a filesystem path.
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      // Remove the temporary node whether or not the click threw, so repeated
      // downloads never accumulate detached anchors.
      anchor.remove();
    }
  } catch (cause) {
    // Nothing was handed to the browser; release the URL immediately.
    URL.revokeObjectURL(url);
    throw cause;
  }

  // Defer revocation so it outlives the synchronous click task and the browser
  // can start reading the blob first (not a sync call in the click's tick).
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}
