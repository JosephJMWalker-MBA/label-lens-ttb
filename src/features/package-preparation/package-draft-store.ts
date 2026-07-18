import type { SellerPackageDraft } from "./package-model";

const DATABASE_NAME = "label-lens-seller-package-v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const CURRENT_KEY = "current-package";

export interface StoredPackagePanelFile {
  panelId: string;
  file: File;
}

export interface StoredPackageDraft {
  draft: SellerPackageDraft;
  panelFiles: StoredPackagePanelFile[];
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("LOCAL_DRAFT_STORAGE_UNAVAILABLE"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("LOCAL_DRAFT_STORAGE_OPEN_FAILED"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("LOCAL_DRAFT_STORAGE_FAILED"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("LOCAL_DRAFT_STORAGE_ABORTED"));
    });
  } finally {
    database.close();
  }
}

export async function savePackageDraftLocally(value: StoredPackageDraft): Promise<void> {
  await withStore("readwrite", (store) => store.put(value, CURRENT_KEY));
}

export async function loadPackageDraftLocally(): Promise<StoredPackageDraft | null> {
  const stored = await withStore<StoredPackageDraft | undefined>("readonly", (store) =>
    store.get(CURRENT_KEY),
  );
  if (!stored || stored.draft?.schemaVersion !== "seller-package-draft.v1") return null;
  const panelIds = new Set(stored.draft.panels.map((panel) => panel.panelId));
  if (
    !Array.isArray(stored.panelFiles) ||
    stored.panelFiles.length !== stored.draft.panels.length ||
    !stored.panelFiles.every(
      (entry) => entry.file instanceof File && panelIds.has(entry.panelId),
    ) ||
    new Set(stored.panelFiles.map((entry) => entry.panelId)).size !== panelIds.size
  ) {
    return null;
  }
  return stored;
}

export async function clearPackageDraftLocally(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(CURRENT_KEY));
}
