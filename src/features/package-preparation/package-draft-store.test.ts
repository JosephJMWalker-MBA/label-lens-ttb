// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deletePackageDraftLocally,
  listPackageDraftsLocally,
  loadPackageDraftLocally,
  savePackageDraftLocally,
  setActivePackageDraftIdLocally,
  type StoredPackageDraft,
} from "./package-draft-store";

/**
 * A minimal, test-driven fake of the IndexedDB surface this module uses.
 */
class FakeRequest<T> {
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result!: T;
  error: unknown = null;
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: unknown = null;
  constructor(private readonly store: FakeObjectStore) {}
  objectStore() {
    return this.store;
  }
}

class FakeObjectStore {
  storeMap = new Map<unknown, unknown>();

  get(key: unknown) {
    const r = new FakeRequest<unknown>();
    r.result = this.storeMap.get(key);
    this.lastGetKey = key;
    this.lastGet = r;
    return r;
  }
  put(value: unknown, key?: unknown) {
    const r = new FakeRequest<unknown>();
    if (key !== undefined) {
      this.storeMap.set(key, value);
    }
    this.lastPutValue = value;
    this.lastPutKey = key;
    this.lastPut = r;
    return r;
  }
  delete(key: unknown) {
    const r = new FakeRequest<unknown>();
    this.storeMap.delete(key);
    this.lastDeleteKey = key;
    this.lastDelete = r;
    return r;
  }
  getAll() {
    const r = new FakeRequest<unknown[]>();
    r.result = Array.from(this.storeMap.values());
    this.lastGetAll = r;
    return r;
  }

  lastGet: FakeRequest<unknown> | null = null;
  lastGetKey: unknown = undefined;
  lastPut: FakeRequest<unknown> | null = null;
  lastPutKey: unknown = undefined;
  lastPutValue: unknown = undefined;
  lastDelete: FakeRequest<unknown> | null = null;
  lastDeleteKey: unknown = undefined;
  lastGetAll: FakeRequest<unknown[]> | null = null;
}

class FakeDatabase {
  closed = false;
  store = new FakeObjectStore();
  lastTransaction: FakeTransaction | null = null;
  objectStoreNames = { contains: () => true };
  transaction() {
    const txn = new FakeTransaction(this.store);
    this.lastTransaction = txn;
    return txn;
  }
  close() {
    this.closed = true;
  }
}

class FakeOpenRequest {
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onblocked: (() => void) | null = null;
  onupgradeneeded: ((e: { oldVersion: number }) => void) | null = null;
  result = new FakeDatabase();
  transaction: FakeTransaction | null = null;
}

let lastOpen: FakeOpenRequest | null = null;
let openRequests: FakeOpenRequest[] = [];

