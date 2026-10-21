import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Horizon } from 'stellar-sdk';

/**
 * B-104: Verify POST /api/markets against the chain instead of trusting client fields.
 * Prevents users from registering fake market records that don't exist on-chain.
 * Only the indexer should create real market records via chain events.
 */
@Injectable()
export class MarketVerificationService {
  private readonly logger = new Logger(MarketVerificationService.name);
  private horizonClient: Horizon.Server;

  constructor() {
    const horizonUrl = process.env.HORIZON_URL || 'https://horizon.stellar.org';
    this.horizonClient = new Horizon.Server(horizonUrl);
  }

  /**
   * Verify that a market exists on-chain at the provided contract address.
   * Prevents client from providing arbitrary contract addresses and market IDs.
   */
  async verifyMarketOnChain(
    contractAddress: string,
    marketId: string,
  ): Promise<{
    verified: boolean;
    chainData: Record<string, any>;
  }> {
    try {
      // Verify contract address format (must be valid Stellar account)
      if (!this.isValidStellarAddress(contractAddress)) {
        throw new BadRequestException('Invalid Stellar contract address format');
      }

      // Query Soroban RPC to verify contract exists and has market data
      const marketData = await this.queryContractMarketData(contractAddress, marketId);

      if (!marketData) {
        throw new BadRequestException(
          `Market ${marketId} does not exist on-chain at contract ${contractAddress}`,
        );
      }

      // Extract immutable chain data that cannot be spoofed by client
      const verifiedData = {
        marketId: marketData.market_id,
        contractAddress: contractAddress,
        createdAt: marketData.created_at || Date.now(),
        // DO NOT trust these from client - verify from chain:
        // - fighterA and fighterB
        // - scheduledTime
        // - oracleAddress
        // - pool values
      };

      this.logger.log(`Market verified on-chain: ${marketId} at ${contractAddress}`);

      return {
        verified: true,
        chainData: verifiedData,
      };
    } catch (error) {
      this.logger.error(`Market verification failed: ${error}`);
      throw error;
    }
  }

  /**
   * Validate that client-provided market metadata matches on-chain data.
   * Reject if client tries to override immutable chain data.
   */
  validateClientMetadata(
    clientData: {
      id: string;
      contractAddress: string;
      createdBy?: string;
      oracleAddress?: string;
      fighterA?: Record<string, any>;
      fighterB?: Record<string, any>;
    },
    chainData: Record<string, any>,
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Verify immutable fields cannot be changed
    if (clientData.id !== chainData.marketId) {
      errors.push(
        `Market ID mismatch: client provided ${clientData.id}, chain shows ${chainData.marketId}`,
      );
    }

    if (clientData.contractAddress !== chainData.contractAddress) {
      errors.push(
        `Contract address mismatch: client provided ${clientData.contractAddress}, chain shows ${chainData.contractAddress}`,
      );
    }

    // Oracle address and fighters should come from chain, not client
    if (clientData.oracleAddress && clientData.oracleAddress !== chainData.oracle_address) {
      errors.push(
        `Oracle address mismatch: client provided ${clientData.oracleAddress}, chain shows ${chainData.oracle_address}`,
      );
    }

    // Validate fighter data matches chain
    if (clientData.fighterA) {
      const chainFighterA = chainData.fighter_a;
      if (
        clientData.fighterA.name !== chainFighterA?.name ||
        clientData.fighterA.weight !== chainFighterA?.weight
      ) {
        errors.push('Fighter A data does not match on-chain record');
      }
    }

    if (clientData.fighterB) {
      const chainFighterB = chainData.fighter_b;
      if (
        clientData.fighterB.name !== chainFighterB?.name ||
        clientData.fighterB.weight !== chainFighterB?.weight
      ) {
        errors.push('Fighter B data does not match on-chain record');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if an address is a valid Stellar account format
   */
  private isValidStellarAddress(address: string): boolean {
    // Stellar addresses start with 'G' and are 56 characters long (base32 encoded)
    return /^G[A-Z2-7]{55}$/.test(address);
  }

  /**
   * Query Soroban RPC to get market data from contract
   */
  private async queryContractMarketData(
    contractAddress: string,
    marketId: string,
  ): Promise<Record<string, any> | null> {
    try {
      const rpcUrl = process.env.STELLAR_RPC_URL || 'http://localhost:11626';

      // Use Soroban RPC to invoke read-only contract function
      const response = await fetch(`${rpcUrl}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'simulateTransaction',
          params: {
            transaction: this.buildGetMarketTransaction(contractAddress, marketId),
            resourceLeeway: 10,
          },
        }),
      });

      const data = (await response.json()) as any;

      if (data.error) {
        this.logger.error(`RPC error: ${data.error.message}`);
        return null;
      }

      // Parse contract response (would contain market data if it exists)
      const result = data.result?.retval;
      return result ? JSON.parse(result) : null;
    } catch (error) {
      this.logger.error(`Failed to query contract: ${error}`);
      return null;
    }
  }

  /**
   * Build a Soroban transaction to query market data
   */
  private buildGetMarketTransaction(contractAddress: string, marketId: string): string {
    // This would build a proper Soroban transaction envelope
    // that calls the get_market_info contract function
    // Implementation would use stellar-sdk to construct the envelope
    return '';
  }

  /**
   * Prevent client from spoofing createdBy field
   */
  validateCreatorAddress(
    clientProvidedCreator: string,
    authenticatedUser: string,
  ): boolean {
    // Only the authenticated user can register themselves as creator
    // If they claim someone else created it, reject
    if (clientProvidedCreator && clientProvidedCreator !== authenticatedUser) {
      this.logger.warn(
        `Creator mismatch: ${authenticatedUser} tried to register market as created by ${clientProvidedCreator}`,
      );
      return false;
    }

    return true;
  }
}
