import type { SellerPackageDraft } from "./package-model";
import { parseRevisionResponseContext } from "./revision-context";
import type { RevisionResponseContext } from "./revision-context";

const DATABASE_NAME = "label-lens-seller-package-v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const CURRENT_KEY = "current-package";

/**
 * Bounded deadlines so a single operation can never hang the caller. These are
 * intentionally shorter than the workspace's own restoration deadline, so the
 * storage layer usually fails first with a typed reason.
 */
const OPEN_TIMEOUT_MS = 4000;
const TXN_TIMEOUT_MS = 4000;

export type DraftStoreFailureReason =
  | "LOCAL_DRAFT_STORAGE_UNAVAILABLE"
  | "LOCAL_DRAFT_STORAGE_OPEN_FAILED"
  | "LOCAL_DRAFT_STORAGE_BLOCKED"
  | "LOCAL_DRAFT_STORAGE_OPEN_TIMEOUT"
  | "LOCAL_DRAFT_STORAGE_FAILED"
  | "LOCAL_DRAFT_STORAGE_ABORTED"
  | "LOCAL_DRAFT_STORAGE_TXN_TIMEOUT"
  | "LOCAL_DRAFT_MALFORMED";

/** A typed, domain-specific failure for local draft persistence. */
export class DraftStoreError extends Error {
  constructor(public readonly reason: DraftStoreFailureReason) {
    super(reason);
    this.name = "DraftStoreError";
  }
}

export interface StoredPackagePanelFile {
  panelId: string;
  file: File;
}

export interface StoredPackageDraft {
  draft: SellerPackageDraft;
  panelFiles: StoredPackagePanelFile[];
  revisionContext?: RevisionResponseContext;
}

/**
 * Open the drafts database with a bounded deadline. Resolves exactly once, and
 * rejects with a typed reason on error, block, or timeout. If the database
 * happens to open after the deadline, it is closed immediately to avoid a leak.
 */
function openDatabase(timeoutMs = OPEN_TIMEOUT_MS): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new DraftStoreError("LOCAL_DRAFT_STORAGE_UNAVAILABLE"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      reject(new DraftStoreError("LOCAL_DRAFT_STORAGE_OPEN_FAILED"));
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new DraftStoreError("LOCAL_DRAFT_STORAGE_OPEN_TIMEOUT"));
    }, timeoutMs);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      if (settled) {
        // Opened after the deadline already rejected; close to avoid a leak.
        try {
          request.result.close();
        } catch {
          // ignore
        }
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new DraftStoreError("LOCAL_DRAFT_STORAGE_OPEN_FAILED"));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new DraftStoreError("LOCAL_DRAFT_STORAGE_BLOCKED"));
    };
  });
}

/**
 * Run a single object-store operation inside a bounded transaction. A read
 * resolves only after the request has succeeded AND the transaction has
 * committed (so a transaction that aborts after the request event never looks
 * successful). The database is closed exactly once, and the promise settles
 * exactly once, even on abort, error, or timeout.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  timeoutMs = TXN_TIMEOUT_MS,
): Promise<T> {
  const database = await openDatabase();
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    try {
      database.close();
    } catch {
      // ignore
    }
  };

  try {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      let hasResult = false;
      let result: T;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new DraftStoreError("LOCAL_DRAFT_STORAGE_TXN_TIMEOUT"));
      }, timeoutMs);

      const finishResolve = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const finishReject = (reason: DraftStoreFailureReason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new DraftStoreError(reason));
      };

      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(STORE_NAME, mode);
      } catch {
        finishReject("LOCAL_DRAFT_STORAGE_FAILED");
        return;
      }

      let request: IDBRequest<T>;
      try {
        request = operation(transaction.objectStore(STORE_NAME));
      } catch {
        finishReject("LOCAL_DRAFT_STORAGE_FAILED");
        return;
      }

      request.onsuccess = () => {
        result = request.result;
        hasResult = true;
      };
      request.onerror = () => finishReject("LOCAL_DRAFT_STORAGE_FAILED");
      transaction.oncomplete = () => {
        // Commit succeeded. Only treat it as success if the request itself
        // produced a result; otherwise the transaction completed without the
        // operation actually happening.
        if (hasResult) finishResolve();
        else finishReject("LOCAL_DRAFT_STORAGE_FAILED");
      };
      transaction.onerror = () => finishReject("LOCAL_DRAFT_STORAGE_FAILED");
      transaction.onabort = () => finishReject("LOCAL_DRAFT_STORAGE_ABORTED");
    });
  } finally {
    closeOnce();
  }
}

export async function savePackageDraftLocally(value: StoredPackageDraft): Promise<void> {
  let next = value;
  if (!next.revisionContext) {
    try {
      const existing = await withStore<StoredPackageDraft | undefined>("readonly", (store) =>
        store.get(CURRENT_KEY),
      );
      if (
        existing &&
        isValidStoredDraft(existing) &&
        existing.revisionContext &&
        existing.draft.packageId === value.draft.packageId
      ) {
        next = { ...value, revisionContext: existing.revisionContext };
      }
    } catch {
      // Saving the explicit value is still valid; the caller will surface any
      // write failure below. A failed preservation read must not block a save.
    }
  }
  await withStore("readwrite", (store) => store.put(next, CURRENT_KEY));
}

function isValidStoredDraft(stored: StoredPackageDraft | undefined): stored is StoredPackageDraft {
  if (!stored || stored.draft?.schemaVersion !== "seller-package-draft.v1") return false;
  if (
    stored.revisionContext !== undefined &&
    !parseRevisionResponseContext(stored.revisionContext).ok
  ) {
    return false;
  }
  const panelIds = new Set(stored.draft.panels.map((panel) => panel.panelId));
  return (
    Array.isArray(stored.panelFiles) &&
    stored.panelFiles.length === stored.draft.panels.length &&
    stored.panelFiles.every((entry) => entry.file instanceof File && panelIds.has(entry.panelId)) &&
    new Set(stored.panelFiles.map((entry) => entry.panelId)).size === panelIds.size
  );
}

/**
 * Load the current local draft.
 *
 * Returns `null` when there is simply no stored draft (a normal first visit).
 * Throws `DraftStoreError("LOCAL_DRAFT_MALFORMED")` when a record exists but
 * fails schema/file validation — the caller shows a warning and opens a new
 * draft, but the malformed record is never deleted automatically. Storage
 * failures (unavailable, blocked, timeout, abort) reject with their own reason.
 */
export async function loadPackageDraftLocally(): Promise<StoredPackageDraft | null> {
  const stored = await withStore<StoredPackageDraft | undefined>("readonly", (store) =>
    store.get(CURRENT_KEY),
  );
  if (stored === undefined || stored === null) return null;
  if (!isValidStoredDraft(stored)) {
    throw new DraftStoreError("LOCAL_DRAFT_MALFORMED");
  }
  return stored;
}

/**
 * Explicitly delete the stored draft. Only ever called from a deliberate user
 * action — malformed records are never cleared automatically.
 */
export async function clearPackageDraftLocally(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(CURRENT_KEY));
}
