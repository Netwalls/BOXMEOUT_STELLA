import { render, screen, act } from "@testing-library/react";
import { CountdownTimer } from "./CountdownTimer";

const START = new Date("2026-01-01T00:00:00Z");

describe("CountdownTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: START });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the label and the time left as HH:MM:SS", () => {
    const target = Math.floor(START.getTime() / 1000) + 3725; // 1h 2m 5s
    render(<CountdownTimer targetTimestamp={target} label="Betting closes in" />);

    expect(screen.getByRole("status")).toHaveTextContent("Betting closes in: 01:02:05");
  });

  it("counts down every second", () => {
    const target = Math.floor(START.getTime() / 1000) + 65;
    render(<CountdownTimer targetTimestamp={target} label="Closes" />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("00:01:04")).toBeInTheDocument();
  });

  it("switches to the default expired label once the target has passed", () => {
    const target = Math.floor(START.getTime() / 1000) + 2;
    render(<CountdownTimer targetTimestamp={target} label="Closes" />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.queryByText("Closes:")).not.toBeInTheDocument();
  });

  it("uses a custom expired label when given", () => {
    const target = Math.floor(START.getTime() / 1000) - 10;
    render(<CountdownTimer targetTimestamp={target} label="Closes" expiredLabel="Locked" />);

    expect(screen.getByText("Locked")).toBeInTheDocument();
  });
});
