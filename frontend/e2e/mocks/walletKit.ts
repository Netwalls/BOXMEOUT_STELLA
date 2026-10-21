// Swapped in for @creit.tech/stellar-wallets-kit in E2E builds (see next.config.js). The Kit's
// picker is skipped: opening it selects the injected Freighter wallet, and every call goes to
// window.freighterApi through the freighter mock, as before.
import * as freighter from "./freighter";

export const WalletNetwork = { PUBLIC: "PUBLIC", TESTNET: "TESTNET" } as const;

export const FREIGHTER_ID = "freighter";

export function allowAllModules(): unknown[] {
  return [];
}

interface KitOptions {
  network: string;
  selectedWalletId?: string;
  modules: unknown[];
}

export class StellarWalletsKit {
  private walletId: string | undefined;

  constructor(options: KitOptions) {
    this.walletId = options.selectedWalletId;
  }

  openModal({ onWalletSelected }: { onWalletSelected: (option: { id: string }) => void | Promise<void> }): void {
    void onWalletSelected({ id: FREIGHTER_ID });
  }

  setWallet(id: string): void {
    this.walletId = id;
  }

  async getAddress(): Promise<{ address: string }> {
    const result = await freighter.requestAccess();
    if (!result.address) throw new Error("No address returned by the wallet");
    return { address: result.address };
  }

  async getNetwork(): Promise<{ networkPassphrase: string }> {
    const result = await freighter.getNetwork();
    return { networkPassphrase: result.networkPassphrase };
  }

  async signTransaction(xdr: string, opts: { networkPassphrase: string; address: string }): Promise<{ signedTxXdr: string }> {
    const result = await freighter.signTransaction(xdr, opts);
    return { signedTxXdr: result.signedTxXdr };
  }

  async signMessage(): Promise<{ signedMessage: string }> {
    throw new Error("signMessage is not mocked in E2E builds");
  }

  disconnect(): void {
    this.walletId = undefined;
  }
}
