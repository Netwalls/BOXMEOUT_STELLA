import { renderHook, act, waitFor } from "@testing-library/react";
import { useClaimWinnings } from "@/hooks/useClaimWinnings";

const RECEIPT = { betId: "bet-1", bettor: "GADDR1", payout: "150000000", claimedAt: "2026-06-21T10:00:00Z" };

afterEach(() => jest.restoreAllMocks());

test("happy path: returns ClaimReceipt on success", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RECEIPT) });
  const { result } = renderHook(() => useClaimWinnings());
  let receipt: unknown;
  await act(async () => { receipt = await result.current.claim("bet-1", "mkt-1"); });
  expect((receipt as { betId: string }).betId).toBe("bet-1");
  expect(result.current.error).toBeNull();
});

test("error path: sets error on 403 response", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) });
  const { result } = renderHook(() => useClaimWinnings());
  await act(async () => {
    await expect(result.current.claim("bet-1", "mkt-1")).rejects.toThrow();
  });
  expect(result.current.error).toBeInstanceOf(Error);
});

test("edge case: isLoading transitions during claim", async () => {
  let resolve!: (v: unknown) => void;
  global.fetch = jest.fn().mockReturnValue(new Promise((res) => { resolve = res; }));
  const { result } = renderHook(() => useClaimWinnings());
  act(() => { result.current.claim("bet-1", "mkt-1").catch(() => {}); });
  await waitFor(() => expect(result.current.isLoading).toBe(true));
  await act(async () => { resolve({ ok: true, json: () => Promise.resolve(RECEIPT) }); });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
});
