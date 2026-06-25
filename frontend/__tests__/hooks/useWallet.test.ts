import { renderHook, act } from "@testing-library/react";
import { useWallet } from "@/hooks/useWallet";

test("happy path: connect sets address and isConnected", async () => {
  const { result } = renderHook(() => useWallet());
  expect(result.current.address).toBeNull();
  expect(result.current.isConnected).toBe(false);
  await act(async () => { await result.current.connect(); });
  expect(result.current.address).toBe("GABCDEFGHIJKLMNOPQRSTUVWXYZ");
  expect(result.current.isConnected).toBe(true);
});

test("edge case: disconnect clears address and isConnected", async () => {
  const { result } = renderHook(() => useWallet());
  await act(async () => { await result.current.connect(); });
  expect(result.current.isConnected).toBe(true);
  act(() => { result.current.disconnect(); });
  expect(result.current.address).toBeNull();
  expect(result.current.isConnected).toBe(false);
});

test("error path: signTransaction throws when wallet not connected", async () => {
  const { result } = renderHook(() => useWallet());
  await expect(result.current.signTransaction("some-xdr")).rejects.toThrow("Wallet not connected");
});
