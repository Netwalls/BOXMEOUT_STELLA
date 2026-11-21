import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { CopyButton, COPY_FEEDBACK_MS } from "./CopyButton";

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true, writable: true });
}

afterEach(() => {
  jest.useRealTimers();
  setClipboard(undefined);
  Object.defineProperty(document, "execCommand", { value: undefined, configurable: true, writable: true });
});

describe("CopyButton", () => {
  it("copies the value, shows the copied label and announcing text, then resets", async () => {
    jest.useFakeTimers();
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const onResult = jest.fn();

    render(
      <CopyButton value="GABC" label="Copy address" copiedLabel="Address copied" onResult={onResult} />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    });

    expect(writeText).toHaveBeenCalledWith("GABC");
    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Address copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Copied to clipboard");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");

    act(() => {
      jest.advanceTimersByTime(COPY_FEEDBACK_MS);
    });

    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces a failure and keeps the idle label when every copy method fails", async () => {
    setClipboard({ writeText: jest.fn().mockRejectedValue(new Error("denied")) });
    Object.defineProperty(document, "execCommand", { value: jest.fn(() => false), configurable: true, writable: true });
    const onResult = jest.fn();

    render(
      <CopyButton
        value="GABC"
        label="Copy address"
        failedMessage="Could not copy address"
        onResult={onResult}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    });

    expect(onResult).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Could not copy address");
  });

  it("renders visible children next to the icon", () => {
    render(<CopyButton value="x" label="Copy value">Copy</CopyButton>);
    expect(screen.getByRole("button", { name: "Copy value" })).toHaveTextContent("Copy");
  });
});
