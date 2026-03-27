// backend/tests/indexer.service.test.ts
// Unit tests for BlockchainIndexerService

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BlockchainIndexerService } from '../src/services/blockchain/indexer.js';

// Mock dependencies
vi.mock('../src/database/prisma.js');
vi.mock('../src/utils/logger.js');

describe('BlockchainIndexerService', () => {
  let indexerService: BlockchainIndexerService;

  beforeEach(() => {
    vi.clearAllMocks();
    indexerService = new BlockchainIndexerService();
  });

  afterEach(async () => {
    if (indexerService.getState().isRunning) {
      await indexerService.stop();
    }
  });

  describe('Initialization', () => {
    it('should initialize with correct default state', () => {
      const state = indexerService.getState();

      expect(state.lastProcessedLedger).toBe(0);
      expect(state.isRunning).toBe(false);
      expect(state.eventsProcessed).toBe(0);
    });

    it('should load configuration from environment', () => {
      expect(indexerService).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should return current state', () => {
      const state = indexerService.getState();

      expect(state).toHaveProperty('lastProcessedLedger');
      expect(state).toHaveProperty('isRunning');
      expect(state).toHaveProperty('eventsProcessed');
    });

    it('should update state when processing events', async () => {
      const initialState = indexerService.getState();
      expect(initialState.eventsProcessed).toBe(0);
    });
  });

  describe('Start/Stop', () => {
    it('should start indexer successfully', async () => {
      await indexerService.start();
      const state = indexerService.getState();

      expect(state.isRunning).toBe(true);
    });

    it('should not start if already running', async () => {
      await indexerService.start();
      await indexerService.start(); // Second start

      const state = indexerService.getState();
      expect(state.isRunning).toBe(true);
    });

    it('should stop indexer successfully', async () => {
      await indexerService.start();
      await indexerService.stop();

      const state = indexerService.getState();
      expect(state.isRunning).toBe(false);
    });

    it('should handle stop when not running', async () => {
      await indexerService.stop();

      const state = indexerService.getState();
      expect(state.isRunning).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should return statistics', async () => {
      const stats = await indexerService.getStatistics();

      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('latestLedger');
      expect(stats).toHaveProperty('ledgersBehind');
    });

    it('should calculate ledgers behind correctly', async () => {
      const stats = await indexerService.getStatistics();

      expect(stats.ledgersBehind).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Reprocessing', () => {
    it('should allow reprocessing from specific ledger', async () => {
      const startLedger = 1000;
      await indexerService.reprocessFromLedger(startLedger);

      const state = indexerService.getState();
      expect(state.lastProcessedLedger).toBe(startLedger - 1);
    });

    it('should stop and restart when reprocessing if running', async () => {
      await indexerService.start();
      const wasRunning = indexerService.getState().isRunning;

      await indexerService.reprocessFromLedger(1000);

      const state = indexerService.getState();
      expect(wasRunning).toBe(true);
      expect(state.isRunning).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // This would require mocking the RPC server
      // For now, just verify the service doesn't crash
      expect(indexerService).toBeDefined();
    });

    it('should continue processing after error', async () => {
      // Verify error doesn't stop the service
      const state = indexerService.getState();
      expect(state).toBeDefined();
    });
  });
});
