import { jest } from '@jest/globals';

export const isConnected = jest.fn(async () => ({ isConnected: true }));

export const getPublicKey = jest.fn(async () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');

export const getNetwork = jest.fn(async () => ({
  network: 'TESTNET',
  networkPassphrase: 'Test SDF Network ; September 2015',
}));

export const signTransaction = jest.fn(
  async (xdr: string, _opts?: { networkPassphrase?: string; address?: string }) => ({
    signedTxXdr: xdr,
    signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  }),
);

export const requestAccess = jest.fn(async () => ({ address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' }));

export const setAllowed = jest.fn(async () => ({ isAllowed: true }));

export const getAddress = jest.fn(async () => ({ address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' }));

export default {
  isConnected,
  getPublicKey,
  getNetwork,
  signTransaction,
  requestAccess,
  setAllowed,
  getAddress,
};
