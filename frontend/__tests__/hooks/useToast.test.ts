import { renderHook, act } from "@testing-library/react";
import { useToast } from "@/hooks/useToast";

afterEach(() => jest.useRealTimers());

test("happy path: showToast adds a toast to the list", () => {
  const { result } = renderHook(() => useToast());
  act(() => { result.current.showToast("Bet placed!", "success"); });
  expect(result.current.toasts).toHaveLength(1);
  expect(result.current.toasts[0].message).toBe("Bet placed!");
  expect(result.current.toasts[0].type).toBe("success");
});

test("error path: dismissToast removes the correct toast by id", () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useToast());
  act(() => { result.current.showToast("First", "success"); });
  // Advance time so second toast gets a different Date.now() ID
  act(() => { jest.advanceTimersByTime(1); });
  act(() => { result.current.showToast("Second", "error"); });
  expect(result.current.toasts).toHaveLength(2);
  const firstId = result.current.toasts[0].id;
  act(() => { result.current.dismissToast(firstId); });
  expect(result.current.toasts).toHaveLength(1);
  expect(result.current.toasts[0].message).toBe("Second");
});

test("edge case: toast auto-dismisses after 5 seconds", () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useToast());
  act(() => { result.current.showToast("Auto dismiss", "info"); });
  expect(result.current.toasts).toHaveLength(1);
  act(() => { jest.advanceTimersByTime(5000); });
  expect(result.current.toasts).toHaveLength(0);
});

test("edge case: multiple toasts auto-dismiss independently", () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useToast());
  act(() => { result.current.showToast("A", "success"); });
  act(() => { jest.advanceTimersByTime(2000); });
  act(() => { result.current.showToast("B", "error"); });
  act(() => { jest.advanceTimersByTime(3000); }); // A fires at 5s total
  expect(result.current.toasts).toHaveLength(1);
  expect(result.current.toasts[0].message).toBe("B");
  act(() => { jest.advanceTimersByTime(2000); }); // B fires
  expect(result.current.toasts).toHaveLength(0);
});
