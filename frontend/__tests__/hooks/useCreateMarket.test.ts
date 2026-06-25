import { renderHook, act, waitFor } from "@testing-library/react";
import { useCreateMarket } from "@/hooks/useCreateMarket";
import type { CreateMarketFormData } from "@/components/CreateMarketForm";

const FORM_DATA: CreateMarketFormData = {
  fighterAName: "Ali", fighterARecord: "20-0", fighterANationality: "USA", fighterAWeightClass: "HW",
  fighterBName: "Foreman", fighterBRecord: "18-2", fighterBNationality: "USA", fighterBWeightClass: "HW",
  scheduledAt: "2026-07-01T20:00:00Z", bettingEndsAt: "2026-07-01T19:00:00Z", oracleAddress: "GORACLE",
};

afterEach(() => jest.restoreAllMocks());

test("happy path: returns new market_id on success", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ market_id: "mkt-new" }) });
  const { result } = renderHook(() => useCreateMarket());
  let id: string | undefined;
  await act(async () => { id = await result.current.createMarket(FORM_DATA); });
  expect(id).toBe("mkt-new");
  expect(result.current.error).toBeNull();
  expect(result.current.isLoading).toBe(false);
});

test("error path: sets error on 422 response", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, json: () => Promise.resolve({}) });
  const { result } = renderHook(() => useCreateMarket());
  await act(async () => {
    await expect(result.current.createMarket(FORM_DATA)).rejects.toThrow();
  });
  expect(result.current.error).toBeInstanceOf(Error);
});

test("edge case: isLoading is true during request, false after completion", async () => {
  let resolve!: (v: unknown) => void;
  global.fetch = jest.fn().mockReturnValue(new Promise((res) => { resolve = res; }));
  const { result } = renderHook(() => useCreateMarket());
  act(() => { result.current.createMarket(FORM_DATA).catch(() => {}); });
  await waitFor(() => expect(result.current.isLoading).toBe(true));
  await act(async () => { resolve({ ok: true, json: () => Promise.resolve({ market_id: "mkt-new" }) }); });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
});
