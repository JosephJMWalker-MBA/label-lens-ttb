import { parseRevisionResponseContext, type RevisionResponseContext } from "./revision-context";

import type { SellerPackageDraft } from "./package-model";
import { WINE_PACKAGE_CATEGORY_DEFINITIONS, WINE_PACKAGE_PROFILE } from "./package-profile";

export function newDraft(): SellerPackageDraft {
  const recordedAt = new Date().toISOString();
  return {
    schemaVersion: "seller-package-draft.v1",
    packageId: `seller-package-${crypto.randomUUID()}`,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    profile: WINE_PACKAGE_PROFILE,
    panelDecisions: { back: "unresolved", additional: "unresolved" },
    panels: [],
    categories: WINE_PACKAGE_CATEGORY_DEFINITIONS.map((definition) => ({
      categoryId: definition.categoryId,
      decision: "provided",
      expectedValue: "",
      regions: [],
    })),
    sellerChangeHistory: [],
    analysisRuns: [],
  };
}

const DATABASE_NAME = "label-lens-seller-package-v1";
const DATABASE_VERSION = 2;
const STORE_NAME = "drafts";
const LEGACY_CURRENT_KEY = "current-package";
const ACTIVE_KEY = "meta:active-package-id";

export const MAX_LOCAL_DRAFTS = 20;

const OPEN_TIMEOUT_MS = 3_000;
const TXN_TIMEOUT_MS = 3_000;

export type DraftStoreReason =
  | "LOCAL_DRAFT_STORAGE_UNAVAILABLE"
  | "LOCAL_DRAFT_STORAGE_OPEN_FAILED"
  | "LOCAL_DRAFT_STORAGE_BLOCKED"
  | "LOCAL_DRAFT_STORAGE_OPEN_TIMEOUT"
  | "LOCAL_DRAFT_STORAGE_TXN_TIMEOUT"
  | "LOCAL_DRAFT_STORAGE_ABORTED"
  | "LOCAL_DRAFT_STORAGE_FAILED"
  | "LOCAL_DRAFT_MALFORMED"
  | "LOCAL_DRAFT_LIMIT_REACHED";

export class DraftStoreError extends Error {
  constructor(public readonly reason: DraftStoreReason) {
    super(`Local draft storage failed: ${reason}`);
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

    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
      const oldVersion = event.oldVersion;
      if (oldVersion > 0 && oldVersion < 2 && request.transaction) {
        const store = request.transaction.objectStore(STORE_NAME);
        const legacyGetReq = store.get(LEGACY_CURRENT_KEY);
        legacyGetReq.onsuccess = () => {
          const legacyDraft = legacyGetReq.result as StoredPackageDraft | undefined;
          if (legacyDraft && isValidStoredDraft(legacyDraft) && legacyDraft.draft?.packageId) {
            store.put(legacyDraft, legacyDraft.draft.packageId);
            store.put(legacyDraft.draft.packageId, ACTIVE_KEY);
            store.delete(LEGACY_CURRENT_KEY);
          }
        };
      }
    };

    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) {
        try {
          request.result.close();
        } catch {
          // best-effort cleanup on late open
        }
        return;
      }
      settled = true;
      resolve(request.result);
    };

    request.onerror = () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new DraftStoreError("LOCAL_DRAFT_STORAGE_OPEN_FAILED"));
    };

    request.onblocked = () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new DraftStoreError("LOCAL_DRAFT_STORAGE_BLOCKED"));
    };
  });
}

