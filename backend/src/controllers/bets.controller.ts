// backend/src/controllers/bets.controller.ts
// Bets controller - handles requests for bet/prediction lookups by bettor address

import { Request, Response } from 'express';
import { MarketService } from '../services/market.service.js';
import { logger } from '../utils/logger.js';

export class BetsController {
  private marketService: MarketService;

  constructor(marketService?: MarketService) {
    this.marketService = marketService || new MarketService();
  }

  /**
   * GET /api/bets/:bettor_address
   *
   * Returns all bets placed by the given Stellar public key.
   * Responds with an empty array (not 404) when the address has no bets.
   * Validation middleware guarantees bettor_address is a valid Stellar G-key
   * before this handler is reached.
   */
  async getBetsByAddress(req: Request, res: Response): Promise<void> {
    const { bettor_address } = req.params;

    try {
      const bets = await this.marketService.getBetsByBettorAddress(bettor_address);

      res.status(200).json({
        success: true,
        data: bets,
      });
    } catch (error) {
      logger.error('Failed to fetch bets by bettor address', {
        bettor_address,
        error,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve bets',
        },
      });
    }
  }
}

export const betsController = new BetsController();
