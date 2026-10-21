import { allowHttpForRpc } from "../../lib/stellar";

describe("allowHttpForRpc", () => {
  const development = { production: false, network: "testnet" };

  it("allows HTTPS RPC URLs without enabling allowHttp", () => {
    expect(allowHttpForRpc("https://soroban-testnet.stellar.org", development)).toBe(false);
    expect(allowHttpForRpc("https://rpc.example.com", { production: true, network: "mainnet" })).toBe(
      false
    );
  });

  it("allows plain HTTP only for localhost outside production", () => {
    expect(allowHttpForRpc("http://localhost:8000", development)).toBe(true);
    expect(allowHttpForRpc("http://127.0.0.1:8000", development)).toBe(true);
  });

  it("rejects plain HTTP to a non-local host", () => {
    expect(() => allowHttpForRpc("http://rpc.example.com", development)).toThrow(
      "HTTPS required"
    );
  });

  it("rejects plain HTTP to localhost in production", () => {
    expect(() =>
      allowHttpForRpc("http://localhost:8000", { production: true, network: "testnet" })
    ).toThrow("HTTPS required");
  });

  it("rejects plain HTTP to localhost on mainnet", () => {
    expect(() =>
      allowHttpForRpc("http://localhost:8000", { production: false, network: "mainnet" })
    ).toThrow("HTTPS required");
  });

  it("rejects a malformed URL", () => {
    expect(() => allowHttpForRpc("not a url", development)).toThrow();
  });
});
