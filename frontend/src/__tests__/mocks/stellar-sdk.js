module.exports = {
  Contract: class {},
  Networks: { PUBLIC: 'Public Global Stellar Network ; September 2015', TESTNET: 'Test SDF Network ; September 2015' },
  SorobanRpc: { Server: class {} },
  TransactionBuilder: class { static fromXDR() {} },
  BASE_FEE: '100',
  nativeToScVal: jest.fn(),
  Address: class { toScVal() {} },
  xdr: {},
};
