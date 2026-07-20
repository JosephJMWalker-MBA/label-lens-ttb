// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DraftStoreError,
  loadPackageDraftLocally,
  savePackageDraftLocally,
  type StoredPackageDraft,
} from "./package-draft-store";

/**
 * A minimal, test-driven fake of the IndexedDB surface this module uses. The
 * test fires events explicitly (or lets the store's bounded timers fire under
 * fake timers), so we can exercise open error/blocked/timeout and transaction
 * abort/error/timeout deterministically without real multi-second waits.
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
  lastRequest: FakeRequest<unknown> | null = null;
  constructor(private readonly store: FakeObjectStore) {}
  objectStore() {
    return this.store;
  }
}

class FakeObjectStore {
  value: unknown = undefined;
  get() {
    const r = new FakeRequest<unknown>();
    this.lastGet = r;
    return r;
  }
  put() {
    const r = new FakeRequest<unknown>();
    this.lastPut = r;
    return r;
  }
  delete() {
    const r = new FakeRequest<unknown>();
    this.lastDelete = r;
    return r;
  }
  lastGet: FakeRequest<unknown> | null = null;
  lastPut: FakeRequest<unknown> | null = null;
  lastDelete: FakeRequest<unknown> | null = null;
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
  onupgradeneeded: (() => void) | null = null;
  result = new FakeDatabase();
}

let lastOpen: FakeOpenRequest | null = null;

function installFakeIndexedDB() {
  lastOpen = null;
  vi.stubGlobal("indexedDB", {
    open: () => {
      lastOpen = new FakeOpenRequest();
      return lastOpen;
    },
  });
}

const tick = () => Promise.resolve();

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
    await expect(loadPackageDraftLocally()).rejects.toMatchObject({
      reason: "LOCAL_DRAFT_STORAGE_UNAVAILABLE",
    });
  });

  it("rejects with OPEN_FAILED on an open error", async () => {
    const promise = loadPackageDraftLocally();
    await tick();
    lastOpen!.onerror?.();
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_OPEN_FAILED" });
  });

  it("rejects with BLOCKED when the open is blocked", async () => {
    const promise = loadPackageDraftLocally();
    await tick();
    lastOpen!.onblocked?.();
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_BLOCKED" });
  });

  it("rejects with OPEN_TIMEOUT when the open never settles, and closes a late open", async () => {
    vi.useFakeTimers();
    const promise = loadPackageDraftLocally();
    await tick();
    // Never fire any open event; advance past the bounded deadline.
    vi.advanceTimersByTime(4000);
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_OPEN_TIMEOUT" });
    // A late success closes the database rather than leaking it.
    const late = lastOpen!.result;
    lastOpen!.onsuccess?.();
    expect(late.closed).toBe(true);
  });

  it("rejects with TXN_TIMEOUT when the transaction never completes", async () => {
    vi.useFakeTimers();
    const promise = loadPackageDraftLocally();
    await tick();
    lastOpen!.onsuccess?.();
    await tick();
    // The get request fires success, but the transaction never completes.
    const db = lastOpen!.result;
    db.store.lastGet!.result = validDraft;
    db.store.lastGet!.onsuccess?.();
    vi.advanceTimersByTime(4000);
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_TXN_TIMEOUT" });
    expect(db.closed).toBe(true);
  });

  it("rejects with ABORTED on a transaction abort", async () => {
    const promise = loadPackageDraftLocally();
    await tick();
    lastOpen!.onsuccess?.();
    await tick();
    const db = lastOpen!.result;
    db.lastTransaction!.onabort?.();
    await expect(promise).rejects.toMatchObject({ reason: "LOCAL_DRAFT_STORAGE_ABORTED" });
    expect(db.closed).toBe(true);
  });

  it("does not resolve a read until the transaction completes (not merely on request success)", async () => {
    let resolved = false;
    const promise = loadPackageDraftLocally().then((v) => {
      resolved = true;
      return v;
    });
    await tick();
    lastOpen!.onsuccess?.();
    await tick();
    const db = lastOpen!.result;
    db.store.lastGet!.result = undefined; // empty database
    db.store.lastGet!.onsuccess?.();
    await tick();
    // Request succeeded but the transaction has not completed yet.
    expect(resolved).toBe(false);
    db.lastTransaction!.oncomplete?.();
    await expect(promise).resolves.toBeNull();
    expect(db.closed).toBe(true);
  });

  it("returns null for an empty database", async () => {
    const promise = loadPackageDraftLocally();
    await tick();
    lastOpen!.onsuccess?.();
    await tick();
    const db = lastOpen!.result;
    db.store.lastGet!.result = undefined;
    db.store.lastGet!.onsuccess?.();
    db.lastTransaction!.oncomplete?.();
    await expect(promise).resolves.toBeNull();
  });

  it("returns a valid stored draft", async () => {
    const promise = loadPackageDraftLocally();
    await tick();
    lastOpen!.onsuccess?.();
    await tick();
    const db = lastOpen!.result;
    db.store.lastGet!.result = validDraft;
    db.store.lastGet!.onsuccess?.();
    db.lastTransaction!.oncomplete?.();
    await expect(promise).resolves.toEqual(validDraft);
  });

  it("treats a malformed stored draft as MALFORMED without deleting it", async () => {
    const malformed = {
      draft: { schemaVersion: "wrong-version" },
      panelFiles: [],
    } as unknown as StoredPackageDraft;
    const promise = loadPackageDraftLocally();
    await tick();
    lastOpen!.onsuccess?.();
    await tick();
    const db = lastOpen!.result;
    db.store.lastGet!.result = malformed;
    db.store.lastGet!.onsuccess?.();
    db.lastTransaction!.oncomplete?.();
    await expect(promise).rejects.toBeInstanceOf(DraftStoreError);
    await promise.catch((e) => expect(e.reason).toBe("LOCAL_DRAFT_MALFORMED"));
    // No delete was ever issued.
    expect(db.store.lastDelete).toBeNull();
  });

  it("saves via a committed write transaction", async () => {
    const promise = savePackageDraftLocally(validDraft);
    await tick();
    lastOpen!.onsuccess?.();
    await tick();
    const db = lastOpen!.result;
    db.store.lastPut!.result = "current-package";
    db.store.lastPut!.onsuccess?.();
    db.lastTransaction!.oncomplete?.();
    await expect(promise).resolves.toBeUndefined();
    expect(db.closed).toBe(true);
  });
});
