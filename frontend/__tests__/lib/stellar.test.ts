import {
  stroopsToXlm,
  xlmToStroops,
  truncateAddress,
  stellarExpertTxUrl,
  stellarExpertContractUrl,
  STELLAR_EXPERT_BASE_URL,
} from '@/lib/stellar';

describe("network normalization", () => {
  it("exposes a single NETWORK constant", () => {
    expect(typeof NETWORK).toBe("string");
    expect(NETWORK.length).toBeGreaterThan(0);
  });

  it("compares network names case-insensitively", () => {
    expect(isSameNetwork("TESTNET", "testnet")).toBe(true);
    expect(isSameNetwork("testnet", "TESTNET")).toBe(true);
    expect(isSameNetwork("TestNet", "testnet")).toBe(true);
  });

  it("flags a genuine mismatch", () => {
    expect(isSameNetwork("PUBLIC", "testnet")).toBe(false);
    expect(isSameNetwork("futurenet", "testnet")).toBe(false);
  });

  it("treats a missing network as no match", () => {
    expect(isSameNetwork(undefined, "testnet")).toBe(false);
    expect(isSameNetwork(null, "testnet")).toBe(false);
    expect(isSameNetwork("", "testnet")).toBe(false);
  });

  it("provides a valid network passphrase", () => {
    expect(typeof NETWORK_PASSPHRASE).toBe("string");
    expect(NETWORK_PASSPHRASE.length).toBeGreaterThan(0);
  });
});

describe("stellarExpertTxUrl", () => {
  it("builds correct URL for a transaction hash", () => {
    const hash = "abc123def456";
    expect(stellarExpertTxUrl(hash)).toBe(`${STELLAR_EXPERT_BASE_URL}/tx/${hash}`);
  });
});

describe("stroopsToXlm", () => {
  it('converts 10,000,000 stroops to "1"', () => {
    expect(stroopsToXlm(10000000n)).toBe("1");
  });

  it("converts 1,234,567 stroops to decimal", () => {
    expect(stroopsToXlm(1234567n)).toBe("0.1234567");
  });

  it('converts 0 stroops to "0"', () => {
    expect(stroopsToXlm(0n)).toBe("0");
  });

  it('converts 2,500,000,000 stroops to "250"', () => {
    expect(stroopsToXlm(2500000000n)).toBe("250");
  });
});

describe("xlmToStroops", () => {
  it('converts "1.5" to 15,000,000n', () => {
    expect(xlmToStroops("1.5")).toBe(15000000n);
  });

  it('converts "10" to 100,000,000n', () => {
    expect(xlmToStroops("10")).toBe(100000000n);
  });

  it('converts "0.123456" to 1,234,560n', () => {
    expect(xlmToStroops("0.123456")).toBe(1234560n);
  });

  it('converts "0.1234567" to 1,234,567n', () => {
    expect(xlmToStroops("0.1234567")).toBe(1234567n);
  });

  it('converts "0.1234568" to 1,234,568n (truncates)', () => {
    expect(xlmToStroops("0.1234568")).toBe(1234568n);
  });

  it('converts "0" to 0n', () => {
    expect(xlmToStroops("0")).toBe(0n);
  });

  it('converts "1.00000000" to 10,000,000n', () => {
    expect(xlmToStroops("1.00000000")).toBe(10000000n);
  });
});

describe('truncateAddress', () => {
  it('truncates long address to GABCDE...WXYZ format', () => {
    const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890WXYZ';
    expect(truncateAddress(address)).toBe('GABCDE...WXYZ');
  });

  it("truncates standard Stellar address", () => {
    const address = "GDIK64BQGMJSJW3IFJJBYEIEK3SOQ3P6NL76O5HCMMEKLCZLZD32X3DY";
    expect(truncateAddress(address)).toBe("GDIK64...X3DY");
  });

  it("returns short addresses unchanged", () => {
    const address = "GDIK64BQ";
    expect(truncateAddress(address)).toBe("GDIK64BQ");
  });

  it("returns empty string for empty input", () => {
    expect(truncateAddress("")).toBe("");
  });

  it("handles empty or falsy input gracefully", () => {
    expect(truncateAddress("" as string)).toBe("");
  });
});

describe('stellarExpertTxUrl', () => {
  it('builds a transaction explorer URL using the network base URL', () => {
    const txHash = 'a1b2c3d4e5f6';
    expect(stellarExpertTxUrl(txHash)).toBe(`${STELLAR_EXPERT_BASE_URL}/tx/${txHash}`);
  });
});

describe('stellarExpertContractUrl', () => {
  it('builds a contract explorer URL using the network base URL', () => {
    const contractId = 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
    expect(stellarExpertContractUrl(contractId)).toBe(
      `${STELLAR_EXPERT_BASE_URL}/contract/${contractId}`
    );
  });
});