/**
 * Execute an IndexedDB operation against the drafts store with a bounded transaction
 * deadline. Resolves with the operation's request result on `transaction.oncomplete`.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
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
      const finishResolve = (value: T) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const finishReject = (reason: DraftStoreReason) => {
        if (settled) return;
        settled = true;
        reject(new DraftStoreError(reason));
      };

      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(STORE_NAME, mode);
      } catch {
        finishReject("LOCAL_DRAFT_STORAGE_FAILED");
        return;
      }

      const timer = setTimeout(() => {
        finishReject("LOCAL_DRAFT_STORAGE_TXN_TIMEOUT");
      }, TXN_TIMEOUT_MS);

      let request: IDBRequest<T>;
      try {
        request = operation(transaction.objectStore(STORE_NAME));
      } catch {
        clearTimeout(timer);
        finishReject("LOCAL_DRAFT_STORAGE_FAILED");
        return;
      }

      request.onerror = () => {
        clearTimeout(timer);
        finishReject("LOCAL_DRAFT_STORAGE_FAILED");
      };
      transaction.oncomplete = () => {
        clearTimeout(timer);
        finishResolve(request.result);
      };
      transaction.onerror = () => {
        clearTimeout(timer);
        finishReject("LOCAL_DRAFT_STORAGE_FAILED");
      };
      transaction.onabort = () => {
        clearTimeout(timer);
        finishReject("LOCAL_DRAFT_STORAGE_ABORTED");
      };
    });
  } finally {
    closeOnce();
  }
}

export function isValidStoredDraft(
  stored: StoredPackageDraft | undefined,
): stored is StoredPackageDraft {
  if (!stored || stored.draft?.schemaVersion !== "seller-package-draft.v1") return false;
  if (
    stored.revisionContext !== undefined &&
    !parseRevisionResponseContext(stored.revisionContext).ok
  ) {
    return false;
  }
  const panelIds = new Set(stored.draft.panels.map((panel: { panelId: string }) => panel.panelId));
  return (
    Array.isArray(stored.panelFiles) &&
    stored.panelFiles.length === stored.draft.panels.length &&
    stored.panelFiles.every((entry) => entry.file instanceof File && panelIds.has(entry.panelId)) &&
    new Set(stored.panelFiles.map((entry) => entry.panelId)).size === panelIds.size
  );
}

export async function getActivePackageDraftIdLocally(): Promise<string | null> {
  try {
    const active = await withStore<unknown>("readonly", (store) => store.get(ACTIVE_KEY));
    return typeof active === "string" ? active : null;
  } catch {
    return null;
  }
}

export async function setActivePackageDraftIdLocally(packageId: string): Promise<void> {
  await withStore("readwrite", (store) => store.put(packageId, ACTIVE_KEY));
}

export async function createAndActivateNewDraftLocally(): Promise<StoredPackageDraft> {
  const existing = await listPackageDraftsLocally();
  if (existing.length >= MAX_LOCAL_DRAFTS) {
    throw new DraftStoreError("LOCAL_DRAFT_LIMIT_REACHED");
  }
  const initial = newDraft();
  const stored: StoredPackageDraft = {
    draft: initial,
    panelFiles: [],
  };
  await savePackageDraftLocally(stored);
  return stored;
}

export async function savePackageDraftLocally(value: StoredPackageDraft): Promise<void> {
  const packageId = value.draft.packageId;
  const existingList = await listPackageDraftsLocally();
  const alreadyExists = existingList.some((d) => d.draft.packageId === packageId);
  if (!alreadyExists && existingList.length >= MAX_LOCAL_DRAFTS) {
    throw new DraftStoreError("LOCAL_DRAFT_LIMIT_REACHED");
  }
  let next = value;
  if (!next.revisionContext) {
    try {
      const existing = await withStore<StoredPackageDraft | undefined>("readonly", (store) =>
        store.get(packageId),
      );
      if (
        existing &&
        isValidStoredDraft(existing) &&
        existing.revisionContext &&
        existing.draft.packageId === packageId
      ) {
        next = { ...value, revisionContext: existing.revisionContext };
      }
    } catch {
      // Preservation read fallback
    }
  }
  await withStore("readwrite", (store) => {
    store.put(next, packageId);
    store.put(packageId, ACTIVE_KEY);
    return store.get(packageId);
  });
}

/**
 * Load a local draft by packageId, or load the active/most recent local draft.
 */
export async function loadPackageDraftLocally(
  packageId?: string,
): Promise<StoredPackageDraft | null> {
  let targetId = packageId;
  if (!targetId) {
    targetId = (await getActivePackageDraftIdLocally()) ?? undefined;
  }

  if (targetId) {
    const stored = await withStore<StoredPackageDraft | undefined>("readonly", (store) =>
      store.get(targetId!),
    );
    if (stored !== undefined && stored !== null) {
      if (!isValidStoredDraft(stored)) {
        throw new DraftStoreError("LOCAL_DRAFT_MALFORMED");
      }
      await setActivePackageDraftIdLocally(stored.draft.packageId);
      return stored;
    }
  }

  // Check legacy key if targetId was not found or not specified
  const legacyStored = await withStore<StoredPackageDraft | undefined>("readonly", (store) =>
    store.get(LEGACY_CURRENT_KEY),
  );
  if (legacyStored !== undefined && legacyStored !== null) {
    if (!isValidStoredDraft(legacyStored)) {
      throw new DraftStoreError("LOCAL_DRAFT_MALFORMED");
    }
    await withStore("readwrite", (store) => {
      store.put(legacyStored, legacyStored.draft.packageId);
      store.put(legacyStored.draft.packageId, ACTIVE_KEY);
      store.delete(LEGACY_CURRENT_KEY);
      return store.get(legacyStored.draft.packageId);
    });
    return legacyStored;
  }

  // If still no target draft, list all drafts and pick the most recent
  const allDrafts = await listPackageDraftsLocally();
  if (allDrafts.length > 0) {
    const first = allDrafts[0];
    await setActivePackageDraftIdLocally(first.draft.packageId);
    return first;
  }

  return null;
}

/**
 * List all valid stored package drafts sorted by draft.updatedAt descending.
 */
export async function listPackageDraftsLocally(): Promise<StoredPackageDraft[]> {
  const allValues = await withStore<unknown[]>("readonly", (store) => store.getAll());
  const validDrafts: StoredPackageDraft[] = [];
  for (const item of allValues) {
    if (
      typeof item === "object" &&
      item !== null &&
      isValidStoredDraft(item as StoredPackageDraft)
    ) {
      validDrafts.push(item as StoredPackageDraft);
    }
  }
  validDrafts.sort((a, b) => {
    const timeA = new Date(a.draft.updatedAt).getTime();
    const timeB = new Date(b.draft.updatedAt).getTime();
    return timeB - timeA;
  });
  return validDrafts;
}

export async function deletePackageDraftLocally(packageId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(packageId));
  const activeId = await getActivePackageDraftIdLocally();
  if (activeId === packageId) {
    const remaining = await listPackageDraftsLocally();
    if (remaining.length > 0) {
      await setActivePackageDraftIdLocally(remaining[0].draft.packageId);
    } else {
      await clearPackageDraftLocally();
    }
  }
}

export async function clearPackageDraftLocally(packageId?: string): Promise<void> {
  if (packageId) {
    await deletePackageDraftLocally(packageId);
  } else {
    await withStore("readwrite", (store) => store.delete(ACTIVE_KEY));
  }
}
