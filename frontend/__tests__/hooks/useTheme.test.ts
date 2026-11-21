import { act, renderHook } from "@testing-library/react";
import { useTheme } from "@/hooks/useTheme";
import { THEME_INIT } from "@/components/ThemeScript";

type Listener = (event: { matches: boolean }) => void;

function mockSystem(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<Listener>();
  const media = {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  window.matchMedia = jest.fn().mockImplementation(() => media) as unknown as typeof window.matchMedia;
  return {
    setDark(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
  };
}

describe("useTheme three-state preference (F-152)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("defaults to system and follows the OS light setting", () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows OS changes live while in system mode", () => {
    const os = mockSystem(false);
    const { result } = renderHook(() => useTheme());
    act(() => os.setDark(true));
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("stays fixed to light or dark regardless of the OS", () => {
    const os = mockSystem(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference("light"));
    expect(result.current.theme).toBe("light");
    act(() => os.setDark(false));
    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("returns to following the OS when system is selected again", () => {
    const os = mockSystem(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference("dark"));
    expect(result.current.theme).toBe("dark");
    act(() => result.current.setPreference("system"));
    expect(result.current.theme).toBe("light");
    act(() => os.setDark(true));
    expect(result.current.theme).toBe("dark");
  });

  it("restores a stored choice on mount and treats corrupt values as system", () => {
    mockSystem(true);
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("light");

    localStorage.setItem("theme", "banana");
    const second = renderHook(() => useTheme());
    expect(second.result.current.preference).toBe("system");
  });

  it("tolerates localStorage throwing", () => {
    mockSystem(false);
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderHook(() => useTheme());
    expect(() => act(() => result.current.setPreference("dark"))).not.toThrow();
    expect(result.current.theme).toBe("dark");
    spy.mockRestore();
  });

  it("pre-paint script resolves system, stored and corrupt values the same way", () => {
    const run = () => new Function(THEME_INIT)();
    mockSystem(true);
    localStorage.setItem("theme", "system");
    run();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    localStorage.setItem("theme", "light");
    run();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    localStorage.setItem("theme", "nope");
    run();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
