import { renderHook, act, waitFor } from "@testing-library/react";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import type { Bet } from "@/lib/api";

const BET: Bet = { id: "bet-1", marketId: "mkt-1", bettor: "GADDR1", side: "FighterA", amount: "100000000", placedAt: "2026-06-20T10:00:00Z", claimed: false, payout: null };

afterEach(() => jest.restoreAllMocks());

test("happy path: returns confirmed Bet on success", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(BET) });
  const { result } = renderHook(() => usePlaceBet("mkt-1"));
  let bet: unknown;
  await act(async () => { bet = await result.current.placeBet("FighterA", BigInt(100_000_000)); });
  expect(bet).toEqual(BET);
  expect(result.current.isLoading).toBe(false);
  expect(result.current.error).toBeNull();
});

test("error path: sets error state on 400 response", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}) });
  const { result } = renderHook(() => usePlaceBet("mkt-1"));
  await act(async () => {
    await expect(result.current.placeBet("FighterA", BigInt(100_000_000))).rejects.toThrow();
  });
  expect(result.current.error).toBeInstanceOf(Error);
  expect(result.current.isLoading).toBe(false);
});

test("edge case: isLoading is true while in-flight, false after", async () => {
  let resolve!: (v: unknown) => void;
  global.fetch = jest.fn().mockReturnValue(new Promise((res) => { resolve = res; }));
  const { result } = renderHook(() => usePlaceBet("mkt-1"));
  act(() => { result.current.placeBet("FighterA", BigInt(100_000_000)).catch(() => {}); });
  await waitFor(() => expect(result.current.isLoading).toBe(true));
  await act(async () => { resolve({ ok: true, json: () => Promise.resolve(BET) }); });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
});