function installFakeIndexedDB() {
  lastOpen = null;
  openRequests = [];
  vi.stubGlobal("indexedDB", {
    open: () => {
      lastOpen = new FakeOpenRequest();
      lastOpen.transaction = new FakeTransaction(lastOpen.result.store);
      openRequests.push(lastOpen);
      return lastOpen;
    },
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function stepOpenRequest(reqIndex: number, getResult?: unknown) {
  await tick();
  if (openRequests[reqIndex]) {
    openRequests[reqIndex].onsuccess?.();
    await tick();
    const db = openRequests[reqIndex].result;
    if (db.store.lastGet) {
      if (getResult !== undefined) db.store.lastGet.result = getResult;
      db.store.lastGet.onsuccess?.();
    }
    if (db.store.lastGetAll) {
      if (getResult !== undefined) {
        db.store.lastGetAll.result = Array.isArray(getResult) ? getResult : [];
      }
      db.store.lastGetAll.onsuccess?.();
    }
    if (db.store.lastPut) {
      db.store.lastPut.onsuccess?.();
    }
    if (db.store.lastDelete) {
      db.store.lastDelete.onsuccess?.();
    }
    db.lastTransaction!.oncomplete?.();
    await tick();
  }
}

const validDraft: StoredPackageDraft = {
  draft: {
    schemaVersion: "seller-package-draft.v1",
    packageId: "pkg-1",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    profile: { id: "wine-label-requirements", version: "1.0.0" },
    panels: [],
    categories: [],
    sellerChangeHistory: [],
    analysisRuns: [],
  } as unknown as StoredPackageDraft["draft"],
  panelFiles: [],
};

const validDraft2: StoredPackageDraft = {
  draft: {
    schemaVersion: "seller-package-draft.v1",
    packageId: "pkg-2",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    profile: { id: "wine-label-requirements", version: "1.0.0" },
    panels: [],
    categories: [
      {
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "Second Package Brand",
        regions: [],
      },
    ],
    sellerChangeHistory: [],
    analysisRuns: [],
  } as unknown as StoredPackageDraft["draft"],
  panelFiles: [],
};

const revisionContext = {
  kind: "requested_changes_response" as const,
  submissionId: "pkg-1",
  baseRevisionId: "revision-parent",
  baseRevisionNumber: 1,
  respondedToDecisionId: "decision-1",
  expectedSubmissionVersion: 3,
};

beforeEach(() => {
  installFakeIndexedDB();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("package-draft-store", () => {
  it("rejects with UNAVAILABLE when IndexedDB is missing", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(setActivePackageDraftIdLocally("pkg-1")).rejects.toMatchObject({
      reason: "LOCAL_DRAFT_STORAGE_UNAVAILABLE",
    });
  });

  it("rejects with OPEN_FAILED on an open error", async () => {
    const promise = setActivePackageDraftIdLocally("pkg-1");
    lastOpen!.onerror?.();
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_OPEN_FAILED" });
  });

  it("rejects with BLOCKED when the open is blocked", async () => {
    const promise = setActivePackageDraftIdLocally("pkg-1");
    lastOpen!.onblocked?.();
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_BLOCKED" });
  });

  it("rejects with OPEN_TIMEOUT when the open never settles, and closes a late open", async () => {
    vi.useFakeTimers();
    const promise = setActivePackageDraftIdLocally("pkg-1");
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(4000);
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_OPEN_TIMEOUT" });
    const late = lastOpen!.result;
    lastOpen!.onsuccess?.();
    expect(late.closed).toBe(true);
  });

  it("rejects with TXN_TIMEOUT when the transaction never completes", async () => {
    vi.useFakeTimers();
    const promise = setActivePackageDraftIdLocally("pkg-1");
    promise.catch(() => {});
    lastOpen!.onsuccess?.();
    await vi.advanceTimersByTimeAsync(4000);
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_TXN_TIMEOUT" });
    expect(lastOpen!.result.closed).toBe(true);
  });

  it("rejects with ABORTED on a transaction abort", async () => {
    const promise = setActivePackageDraftIdLocally("pkg-1");
    lastOpen!.onsuccess?.();
    await tick();
    const db = lastOpen!.result;
    db.lastTransaction!.onabort?.();
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_ABORTED" });
    expect(db.closed).toBe(true);
  });

  it("returns null for an empty database", async () => {
    const promise = loadPackageDraftLocally();
    await stepOpenRequest(0, undefined);
    await stepOpenRequest(1, undefined);
    await stepOpenRequest(2, []);

    await expect(promise).resolves.toBeNull();
  });

  it("returns a valid stored draft by packageId", async () => {
    const promise = loadPackageDraftLocally("pkg-1");
    await stepOpenRequest(0, validDraft);
    await stepOpenRequest(1);

    await expect(promise).resolves.toEqual(validDraft);
  });

  it("returns a valid stored revision-response draft", async () => {
    const stored = { ...validDraft, revisionContext };
    const promise = loadPackageDraftLocally("pkg-1");
    await stepOpenRequest(0, stored);
    await stepOpenRequest(1);

    await expect(promise).resolves.toEqual(stored);
  });

  it("saves draft under its packageId and sets active key", async () => {
    const promise = savePackageDraftLocally(validDraft);
    await stepOpenRequest(0, []);
    await stepOpenRequest(1, undefined);
    await stepOpenRequest(2, validDraft);

    await expect(promise).resolves.toBeUndefined();
    expect(openRequests[2].result.store.storeMap.get("pkg-1")).toEqual(validDraft);
    expect(openRequests[2].result.store.storeMap.get("meta:active-package-id")).toBe("pkg-1");
  });

  it("lists all valid drafts sorted by updatedAt descending", async () => {
    const promise = listPackageDraftsLocally();
    await stepOpenRequest(0, [validDraft, validDraft2]);

    const result = await promise;
    expect(result).toHaveLength(2);
    expect(result[0].draft.packageId).toBe("pkg-2");
    expect(result[1].draft.packageId).toBe("pkg-1");
  });

  it("deletes a draft by packageId", async () => {
    const promise = deletePackageDraftLocally("pkg-1");
    await stepOpenRequest(0);
    await stepOpenRequest(1, "pkg-1");
    await stepOpenRequest(2, []);
    await stepOpenRequest(3);

    await promise;
  });

  it("rejects with LOCAL_DRAFT_LIMIT_REACHED when saving 21st draft without evicting existing drafts", async () => {
    const twentyDrafts = Array.from({ length: 20 }, (_, i) => ({
      ...validDraft,
      draft: { ...validDraft.draft, packageId: `pkg-${i}` },
    }));

    const promise = savePackageDraftLocally({
      ...validDraft,
      draft: { ...validDraft.draft, packageId: "pkg-21" },
    });
    promise.catch(() => {});

    await stepOpenRequest(0, twentyDrafts);
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_LIMIT_REACHED" });
  });

  it("throws LOCAL_DRAFT_MALFORMED when legacy draft is invalid without deleting it", async () => {
    const malformedLegacy = { invalid: true };
    const promise = loadPackageDraftLocally();
    promise.catch(() => {});

    await stepOpenRequest(0, undefined);
    await stepOpenRequest(1, malformedLegacy);

    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_MALFORMED" });
  });
});
