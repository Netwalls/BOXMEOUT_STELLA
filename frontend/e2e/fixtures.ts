import { test as base, expect } from "@playwright/test";

// Must match E2E_ADDRESS in e2e/mock-api.mjs
export const E2E_ADDRESS = "GE2ETESTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWXYZ";
export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export interface FreighterCall {
  method: string;
  args: unknown[];
}

interface E2EWindow {
  freighterApi: unknown;
  __freighterCalls: FreighterCall[];
}

interface Fixtures {
  freighterCalls: () => Promise<FreighterCall[]>;
}

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    // Runs before any app code, so useWallet finds the mock on first call
    await page.addInitScript(
      ({ address, passphrase }) => {
        const w = window as unknown as E2EWindow;
        w.__freighterCalls = [];

        const record =
          (method: string, result: unknown) =>
          (...args: unknown[]): Promise<unknown> => {
            w.__freighterCalls.push({ method, args });
            return Promise.resolve(result);
          };

        w.freighterApi = {
          isConnected: record("isConnected", { isConnected: true }),
          requestAccess: record("requestAccess", { address }),
          getNetwork: record("getNetwork", { network: "TESTNET", networkPassphrase: passphrase }),
          signTransaction: (...args: unknown[]): Promise<unknown> => {
            w.__freighterCalls.push({ method: "signTransaction", args });
            return Promise.resolve({ signedTxXdr: `SIGNED:${String(args[0])}`, signerAddress: address });
          },
        };
      },
      { address: E2E_ADDRESS, passphrase: TESTNET_PASSPHRASE }
    );

    await use(page);
  },

  freighterCalls: async ({ page }, use) => {
    await use(() => page.evaluate(() => (window as unknown as E2EWindow).__freighterCalls));
  },
});

export { expect };
