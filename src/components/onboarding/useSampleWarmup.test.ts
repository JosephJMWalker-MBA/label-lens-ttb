import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearPrecheckTiming, getPrecheckTiming } from "./warm-timing";
import { useSampleWarmup } from "./useSampleWarmup";

beforeEach(() => clearPrecheckTiming());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A fetch whose resolution we control, returning the precheck envelope shape. */
function deferredFetch() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const fetchMock = vi.fn().mockReturnValue(promise);
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    resolveOk: (data: unknown) => resolve({ json: async () => ({ ok: true, data }) }),
    resolveError: (message: string) =>
      resolve({ json: async () => ({ ok: false, error: { code: "X", message } }) }),
    reject: (reason?: unknown) => reject(reason),
  };
}

describe("useSampleWarmup", () => {
  it("does not request until active", () => {
    const { fetchMock } = deferredFetch();
    renderHook(() => useSampleWarmup(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests once when active, reaches ready, and records a cold timing", async () => {
    const { fetchMock, resolveOk } = deferredFetch();
    const { result } = renderHook(() => useSampleWarmup(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("analyzing");
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("source")).toBe("sample");
    expect(body.get("brand")).toBe("M CELLARS");

    await act(async () => resolveOk({ id: "sample-1" }));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.response).toEqual({ id: "sample-1" });
    expect(result.current.coldMs).not.toBeNull();
    expect(getPrecheckTiming().coldMs).not.toBeNull();
  });

  it("fires exactly one request under React Strict Mode's doubled effects", async () => {
    const { fetchMock } = deferredFetch();
    renderHook(() => useSampleWarmup(true), { wrapper: StrictMode });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a response that arrives after unmount (no unmounted-tree update)", async () => {
    const { resolveOk } = deferredFetch();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderHook(() => useSampleWarmup(true));
    unmount();
    await act(async () => resolveOk({ id: "late" }));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("surfaces a failed run and allows a retry that supersedes it", async () => {
    const first = deferredFetch();
    const { result } = renderHook(() => useSampleWarmup(true));
    expect(first.fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => first.reject(new Error("network")));
    await waitFor(() => expect(result.current.state).toBe("failed"));

    // Retry issues a fresh request.
    const second = deferredFetch();
    act(() => result.current.start());
    expect(second.fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => second.resolveOk({ id: "retry" }));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.response).toEqual({ id: "retry" });
  });

  it("does not start a second request once already ready", async () => {
    const { fetchMock, resolveOk } = deferredFetch();
    const { result } = renderHook(() => useSampleWarmup(true));
    await act(async () => resolveOk({ id: "x" }));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    act(() => result.current.start());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
