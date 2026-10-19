const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

const ORIGINAL_ENV = process.env;

function loadConfig(env: Record<string, string>) {
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: "http://localhost:3001", ...env };

  let loaded: typeof import("@/lib/config") | undefined;
  jest.isolateModules(() => {
    loaded = require("@/lib/config");
  });

  return loaded as typeof import("@/lib/config");
}

describe("lib/config", () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("exposes the factory contract ID under the name used in .env.example", () => {
    const config = loadConfig({ NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID: "CFACTORY" });

    expect(config.MARKET_FACTORY_CONTRACT_ID).toBe("CFACTORY");
  });

  it("derives the passphrase from the network when none is set", () => {
    const config = loadConfig({ NEXT_PUBLIC_STELLAR_NETWORK: "testnet" });

    expect(config.NETWORK_PASSPHRASE).toBe(TESTNET_PASSPHRASE);
  });

  it("rejects mainnet with a non-mainnet passphrase", () => {
    expect(() =>
      loadConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: "mainnet",
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: TESTNET_PASSPHRASE,
        NEXT_PUBLIC_SOROBAN_RPC_URL: "https://rpc.example.org",
      })
    ).toThrow("NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE");
  });

  it("rejects mainnet with a non-HTTPS RPC URL", () => {
    expect(() =>
      loadConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: "mainnet",
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: MAINNET_PASSPHRASE,
        NEXT_PUBLIC_SOROBAN_RPC_URL: "http://rpc.example.org",
      })
    ).toThrow("NEXT_PUBLIC_SOROBAN_RPC_URL");
  });

  it("accepts mainnet with the mainnet passphrase and an HTTPS RPC URL", () => {
    const config = loadConfig({
      NEXT_PUBLIC_STELLAR_NETWORK: "mainnet",
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: MAINNET_PASSPHRASE,
      NEXT_PUBLIC_SOROBAN_RPC_URL: "https://rpc.example.org",
    });

    expect(config.NETWORK_PASSPHRASE).toBe(MAINNET_PASSPHRASE);
    expect(config.SOROBAN_RPC_URL).toBe("https://rpc.example.org");
  });

  it("parses the comma-separated admin address list", () => {
    const config = loadConfig({ NEXT_PUBLIC_ADMIN_ADDRESSES: "GADMIN1, GADMIN2," });

    expect(config.ADMIN_ADDRESSES).toEqual(["GADMIN1", "GADMIN2"]);
  });
});
