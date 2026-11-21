import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { fetchReadiness, STATUS_PROBE_TIMEOUT_MS } from "@/lib/api";
import StatusPage from "./page";
import { deriveOverallState, probeStatus } from "@/lib/status";

const OK_READY = {
  status: "ok",
  checks: {
    db: { status: "ok" },
    redis: { status: "ok" },
    rpc: { status: "ok" },
  },
};

const DEGRADED_READY = {
  status: "not_ready",
  checks: {
    db: { status: "ok" },
    redis: { status: "error", error: "connection refused" },
    rpc: { status: "ok" },
  },
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: () => Promise.resolve({ data: body }),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

/** Routes fetch by URL so each probe can be scripted independently. */
function mockEndpoints(routes: Record<string, () => Promise<unknown>>) {
  global.fetch = jest.fn((url: string) => {
    const key = Object.keys(routes).find((path) => url.endsWith(path));
    if (!key) return Promise.reject(new Error(`unexpected url ${url}`));
    return routes[key]();
  }) as unknown as typeof fetch;
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("deriveOverallState", () => {
  it("is loading before the first probe completes", () => {
    expect(deriveOverallState(null)).toBe("loading");
  });

  it("is healthy when the API is reachable and every dependency is ok", () => {
    expect(
      deriveOverallState({ apiReachable: true, readiness: OK_READY as never, readinessError: null })
    ).toBe("healthy");
  });

  it("is degraded when readiness reports not_ready", () => {
    expect(
      deriveOverallState({ apiReachable: true, readiness: DEGRADED_READY as never, readinessError: null })
    ).toBe("degraded");
  });

  it("is degraded when the API is reachable but the readiness probe failed", () => {
    expect(deriveOverallState({ apiReachable: true, readiness: null, readinessError: "timeout" })).toBe("degraded");
  });

  it("is unreachable when the health probe failed", () => {
    expect(
      deriveOverallState({ apiReachable: false, readiness: OK_READY as never, readinessError: null })
    ).toBe("unreachable");
  });
});

describe("fetchReadiness", () => {
  it("returns the report for a 503 not_ready response instead of throwing", async () => {
    mockEndpoints({ "/ready": () => Promise.resolve(jsonResponse(503, DEGRADED_READY)) });
    await expect(fetchReadiness()).resolves.toEqual(DEGRADED_READY);
  });

  it("rejects when the endpoint never answers within the timeout", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const pending = expect(fetchReadiness(STATUS_PROBE_TIMEOUT_MS)).rejects.toThrow(/timed out/);
    await act(async () => {
      jest.advanceTimersByTime(STATUS_PROBE_TIMEOUT_MS);
    });
    await pending;
  });
});

describe("probeStatus", () => {
  it("reports healthy when health and readiness both succeed", async () => {
    mockEndpoints({
      "/health": () => Promise.resolve(jsonResponse(200, { status: "ok" })),
      "/ready": () => Promise.resolve(jsonResponse(200, OK_READY)),
    });
    const snapshot = await probeStatus();
    expect(deriveOverallState(snapshot)).toBe("healthy");
  });

  it("reports unreachable when /health rejects", async () => {
    mockEndpoints({
      "/health": () => Promise.reject(new TypeError("Failed to fetch")),
      "/ready": () => Promise.resolve(jsonResponse(200, OK_READY)),
    });
    const snapshot = await probeStatus();
    expect(snapshot.apiReachable).toBe(false);
    expect(deriveOverallState(snapshot)).toBe("unreachable");
  });

  it("reports degraded with a message when /ready returns an unexpected status", async () => {
    mockEndpoints({
      "/health": () => Promise.resolve(jsonResponse(200, { status: "ok" })),
      "/ready": () => Promise.resolve(jsonResponse(500, {})),
    });
    const snapshot = await probeStatus();
    expect(deriveOverallState(snapshot)).toBe("degraded");
    expect(snapshot.readinessError).toBeTruthy();
  });
});

describe("StatusPage", () => {
  it("renders the healthy state with dependency rows and config", async () => {
    mockEndpoints({
      "/health": () => Promise.resolve(jsonResponse(200, { status: "ok" })),
      "/ready": () => Promise.resolve(jsonResponse(200, OK_READY)),
    });
    render(<StatusPage />);
    expect(await screen.findByText("All systems operational")).toBeInTheDocument();
    expect(screen.getByText("db")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("renders the degraded state and names the failing dependency", async () => {
    mockEndpoints({
      "/health": () => Promise.resolve(jsonResponse(200, { status: "ok" })),
      "/ready": () => Promise.resolve(jsonResponse(503, DEGRADED_READY)),
    });
    render(<StatusPage />);
    expect(await screen.findByText(/Degraded/)).toBeInTheDocument();
    expect(screen.getByText("Failing")).toBeInTheDocument();
  });

  it("renders the unreachable state when the API does not respond", async () => {
    mockEndpoints({
      "/health": () => Promise.reject(new TypeError("Failed to fetch")),
      "/ready": () => Promise.reject(new TypeError("Failed to fetch")),
    });
    render(<StatusPage />);
    expect(await screen.findByText(/Unreachable/)).toBeInTheDocument();
    expect(screen.getByText("The API health endpoint did not respond.")).toBeInTheDocument();
  });

  it("announces the state through a polite live region", async () => {
    mockEndpoints({
      "/health": () => Promise.resolve(jsonResponse(200, { status: "ok" })),
      "/ready": () => Promise.resolve(jsonResponse(200, OK_READY)),
    });
    render(<StatusPage />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("All systems operational"));
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
