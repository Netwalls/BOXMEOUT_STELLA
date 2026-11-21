import { copyToClipboard } from "./clipboard";

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true, writable: true });
}

function setExecCommand(impl: (cmd: string) => boolean) {
  Object.defineProperty(document, "execCommand", {
    value: jest.fn(impl),
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setClipboard(undefined);
  Object.defineProperty(document, "execCommand", { value: undefined, configurable: true, writable: true });
});

describe("copyToClipboard", () => {
  it("uses the async Clipboard API and returns true on success", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await expect(copyToClipboard("GABC")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("GABC");
  });

  it("falls back to execCommand when the Clipboard API rejects", async () => {
    setClipboard({ writeText: jest.fn().mockRejectedValue(new Error("denied")) });
    setExecCommand(() => true);
    await expect(copyToClipboard("GABC")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when the Clipboard API is missing", async () => {
    setClipboard(undefined);
    setExecCommand(() => true);
    await expect(copyToClipboard("GABC")).resolves.toBe(true);
  });

  it("removes the temporary textarea after the fallback runs", async () => {
    setClipboard(undefined);
    setExecCommand(() => true);
    await copyToClipboard("GABC");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("returns false when every method fails", async () => {
    setClipboard({ writeText: jest.fn().mockRejectedValue(new Error("denied")) });
    setExecCommand(() => false);
    await expect(copyToClipboard("GABC")).resolves.toBe(false);
  });

  it("returns false without throwing when execCommand itself throws", async () => {
    setClipboard(undefined);
    setExecCommand(() => {
      throw new Error("not allowed");
    });
    await expect(copyToClipboard("GABC")).resolves.toBe(false);
  });
});
