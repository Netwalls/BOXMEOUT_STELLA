// src/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// OpenAPI Specification
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '🥊 BoxMeOut Stella - Prediction Markets API',
      version: '1.0.0',
      description: `
# BoxMeOut Stella Backend API

**Prediction markets platform built on Stellar blockchain**

## Overview
This API powers the BoxMeOut prediction markets platform, allowing users to:
- Create and participate in prediction markets
- Trade outcome shares using AMM mechanics
- Connect Stellar wallets for seamless blockchain integration
- View real-time market data and predictions

## Database Models
Based on Prisma schema with the following main entities:
- **Users**: Platform users with authentication and balances
- **Markets**: Prediction markets with outcomes and liquidity
- **Predictions**: User predictions with commit-reveal mechanism
- **Shares**: User holdings of market outcome shares
- **Trades**: Trading history and transactions
- **Transactions**: Deposit/withdrawal records
- **Leaderboard**: User rankings and performance
- **Achievements**: User achievement badges
- **Referrals**: Referral program tracking
- **Disputes**: Market resolution disputes
- **AuditLogs**: System audit trail

## Authentication
The API supports two authentication methods:
1. **Traditional JWT** - For email/password users
2. **Stellar Wallet Auth** - For blockchain wallet users

## Rate Limiting
All endpoints are rate limited. Check response headers for limits.

## WebSocket
Real-time updates available via WebSocket at \`ws://localhost:3000/ws\`
      `,
      termsOfService: 'https://boxmeout.com/terms',
      contact: {
        name: 'BoxMeOut API Support',
        email: 'api@boxmeout.com',
        url: 'https://boxmeout.com/support',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.boxmeout.com',
        description: 'Production server',
      },
      {
        url: 'https://api-staging.boxmeout.com',
        description: 'Staging server',
      },
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization',
      },
      {
        name: 'Users',
        description: 'User profiles and account management',
      },
      {
        name: 'Markets',
        description: 'Prediction market creation and management',
      },
      {
        name: 'Predictions',
        description: 'User predictions with commit-reveal',
      },
      {
        name: 'Trading',
        description: 'Share trading and AMM operations',
      },
      {
        name: 'Transactions',
        description: 'Deposits, withdrawals, and payments',
      },
      {
        name: 'Leaderboard',
        description: 'User rankings and achievements',
      },
      {
        name: 'Referrals',
        description: 'Referral program management',
      },
      {
        name: 'Disputes',
        description: 'Market resolution disputes',
      },
      {
        name: 'Admin',
        description: 'Administrative operations',
      },
      {
        name: 'Health',
        description: 'API health and monitoring',
      },
    ],
    externalDocs: {
      description: 'BoxMeOut Documentation',
      url: 'https://docs.boxmeout.com',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Standard JWT token for email/password users',
        },
        stellarAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Stellar-Signature',
          description: 'Stellar wallet signature for blockchain authentication',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for admin operations',
        },
      },
      schemas: {
        // ========== STANDARD RESPONSE SCHEMAS ==========
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              description: 'Response data',
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  example: '2024-01-27T12:00:00.000Z',
                },
              },
            },
          },
        },

        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR',
                },
                message: {
                  type: 'string',
                  example: 'Validation failed',
                },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' },
                      code: { type: 'string' },
                    },
                  },
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
          },
        },

        Pagination: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
              default: 1,
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
            sort: {
              type: 'string',
            },
            order: {
              type: 'string',
              enum: ['asc', 'desc'],
            },
          },
        },

        PaginationMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            pages: { type: 'integer' },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' },
          },
        },

        // ========== USER SCHEMAS ==========
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            username: { type: 'string' },
            walletAddress: {
              type: 'string',
              nullable: true,
              pattern: '^G[A-Z0-9]{55}$',
            },
            usdcBalance: {
              type: 'number',
              format: 'float',
              description: 'USDC balance (6 decimals)',
            },
            xlmBalance: {
              type: 'number',
              format: 'float',
              description: 'XLM balance (7 decimals)',
            },
            tier: {
              type: 'string',
              enum: ['BEGINNER', 'ADVANCED', 'EXPERT', 'LEGENDARY'],
            },
            reputationScore: { type: 'integer' },
            avatarUrl: { type: 'string', nullable: true },
            bio: { type: 'string', nullable: true, maxLength: 500 },
            displayName: { type: 'string', nullable: true },
            emailVerified: { type: 'boolean' },
            twoFaEnabled: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            lastLogin: { type: 'string', format: 'date-time', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
            isActive: { type: 'boolean' },
          },
        },

        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'username'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Valid email address',
            },
            password: {
              type: 'string',
              format: 'password',
              minLength: 8,
              description: 'Minimum 8 characters',
            },
            username: {
              type: 'string',
              minLength: 3,
              maxLength: 30,
              pattern: '^[a-zA-Z0-9_]+$',
            },
            walletAddress: {
              type: 'string',
              pattern: '^G[A-Z0-9]{55}$',
              nullable: true,
            },
            displayName: {
              type: 'string',
              maxLength: 50,
              nullable: true,
            },
            bio: {
              type: 'string',
              maxLength: 500,
              nullable: true,
            },
          },
        },

        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password' },
          },
        },

        AuthResponse: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/User' },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'integer' },
              },
            },
          },
        },

        // ========== MARKET SCHEMAS ==========
        Market: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            contractAddress: {
              type: 'string',
              description: 'Stellar smart contract address',
            },
            title: { type: 'string', maxLength: 200 },
            description: { type: 'string' },
            category: {
              type: 'string',
              enum: [
                'WRESTLING',
                'BOXING',
                'MMA',
                'SPORTS',
                'POLITICAL',
                'CRYPTO',
                'ENTERTAINMENT',
              ],
            },
            status: {
              type: 'string',
              enum: ['OPEN', 'CLOSED', 'RESOLVED', 'DISPUTED', 'CANCELLED'],
            },
            creatorId: { type: 'string', format: 'uuid' },
            outcomeA: { type: 'string', maxLength: 100 },
            outcomeB: { type: 'string', maxLength: 100 },
            winningOutcome: {
              type: 'integer',
              nullable: true,
              description: '0 = outcomeA wins, 1 = outcomeB wins',
            },
            createdAt: { type: 'string', format: 'date-time' },
            closingAt: { type: 'string', format: 'date-time' },
            closedAt: { type: 'string', format: 'date-time', nullable: true },
            resolvedAt: { type: 'string', format: 'date-time', nullable: true },
            totalVolume: {
              type: 'number',
              format: 'float',
              description: 'Total trading volume in USDC',
            },
            participantCount: { type: 'integer' },
            yesLiquidity: {
              type: 'number',
              format: 'float',
              description: 'Liquidity for YES outcome',
            },
            noLiquidity: {
              type: 'number',
              format: 'float',
              description: 'Liquidity for NO outcome',
            },
            feesCollected: {
              type: 'number',
              format: 'float',
              description: 'Platform fees collected',
            },
            disputeReason: { type: 'string', nullable: true },
            resolutionSource: { type: 'string', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
            creator: { $ref: '#/components/schemas/User' },
          },
        },

        CreateMarketRequest: {
          type: 'object',
          required: [
            'title',
            'description',
            'category',
            'outcomeA',
            'outcomeB',
            'closingAt',
          ],
          properties: {
            title: {
              type: 'string',
              minLength: 10,
              maxLength: 200,
              description: 'Market title',
            },
            description: {
              type: 'string',
              minLength: 20,
              maxLength: 2000,
              description: 'Detailed market description',
            },
            category: {
              type: 'string',
              enum: [
                'WRESTLING',
                'BOXING',
                'MMA',
                'SPORTS',
                'POLITICAL',
                'CRYPTO',
                'ENTERTAINMENT',
              ],
            },
            outcomeA: {
              type: 'string',
              minLength: 5,
              maxLength: 100,
              description: 'First outcome description',
            },
            outcomeB: {
              type: 'string',
              minLength: 5,
              maxLength: 100,
              description: 'Second outcome description',
            },
            closingAt: {
              type: 'string',
              format: 'date-time',
              description: 'When market closes for new predictions',
            },
            resolutionSource: {
              type: 'string',
              maxLength: 500,
              nullable: true,
              description: 'Source for market resolution',
            },
          },
        },

        UpdateMarketRequest: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 10, maxLength: 200 },
            description: { type: 'string', minLength: 20, maxLength: 2000 },
            category: {
              type: 'string',
              enum: [
                'WRESTLING',
                'BOXING',
                'MMA',
                'SPORTS',
                'POLITICAL',
                'CRYPTO',
                'ENTERTAINMENT',
              ],
            },
            outcomeA: { type: 'string', minLength: 5, maxLength: 100 },
            outcomeB: { type: 'string', minLength: 5, maxLength: 100 },
            closingAt: { type: 'string', format: 'date-time' },
          },
        },

        ResolveMarketRequest: {
          type: 'object',
          required: ['winningOutcome', 'resolutionSource'],
          properties: {
            winningOutcome: {
              type: 'integer',
              enum: [0, 1],
              description: '0 = outcomeA, 1 = outcomeB',
            },
            resolutionSource: {
              type: 'string',
              maxLength: 500,
              description: 'Source for resolution decision',
            },
          },
        },

        // ========== PREDICTION SCHEMAS ==========
        Prediction: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            marketId: { type: 'string', format: 'uuid' },
            commitmentHash: {
              type: 'string',
              description: 'Hash of (prediction + salt)',
            },
            encryptedSalt: {
              type: 'string',
              nullable: true,
              description: 'Encrypted salt for reveal phase',
            },
            saltIv: {
              type: 'string',
              nullable: true,
              description: 'IV for salt encryption',
            },
            predictedOutcome: {
              type: 'integer',
              nullable: true,
              enum: [0, 1],
              description: '0 = outcomeA, 1 = outcomeB',
            },
            amountUsdc: {
              type: 'number',
              format: 'float',
              description: 'Amount staked in USDC',
            },
            transactionHash: {
              type: 'string',
              nullable: true,
              description: 'Stellar transaction hash',
            },
            revealTxHash: {
              type: 'string',
              nullable: true,
              description: 'Reveal transaction hash',
            },
            status: {
              type: 'string',
              enum: ['COMMITTED', 'REVEALED', 'SETTLED', 'DISPUTED'],
            },
            createdAt: { type: 'string', format: 'date-time' },
            revealedAt: { type: 'string', format: 'date-time', nullable: true },
            settledAt: { type: 'string', format: 'date-time', nullable: true },
            pnlUsd: {
              type: 'number',
              format: 'float',
              nullable: true,
              description: 'Profit/Loss in USD',
            },
            isWinner: { type: 'boolean', nullable: true },
            winningsClaimed: { type: 'boolean' },
            updatedAt: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/User' },
            market: { $ref: '#/components/schemas/Market' },
          },
        },

        CreatePredictionRequest: {
          type: 'object',
          required: [
            'marketId',
            'commitmentHash',
            'encryptedSalt',
            'saltIv',
            'amountUsdc',
          ],
          properties: {
            marketId: { type: 'string', format: 'uuid' },
            commitmentHash: {
              type: 'string',
              pattern: '^[a-f0-9]{64}$',
              description: 'SHA-256 hash of (prediction + salt)',
            },
            encryptedSalt: {
              type: 'string',
              description: 'Encrypted salt (AES-256-GCM)',
            },
            saltIv: {
              type: 'string',
              description: 'IV for salt encryption',
            },
            amountUsdc: {
              type: 'number',
              minimum: 1,
              description: 'Amount to stake in USDC (minimum 1)',
            },
            transactionHash: {
              type: 'string',
              nullable: true,
              description: 'Optional transaction hash for tracking',
            },
          },
        },

        RevealPredictionRequest: {
          type: 'object',
          required: ['predictionId', 'predictedOutcome', 'salt'],
          properties: {
            predictionId: { type: 'string', format: 'uuid' },
            predictedOutcome: {
              type: 'integer',
              enum: [0, 1],
              description: '0 = outcomeA, 1 = outcomeB',
            },
            salt: {
              type: 'string',
              minLength: 32,
              description: 'Original salt used for commitment',
            },
            revealTxHash: {
              type: 'string',
              nullable: true,
              description: 'Optional reveal transaction hash',
            },
          },
        },

        // ========== SHARE SCHEMAS ==========
        Share: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            marketId: { type: 'string', format: 'uuid' },
            outcome: {
              type: 'integer',
              enum: [0, 1],
              description: '0 = outcomeA shares, 1 = outcomeB shares',
            },
            quantity: {
              type: 'number',
              format: 'float',
              description: 'Number of shares held',
            },
            costBasis: {
              type: 'number',
              format: 'float',
              description: 'Total cost of shares in USDC',
            },
            acquiredAt: { type: 'string', format: 'date-time' },
            entryPrice: {
              type: 'number',
              format: 'float',
              description: 'Average price per share',
            },
            currentValue: {
              type: 'number',
              format: 'float',
              description: 'Current market value',
            },
            unrealizedPnl: {
              type: 'number',
              format: 'float',
              description: 'Unrealized profit/loss',
            },
            soldQuantity: {
              type: 'number',
              format: 'float',
              description: 'Quantity sold so far',
            },
            soldAt: { type: 'string', format: 'date-time', nullable: true },
            realizedPnl: {
              type: 'number',
              format: 'float',
              nullable: true,
              description: 'Realized profit/loss',
            },
            updatedAt: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/User' },
            market: { $ref: '#/components/schemas/Market' },
          },
        },

        // ========== TRADE SCHEMAS ==========
        Trade: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            marketId: { type: 'string', format: 'uuid' },
            tradeType: {
              type: 'string',
              enum: ['BUY', 'SELL', 'COMMIT', 'REVEAL', 'WINNINGS', 'REFUND'],
            },
            outcome: {
              type: 'integer',
              nullable: true,
              enum: [0, 1],
              description: '0 = outcomeA, 1 = outcomeB',
            },
            quantity: {
              type: 'number',
              format: 'float',
              description: 'Quantity traded',
            },
            pricePerUnit: {
              type: 'number',
              format: 'float',
              description: 'Price per unit in USDC',
            },
            totalAmount: {
              type: 'number',
              format: 'float',
              description: 'Total trade amount in USDC',
            },
            feeAmount: {
              type: 'number',
              format: 'float',
              description: 'Platform fee in USDC',
            },
            txHash: {
              type: 'string',
              description: 'Stellar transaction hash',
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'CONFIRMED', 'FAILED'],
            },
            createdAt: { type: 'string', format: 'date-time' },
            confirmedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            updatedAt: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/User' },
            market: { $ref: '#/components/schemas/Market' },
          },
        },

        CreateTradeRequest: {
          type: 'object',
          required: ['marketId', 'tradeType', 'outcome', 'quantity', 'txHash'],
          properties: {
            marketId: { type: 'string', format: 'uuid' },
            tradeType: {
              type: 'string',
              enum: ['BUY', 'SELL', 'COMMIT', 'REVEAL', 'WINNINGS', 'REFUND'],
            },
            outcome: {
              type: 'integer',
              enum: [0, 1],
              description: '0 = outcomeA, 1 = outcomeB',
            },
            quantity: {
              type: 'number',
              minimum: 0.000001,
              description: 'Quantity to trade',
            },
            pricePerUnit: {
              type: 'number',
              minimum: 0,
              description: 'Price per unit in USDC',
            },
            txHash: {
              type: 'string',
              description: 'Stellar transaction hash',
            },
          },
        },

        // ========== TRANSACTION SCHEMAS ==========
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            txType: {
              type: 'string',
              enum: ['DEPOSIT', 'WITHDRAW', 'REWARD', 'REFUND'],
            },
            amountUsdc: {
              type: 'number',
              format: 'float',
              description: 'Amount in USDC',
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'CONFIRMED', 'FAILED'],
            },
            txHash: {
              type: 'string',
              description: 'Stellar transaction hash',
            },
            fromAddress: {
              type: 'string',
              pattern: '^G[A-Z0-9]{55}$',
              description: 'Sender wallet address',
            },
            toAddress: {
              type: 'string',
              pattern: '^G[A-Z0-9]{55}$',
              description: 'Recipient wallet address',
            },
            createdAt: { type: 'string', format: 'date-time' },
            confirmedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            failedReason: { type: 'string', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/User' },
          },
        },

        CreateTransactionRequest: {
          type: 'object',
          required: [
            'txType',
            'amountUsdc',
            'txHash',
            'fromAddress',
            'toAddress',
          ],
          properties: {
            txType: {
              type: 'string',
              enum: ['DEPOSIT', 'WITHDRAW', 'REWARD', 'REFUND'],
            },
            amountUsdc: {
              type: 'number',
              minimum: 0.01,
              description: 'Minimum 0.01 USDC',
            },
            txHash: {
              type: 'string',
              description: 'Stellar transaction hash',
            },
            fromAddress: {
              type: 'string',
              pattern: '^G[A-Z0-9]{55}$',
            },
            toAddress: {
              type: 'string',
              pattern: '^G[A-Z0-9]{55}$',
            },
          },
        },

        // ========== LEADERBOARD SCHEMAS ==========
        Leaderboard: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            globalRank: { type: 'integer' },
            weeklyRank: { type: 'integer' },
            allTimePnl: {
              type: 'number',
              format: 'float',
              description: 'All-time profit/loss in USDC',
            },
            weeklyPnl: {
              type: 'number',
              format: 'float',
              description: 'Weekly profit/loss in USDC',
            },
            allTimeWinRate: {
              type: 'number',
              format: 'float',
              description: 'All-time win rate percentage',
            },
            weeklyWinRate: {
              type: 'number',
              format: 'float',
              description: 'Weekly win rate percentage',
            },
            predictionCount: { type: 'integer' },
            streakLength: { type: 'integer' },
            streakType: {
              type: 'string',
              enum: ['WIN', 'LOSS', 'NONE'],
            },
            lastPredictionAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            updatedAt: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/User' },
          },
        },

        // ========== ACHIEVEMENT SCHEMAS ==========
        Achievement: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            achievementName: { type: 'string' },
            description: { type: 'string' },
            tier: {
              type: 'string',
              enum: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'],
            },
            earnedAt: { type: 'string', format: 'date-time' },
            badgeUrl: { type: 'string' },
            user: { $ref: '#/components/schemas/User' },
          },
        },

        // ========== REFERRAL SCHEMAS ==========
        Referral: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            referrerId: { type: 'string', format: 'uuid' },
            referredUserId: { type: 'string', format: 'uuid' },
            referralCode: { type: 'string' },
            signupBonusClaimed: { type: 'boolean' },
            referrerBonusClaimed: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            referredSignupAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            referrer: { $ref: '#/components/schemas/User' },
            referredUser: { $ref: '#/components/schemas/User' },
          },
        },

        CreateReferralRequest: {
          type: 'object',
          required: ['referredUserId'],
          properties: {
            referredUserId: { type: 'string', format: 'uuid' },
            referralCode: {
              type: 'string',
              minLength: 8,
              maxLength: 20,
              nullable: true,
            },
          },
        },

        // ========== DISPUTE SCHEMAS ==========
        Dispute: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            marketId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            reason: { type: 'string' },
            evidenceUrl: { type: 'string', nullable: true },
            status: {
              type: 'string',
              enum: ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'],
            },
            resolution: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            resolvedAt: { type: 'string', format: 'date-time', nullable: true },
            adminNotes: { type: 'string', nullable: true },
            market: { $ref: '#/components/schemas/Market' },
            user: { $ref: '#/components/schemas/User' },
          },
        },

        CreateDisputeRequest: {
          type: 'object',
          required: ['marketId', 'reason'],
          properties: {
            marketId: { type: 'string', format: 'uuid' },
            reason: {
              type: 'string',
              minLength: 20,
              maxLength: 1000,
              description: 'Detailed reason for dispute',
            },
            evidenceUrl: {
              type: 'string',
              format: 'uri',
              nullable: true,
              description: 'URL to supporting evidence',
            },
          },
        },

        UpdateDisputeRequest: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'],
            },
            resolution: {
              type: 'string',
              maxLength: 1000,
              nullable: true,
            },
            adminNotes: {
              type: 'string',
              maxLength: 2000,
              nullable: true,
            },
          },
        },

        // ========== AUDIT LOG SCHEMAS ==========
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            userId: { type: 'string', format: 'uuid', nullable: true },
            action: { type: 'string' },
            resourceType: { type: 'string' },
            resourceId: { type: 'string' },
            oldValue: { type: 'object', nullable: true },
            newValue: { type: 'object', nullable: true },
            ipAddress: { type: 'string' },
            userAgent: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/User', nullable: true },
          },
        },

        // ========== WALLET AUTH SCHEMAS ==========
        WalletChallengeRequest: {
          type: 'object',
          required: ['publicKey'],
          properties: {
            publicKey: {
              type: 'string',
              pattern: '^G[A-Z0-9]{55}$',
              description: 'Stellar public key',
            },
          },
        },

        WalletChallengeResponse: {
          type: 'object',
          properties: {
            challenge: {
              type: 'string',
              description: 'Random nonce to sign',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'Challenge expiration time',
            },
          },
        },

        WalletAuthRequest: {
          type: 'object',
          required: ['publicKey', 'signature', 'signedPayload'],
          properties: {
            publicKey: {
              type: 'string',
              pattern: '^G[A-Z0-9]{55}$',
            },
            signature: {
              type: 'string',
              description: 'Base64 encoded signature',
            },
            signedPayload: {
              type: 'string',
              description: 'Original payload that was signed',
            },
          },
        },
      },

      // ========== STANDARD RESPONSES ==========
      responses: {
        Success: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessResponse' },
            },
          },
        },
        BadRequest: {
          description: 'Bad request - Invalid parameters',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        Unauthorized: {
          description: 'Unauthorized - Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        Forbidden: {
          description: 'Forbidden - Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        Conflict: {
          description: 'Resource conflict - Already exists',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        TooManyRequests: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },

      // ========== PARAMETERS ==========
      parameters: {
        PaginationPage: {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Page number',
        },
        PaginationLimit: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Items per page',
        },
        UserId: {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
        MarketId: {
          name: 'marketId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
        PredictionId: {
          name: 'predictionId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
        TradeId: {
          name: 'tradeId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
        TransactionId: {
          name: 'transactionId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
        DisputeId: {
          name: 'disputeId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      },
    },

    // ========== SECURITY ==========
    security: [
      {
        bearerAuth: [],
      },
      {
        stellarAuth: [],
      },
    ],
  },
  apis: [
    join(__dirname, '../routes/**/*.ts'),
    join(__dirname, '../controllers/**/*.ts'),
    join(__dirname, '../schemas/**/*.ts'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

// Swagger UI options
const swaggerUiOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .information-container { background: #f8f9fa; padding: 20px; border-radius: 8px; }
    .swagger-ui .opblock-tag { font-size: 24px; border-bottom: 2px solid #333; }
    .swagger-ui .opblock { border-radius: 8px; margin-bottom: 16px; }
    .swagger-ui .opblock.opblock-get { border-color: #61affe; background: rgba(97,175,254,.1); }
    .swagger-ui .opblock.opblock-post { border-color: #49cc90; background: rgba(73,204,144,.1); }
    .swagger-ui .opblock.opblock-put { border-color: #fca130; background: rgba(252,161,48,.1); }
    .swagger-ui .opblock.opblock-delete { border-color: #f93e3e; background: rgba(249,62,62,.1); }
  `,
  customSiteTitle: 'BoxMeOut API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    defaultModelsExpandDepth: 3,
    defaultModelExpandDepth: 3,
    displayRequestDuration: true,
    persistAuthorization: true,
    tryItOutEnabled: true,
    syntaxHighlight: {
      theme: 'monokai',
    },
  },
};

// Setup function
export const setupSwagger = (app: Express): void => {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, swaggerUiOptions)
  );

  // JSON endpoint for programmatic access
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  logger.info('Swagger documentation available at /api-docs');
};

export { swaggerSpec };
