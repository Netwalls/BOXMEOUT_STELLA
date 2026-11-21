import {
  consoleSink,
  noopSink,
  redactContext,
  redactString,
  reportError,
  resetTelemetryDedupe,
  selectSink,
} from "./telemetry";

const ADDRESS = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const SECRET = "SBZ4VHSSDBSDZ3PNIZ7SALJQRV5PYZVFDTDMVR4LE7F4G3OIBQHX5YEX";

describe("sink selection (F-154)", () => {
  it("uses the HTTP sink when an endpoint is configured", () => {
    const fetchMock = jest.fn().mockResolvedValue({});
    global.fetch = fetchMock as unknown as typeof fetch;
    selectSink({ endpoint: "https://errors.example.test/ingest", nodeEnv: "production" })({
      name: "Error",
      message: "boom",
      context: {},
      timestamp: "t",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://errors.example.test/ingest",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uses the console sink in development when no endpoint is set", () => {
    expect(selectSink({ nodeEnv: "development" })).toBe(consoleSink);
  });

  it("is a no-op in production when no endpoint is set", () => {
    expect(selectSink({ nodeEnv: "production" })).toBe(noopSink);
  });
});

describe("redaction (F-154)", () => {
  it("removes full account addresses and secret keys from strings", () => {
    expect(redactString(`paid from ${ADDRESS}`)).toBe("paid from [redacted-address]");
    expect(redactString(SECRET)).toBe("[redacted-address]");
  });

  it("drops values under sensitive keys and long signed-XDR-like blobs", () => {
    const xdr = "A".repeat(200);
    const out = redactContext({
      source: "usePortfolio",
      secretKey: SECRET,
      signedXdr: "anything",
      nested: { wallet: ADDRESS, blob: xdr },
    });
    expect(out).toEqual({
      source: "usePortfolio",
      secretKey: "[redacted]",
      signedXdr: "[redacted]",
      nested: { wallet: "[redacted-address]", blob: "[redacted-blob]" },
    });
  });

  it("never sends an address or secret in the report body", () => {
    const fetchMock = jest.fn().mockResolvedValue({});
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.NEXT_PUBLIC_ERROR_REPORT_URL = "https://errors.example.test/ingest";
    resetTelemetryDedupe();

    reportError(new Error(`failed for ${ADDRESS}`), { owner: ADDRESS, secret: SECRET });

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain(ADDRESS);
    expect(body).not.toContain(SECRET);
    delete process.env.NEXT_PUBLIC_ERROR_REPORT_URL;
  });
});

describe("reportError duplicate suppression (F-154)", () => {
  beforeEach(() => {
    resetTelemetryDedupe();
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("sends an identical error once within the window", () => {
    // Same call site, as in a render loop: the fingerprint matches.
    const fire = () => reportError(new Error("same"));
    fire();
    fire();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("sends again after the window has passed", () => {
    jest.useFakeTimers();
    const fire = () => reportError(new Error("again"));
    fire();
    jest.advanceTimersByTime(6000);
    fire();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
