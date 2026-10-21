// Swapped in for @stellar/freighter-api in E2E builds (see next.config.js) so
// Playwright can drive the wallet through an injected window.freighterApi
// instead of the real browser extension.
import type * as Freighter from "@stellar/freighter-api";

export type FreighterApiMock = Pick<
  typeof Freighter,
  "isConnected" | "requestAccess" | "getNetwork" | "signTransaction"
>;

declare global {
  interface Window {
    freighterApi?: FreighterApiMock;
  }
}

function injected(): FreighterApiMock {
  // Throwing mirrors a missing extension; useWallet treats it as "not installed"
  if (!window.freighterApi) throw new Error("window.freighterApi is not injected");
  return window.freighterApi;
}

export const isConnected: FreighterApiMock["isConnected"] = async (...args) =>
  injected().isConnected(...args);

export const requestAccess: FreighterApiMock["requestAccess"] = async (...args) =>
  injected().requestAccess(...args);

export const getNetwork: FreighterApiMock["getNetwork"] = async (...args) =>
  injected().getNetwork(...args);

export const signTransaction: FreighterApiMock["signTransaction"] = async (...args) =>
  injected().signTransaction(...args);
