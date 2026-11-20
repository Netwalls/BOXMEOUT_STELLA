/**
 * #1556 — data hooks abort stale or unmounted requests.
 * A slow, superseded response must never replace newer data, and an unmounted
 * hook must not update state when its request later settles.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import * as api from "@/lib/api";
import { useMarkets } from "@/hooks/useMarkets";
import { useMarket } from "@/hooks/useMarket";
import type { Market } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  fetchMarkets: jest.fn(),
  fetchMarketById: jest.fn(),
}));

const mockFetchMarkets = api.fetchMarkets as jest.Mock;
const mockFetchMarketById = api.fetchMarketById as jest.Mock;

const market = (id: string): Market =>
  ({ id, status: "Open" } as unknown as Market);

/** A promise whose settlement the test controls, observing the signal it was given. */
function controlled<T>(signal?: AbortSignal) {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
    signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
  });
  return { promise, resolve, reject };
}

describe("AbortSignal in data hooks", () => {
  beforeEach(() => jest.clearAllMocks());

  it("useMarkets: a slow stale response cannot overwrite newer data", async () => {
    const first = { current: null as ReturnType<typeof controlled<{ data: Market[] }>> | null };
    const second = { current: null as ReturnType<typeof controlled<{ data: Market[] }>> | null };
    mockFetchMarkets.mockImplementation((_params, signal?: AbortSignal) => {
      const c = controlled<{ data: Market[] }>(signal);
      if (!first.current) first.current = c;
      else second.current = c;
      return c.promise;
    });

    const { result, rerender } = renderHook(
      ({ status }: { status?: "Open" | "Resolved" }) => useMarkets({ status }, { pollingInterval: 0 }),
      { initialProps: { status: "Open" as "Open" | "Resolved" } },
    );

    rerender({ status: "Resolved" });
    await waitFor(() => expect(second.current).not.toBeNull());

    await act(async () => second.current!.resolve({ data: [market("new")] }));
    await waitFor(() => expect(result.current.markets.map((m) => m.id)).toEqual(["new"]));

    // The superseded request was aborted; even if it resolves now, it is ignored.
    await act(async () => first.current!.resolve({ data: [market("stale")] }));
    expect(result.current.markets.map((m) => m.id)).toEqual(["new"]);
  });

  it("useMarket: aborts the in-flight request on unmount and sets no state afterwards", async () => {
    let captured: AbortSignal | undefined;
    const c = controlled<Market>();
    mockFetchMarketById.mockImplementation((_id: string, signal?: AbortSignal) => {
      captured = signal;
      return signal ? controlled<Market>(signal).promise : c.promise;
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const { result, unmount } = renderHook(() => useMarket("m1"));
    expect(result.current.isLoading).toBe(true);

    unmount();
    expect(captured?.aborted).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
