/**
 * #1556 — AbortSignal support in the API client.
 * Verifies the signal reaches fetch and that aborting rejects with AbortError.
 */
import { fetchMarketById, fetchMarkets } from "@/lib/api";

const realFetch = global.fetch;

function abortableFetch() {
  return jest.fn((_url: string, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    });
  });
}

describe("api client AbortSignal support", () => {
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("forwards the signal to fetch for single-market requests", async () => {
    const mock = abortableFetch();
    global.fetch = mock as unknown as typeof fetch;
    const controller = new AbortController();

    const pending = fetchMarketById("m1", controller.signal);
    expect(mock.mock.calls[0][1]?.signal).toBe(controller.signal);

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("forwards the signal for list requests", async () => {
    const mock = abortableFetch();
    global.fetch = mock as unknown as typeof fetch;
    const controller = new AbortController();

    const pending = fetchMarkets({ status: "Open" }, controller.signal);
    expect(mock.mock.calls[0][1]?.signal).toBe(controller.signal);

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not attach a signal when none is provided", async () => {
    const mock = jest.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
    global.fetch = mock as unknown as typeof fetch;
    // Response shape is validated by the schema; we only assert the call args here.
    await fetchMarketById("m1").catch(() => undefined);
    expect(mock.mock.calls[0][1]?.signal).toBeUndefined();
  });
});
