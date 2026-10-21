import { renderHook, act } from "@testing-library/react";
import { useVisibilityInterval } from "@/hooks/useVisibilityInterval";

describe("useVisibilityInterval", () => {
  let hiddenSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    hiddenSpy = jest.spyOn(document, "hidden", "get").mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    hiddenSpy.mockRestore();
  });

  it("fires immediately on mount and periodically at each interval", () => {
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, 1000));

    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(2);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(callback).toHaveBeenCalledTimes(4);
  });

  it("does not start interval or fire callback when delay is null", () => {
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, null));

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("pauses interval when document becomes hidden", () => {
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, 1000));

    expect(callback).toHaveBeenCalledTimes(1);

    // Document hides
    hiddenSpy.mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("resumes interval and fires immediately when document becomes visible again", () => {
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, 1000));

    expect(callback).toHaveBeenCalledTimes(1);

    // Hide
    hiddenSpy.mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Make visible again
    hiddenSpy.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Should fire immediately upon becoming visible
    expect(callback).toHaveBeenCalledTimes(2);

    // And continue ticking
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("does not start if mounted while document is already hidden", () => {
    hiddenSpy.mockReturnValue(true);
    const callback = jest.fn();
    renderHook(() => useVisibilityInterval(callback, 1000));

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(callback).not.toHaveBeenCalled();

    // Becomes visible
    hiddenSpy.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cleans up event listener and clears interval on unmount", () => {
    const removeEventListenerSpy = jest.spyOn(document, "removeEventListener");
    const callback = jest.fn();
    const { unmount } = renderHook(() => useVisibilityInterval(callback, 1000));

    expect(callback).toHaveBeenCalledTimes(1);
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
