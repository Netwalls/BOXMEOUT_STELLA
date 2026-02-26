// backend/src/controllers/oracle.controller.ts
// Oracle controller - handles attestation, resolution, and claims

import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { MarketService } from '../services/market.service.js';
import { oracleService } from '../services/blockchain/oracle.js';
import { marketBlockchainService } from '../services/blockchain/market.js';
import { logger } from '../utils/logger.js';

export class OracleController {
  private marketService: MarketService;

  constructor() {
    this.marketService = new MarketService();
  }

  /**
   * POST /api/markets/:id/attest
   * Admin/Attestor Only
   */
  async attestMarket(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // params and body are already validated by middleware
      const marketId = String(req.params.id);
      const { outcome } = req.body;
      const market = await this.marketService.getMarketDetails(marketId);

      const nextIndex = (market as any).attestationCount || 0;

      const result = await oracleService.submitAttestation(
        market.contractAddress,
        outcome,
        nextIndex
      );

      // Record this individual attestation in DB
      await this.marketService.addAttestation(
        marketId,
        result.oraclePublicKey,
        outcome,
        result.txHash
      );

      const threshold = parseInt(
        process.env.ORACLE_CONSENSUS_THRESHOLD || '3',
        10
      );
      const newCount = nextIndex + 1;

      let autoResolved = false;
      let resolutionTxHash = undefined;

      // Auto-resolve when consensus threshold met
      if (newCount >= threshold) {
        // Double check on-chain consensus
        const winningOutcome = await oracleService.checkConsensus(
          market.contractAddress
        );
        if (winningOutcome !== null) {
          const blockchainResult = await marketBlockchainService.resolveMarket(
            market.contractAddress
          );
          await this.marketService.resolveMarket(
            marketId,
            winningOutcome,
            'Oracle Consensus Auto-Resolution'
          );
          autoResolved = true;
          resolutionTxHash = blockchainResult.txHash;
        }
      }

      res.json({
        success: true,
        data: {
          txHash: result.txHash,
          marketId,
          outcome,
          oraclePublicKey: result.oraclePublicKey,
          autoResolved,
          resolutionTxHash,
        },
      });
    } catch (error) {
      (req.log || logger).error('Attest error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Attestation failed',
      });
    }
  }

  /**
   * POST /api/markets/:id/resolve
   * Admin Only
   */
  async resolveMarket(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const marketId = String(req.params.id);
      const market = await this.marketService.getMarketDetails(marketId);

      // 1. Check if consensus reached on-chain
      const winningOutcome = await oracleService.checkConsensus(
        market.contractAddress
      );
      if (winningOutcome === null) {
        res
          .status(400)
          .json({ success: false, error: 'Consensus not yet reached' });
        return;
      }

      // 2. Resolve on-chain
      const blockchainResult = await marketBlockchainService.resolveMarket(
        market.contractAddress
      );

      // 3. Update DB
      const resolvedMarket = await this.marketService.resolveMarket(
        marketId,
        winningOutcome,
        'Oracle Consensus'
      );

      res.json({
        success: true,
        data: {
          txHash: blockchainResult.txHash,
          market: resolvedMarket,
        },
      });
    } catch (error) {
      (req.log || logger).error('Resolve error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Resolution failed',
      });
    }
  }

  /**
   * POST /api/markets/:id/claim
   * Authenticated user
   */
  async claimWinnings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const marketId = String(req.params.id);
      const userId = req.user?.userId;
      const userPublicKey = req.user?.publicKey;

      if (!userId || !userPublicKey) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const market = await this.marketService.getMarketDetails(marketId);

      // Call blockchain to claim
      const result = await marketBlockchainService.claimWinnings(
        market.contractAddress,
        userPublicKey
      );

      // Update DB record for the user's prediction
      await this.marketService.markWinningsClaimed(marketId, userId);

      res.json({
        success: true,
        data: {
          txHash: result.txHash,
          marketId,
          userPublicKey,
        },
      });
    } catch (error) {
      (req.log || logger).error('Claim error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Claiming failed',
      });
    }
  }
}

export const oracleController = new OracleController();
