import {
  buildConnectSrc,
  buildSecurityHeaders,
  HORIZON_URLS,
} from "@/lib/security-headers";

const API_URL = "http://localhost:3001";

function headerValue(headers: { key: string; value: string }[], key: string): string {
  const header = headers.find((h) => h.key === key);
  if (!header) throw new Error(`missing header ${key}`);
  return header.value;
}

function directive(csp: string, name: string): string[] {
  const match = csp.split("; ").find((d) => d.startsWith(`${name} `));
  if (!match) throw new Error(`missing directive ${name}`);
  return match.split(" ").slice(1);
}

describe("buildConnectSrc", () => {
  it("allows the API, Horizon for the network and the Soroban RPC", () => {
    const sources = buildConnectSrc({
      apiUrl: "https://api.boxmeout.example/v1",
      sorobanRpcUrl: "https://soroban-testnet.stellar.org",
      network: "testnet",
    });

    expect(sources).toEqual([
      "'self'",
      "https://api.boxmeout.example",
      HORIZON_URLS.testnet,
      "https://soroban-testnet.stellar.org",
    ]);
  });

  it("omits the RPC origin when none is configured", () => {
    const sources = buildConnectSrc({ apiUrl: API_URL, network: "mainnet" });

    expect(sources).toEqual(["'self'", API_URL, HORIZON_URLS.mainnet]);
  });

  it("names the variable when the API URL is invalid", () => {
    expect(() =>
      buildConnectSrc({ apiUrl: "not a url", network: "testnet" })
    ).toThrow("NEXT_PUBLIC_API_URL must be a valid URL");
  });
});

describe("buildSecurityHeaders", () => {
  it("sets the clickjacking, referrer, sniffing and permissions headers", () => {
    const headers = buildSecurityHeaders({ isDev: false, apiUrl: API_URL, network: "testnet" });

    expect(headerValue(headers, "X-Frame-Options")).toBe("DENY");
    expect(headerValue(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerValue(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(headers, "Permissions-Policy")).toContain("camera=()");
  });

  it("builds connect-src from the configured API origin", () => {
    const headers = buildSecurityHeaders({ isDev: false, apiUrl: API_URL, network: "testnet" });
    const csp = headerValue(headers, "Content-Security-Policy");

    expect(directive(csp, "connect-src")).toContain("http://localhost:3001");
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("allows eval in scripts only in development", () => {
    const prod = headerValue(
      buildSecurityHeaders({ isDev: false, apiUrl: API_URL, network: "testnet" }),
      "Content-Security-Policy"
    );
    const dev = headerValue(
      buildSecurityHeaders({ isDev: true, apiUrl: API_URL, network: "testnet" }),
      "Content-Security-Policy"
    );

    expect(directive(prod, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });
});
