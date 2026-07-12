/**
 * Small, reusable client download helper.
 *
 * It saves exact text (or bytes) supplied by the server response — it never
 * reconstructs content from visible fields. The object URL is revoked only after
 * a delay, so the browser has time to begin the download before the blob is
 * released; revoking synchronously in the same tick as the click races the
 * download and makes it silently do nothing in some browsers/runtimes.
 *
 * A failure to start the download throws, so the caller can surface an
 * accessible error instead of claiming success. Nothing here logs report
 * contents or any sensitive data.
 */

/** How long the object URL stays alive after the click, so the download starts. */
export const OBJECT_URL_REVOKE_DELAY_MS = 40_000;

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

  // Defer revocation so the browser can start reading the blob first. setTimeout
  // is used (not a sync call) specifically to outlive the click's task.
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}
