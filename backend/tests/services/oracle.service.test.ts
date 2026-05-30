import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Keypair } from '@stellar/stellar-sdk';
import * as OracleService from '../../src/oracle/OracleService';
import * as StellarService from '../../src/services/StellarService';
import { pool } from '../../src/config/db';

jest.mock('../../src/services/StellarService');
jest.mock('../../src/config/db');

describe('OracleService', () => {
  const mockKeypair = Keypair.random();
  const mockOracleAddress = mockKeypair.publicKey();
  const mockMatchId = 'match-123';
  const mockOutcome: OracleService.FightOutcome = 'fighter_a';
  const mockTxHash = 'tx-hash-123';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ORACLE_PRIVATE_KEY = mockKeypair.secret();
    process.env.ADMIN_PRIVATE_KEY = Keypair.random().secret();
    process.env.ORACLE_WHITELIST = mockOracleAddress;
  });

  afterEach(() => {
    delete process.env.ORACLE_PRIVATE_KEY;
    delete process.env.ADMIN_PRIVATE_KEY;
    delete process.env.ORACLE_WHITELIST;
  });

  describe('submitFightResult', () => {
    it('should submit fight result successfully', async () => {
      const mockMarketResult = {
        rowCount: 1,
        rows: [{ contract_address: 'contract-123' }],
      };

      const mockInsertResult = {
        rowCount: 1,
        rows: [
          {
            id: 1,
            match_id: mockMatchId,
            oracle_address: mockOracleAddress,
            outcome: mockOutcome,
            reported_at: new Date(),
            signature: 'sig-123',
            accepted: true,
            tx_hash: mockTxHash,
          },
        ],
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(mockMarketResult)
        .mockResolvedValueOnce(mockInsertResult);

      (StellarService.invokeContract as jest.Mock).mockResolvedValue(mockTxHash);

      const result = await OracleService.submitFightResult(mockMatchId, mockOutcome);

      expect(result.tx_hash).toBe(mockTxHash);
      expect(result.accepted).toBe(true);
      expect(StellarService.invokeContract).toHaveBeenCalledWith(
        'contract-123',
        'resolve_market',
        expect.any(Array),
      );
    });

    it('should throw error if market not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(OracleService.submitFightResult(mockMatchId, mockOutcome)).rejects.toThrow(
        'Market not found',
      );
    });

    it('should throw error if ORACLE_PRIVATE_KEY not set', async () => {
      delete process.env.ORACLE_PRIVATE_KEY;

      await expect(OracleService.submitFightResult(mockMatchId, mockOutcome)).rejects.toThrow(
        'ORACLE_PRIVATE_KEY env var is required',
      );
    });
  });

  describe('verifyOracleReport', () => {
    it('should verify valid oracle report', async () => {
      const keypair = Keypair.fromSecret(process.env.ORACLE_PRIVATE_KEY!);
      const outcomeIndex = 0; // fighter_a
      const reportedAt = new Date();
      const tsBuf = Buffer.alloc(8);
      tsBuf.writeBigInt64BE(BigInt(reportedAt.getTime()));

      const message = Buffer.concat([
        Buffer.from(mockMatchId, 'utf8'),
        Buffer.from([outcomeIndex]),
        tsBuf,
      ]);

      const signature = Buffer.from(keypair.sign(message)).toString('hex');

      const report = {
        match_id: mockMatchId,
        oracle_address: keypair.publicKey(),
        outcome: mockOutcome,
        reported_at: reportedAt,
        signature,
        accepted: true,
        tx_hash: mockTxHash,
        id: 1,
        created_at: new Date(),
      };

      const isValid = await OracleService.verifyOracleReport(report);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const report = {
        match_id: mockMatchId,
        oracle_address: mockOracleAddress,
        outcome: mockOutcome,
        reported_at: new Date(),
        signature: 'invalid-signature-hex',
        accepted: true,
        tx_hash: mockTxHash,
        id: 1,
        created_at: new Date(),
      };

      const isValid = await OracleService.verifyOracleReport(report);
      expect(isValid).toBe(false);
    });

    it('should reject oracle not in whitelist', async () => {
      delete process.env.ORACLE_WHITELIST;

      const keypair = Keypair.random();
      const outcomeIndex = 0;
      const reportedAt = new Date();
      const tsBuf = Buffer.alloc(8);
      tsBuf.writeBigInt64BE(BigInt(reportedAt.getTime()));

      const message = Buffer.concat([
        Buffer.from(mockMatchId, 'utf8'),
        Buffer.from([outcomeIndex]),
        tsBuf,
      ]);

      const signature = Buffer.from(keypair.sign(message)).toString('hex');

      const report = {
        match_id: mockMatchId,
        oracle_address: keypair.publicKey(),
        outcome: mockOutcome,
        reported_at: reportedAt,
        signature,
        accepted: true,
        tx_hash: mockTxHash,
        id: 1,
        created_at: new Date(),
      };

      const isValid = await OracleService.verifyOracleReport(report);
      expect(isValid).toBe(false);
    });
  });

  describe('raiseDispute', () => {
    it('should raise dispute successfully', async () => {
      const adminKeypair = Keypair.fromSecret(process.env.ADMIN_PRIVATE_KEY!);
      const adminSignature = 'admin-sig-123';

      const mockMarketResult = {
        rowCount: 1,
        rows: [{ contract_address: 'contract-123' }],
      };

      const mockInsertResult = {
        rowCount: 1,
        rows: [
          {
            id: 1,
            match_id: mockMatchId,
            oracle_address: 'admin',
            outcome: mockOutcome,
            reported_at: new Date(),
            signature: adminSignature,
            accepted: true,
            tx_hash: mockTxHash,
          },
        ],
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(mockMarketResult)
        .mockResolvedValueOnce(mockInsertResult);

      (StellarService.invokeContract as jest.Mock).mockResolvedValue(mockTxHash);

      const result = await OracleService.raiseDispute(mockMatchId, mockOutcome, adminSignature);

      expect(result).toBe(mockTxHash);
      expect(StellarService.invokeContract).toHaveBeenCalledWith(
        'contract-123',
        'raise_dispute',
        expect.any(Array),
      );
    });

    it('should throw error if market not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        OracleService.raiseDispute(mockMatchId, mockOutcome, 'sig-123'),
      ).rejects.toThrow('Market not found');
    });
  });

  describe('pollFightResults', () => {
    it('should process locked markets and submit results', async () => {
      const mockMarkets = {
        rowCount: 1,
        rows: [{ market_id: 'market-123', match_id: mockMatchId }],
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(mockMarkets);

      jest.spyOn(OracleService, 'fetchPrimaryResult').mockResolvedValue(mockOutcome);
      jest.spyOn(OracleService, 'submitFightResult').mockResolvedValue({
        id: 1,
        match_id: mockMatchId,
        oracle_address: mockOracleAddress,
        outcome: mockOutcome,
        reported_at: new Date(),
        signature: 'sig-123',
        accepted: true,
        tx_hash: mockTxHash,
        created_at: new Date(),
      });

      await OracleService.pollFightResults();

      expect(OracleService.fetchPrimaryResult).toHaveBeenCalledWith(mockMatchId);
      expect(OracleService.submitFightResult).toHaveBeenCalledWith(mockMatchId, mockOutcome);
    });

    it('should skip markets with no confirmed result', async () => {
      const mockMarkets = {
        rowCount: 1,
        rows: [{ market_id: 'market-123', match_id: mockMatchId }],
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(mockMarkets);

      jest.spyOn(OracleService, 'fetchPrimaryResult').mockResolvedValue(null);

      await OracleService.pollFightResults();

      expect(OracleService.fetchPrimaryResult).toHaveBeenCalledWith(mockMatchId);
    });

    it('should handle API failures gracefully', async () => {
      const mockMarkets = {
        rowCount: 1,
        rows: [{ market_id: 'market-123', match_id: mockMatchId }],
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(mockMarkets);

      jest
        .spyOn(OracleService, 'fetchPrimaryResult')
        .mockRejectedValue(new Error('API error'));

      // Should not throw
      await expect(OracleService.pollFightResults()).resolves.not.toThrow();
    });
  });

  describe('getOraclePublicKey', () => {
    it('should return oracle public key', () => {
      const publicKey = OracleService.getOraclePublicKey();
      expect(publicKey).toBe(mockOracleAddress);
    });

    it('should throw error if ORACLE_PRIVATE_KEY not set', () => {
      delete process.env.ORACLE_PRIVATE_KEY;

      expect(() => OracleService.getOraclePublicKey()).toThrow(
        'ORACLE_PRIVATE_KEY env var is required',
      );
    });
  });
});
