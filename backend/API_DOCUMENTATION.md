# BoxMeOut Stella API Documentation

## Overview

The BoxMeOut Stella API is a RESTful API for prediction markets built on the Stellar blockchain. This document provides comprehensive documentation for all available endpoints.

## Base URLs

- **Development**: `http://localhost:3000`
- **Staging**: `https://api-staging.boxmeout.com`
- **Production**: `https://api.boxmeout.com`

## Interactive Documentation

- **Swagger UI**: Available at `/api-docs`
- **OpenAPI Spec**: Available at `/api-docs.json`

## Authentication

The API supports two authentication methods:

### 1. Stellar Wallet Authentication (Recommended)

Challenge-response authentication using Stellar wallet signatures.

**Flow:**
1. Request challenge: `POST /api/auth/challenge`
2. Sign challenge with wallet
3. Submit signed challenge: `POST /api/auth/login`
4. Receive JWT tokens

### 2. Bearer Token Authentication

Include the access token in the Authorization header:

```
Authorization: Bearer <access_token>
```

## Rate Limiting

All endpoints are rate-limited. Check response headers for limits:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Time when limit resets

**Rate Limits:**
- Authentication endpoints: 5 requests/15 minutes
- Challenge endpoint: 10 requests/15 minutes
- Refresh token: 10 requests/15 minutes
- General API: 100 requests/15 minutes

## Response Format

All responses follow a consistent format:

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "meta": {
    "timestamp": "2024-01-27T12:00:00.000Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": [
      {
        "field": "fieldName",
        "message": "Field-specific error",
        "code": "VALIDATION_ERROR"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-27T12:00:00.000Z"
  }
}
```

## API Endpoints

### Authentication

#### Request Challenge
```
POST /api/auth/challenge
```

Request a nonce challenge for wallet authentication.

**Request Body:**
```json
{
  "publicKey": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "challenge": "random-nonce-string",
    "expiresAt": "2024-01-27T12:05:00.000Z"
  }
}
```

#### Login
```
POST /api/auth/login
```

Authenticate using signed challenge.

**Request Body:**
```json
{
  "publicKey": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "signature": "base64-encoded-signature",
  "signedPayload": "original-challenge-string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "walletAddress": "GXXX...",
      "tier": "BEGINNER"
    },
    "tokens": {
      "accessToken": "jwt-token",
      "refreshToken": "refresh-token",
      "expiresIn": 3600
    }
  }
}
```

#### Refresh Token
```
POST /api/auth/refresh
```

Get a new access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh-token"
}
```

#### Get Current User
```
GET /api/auth/me
```

Get authenticated user information.

**Headers:** `Authorization: Bearer <token>`

#### Logout
```
POST /api/auth/logout
```

Logout current session.

**Request Body:**
```json
{
  "refreshToken": "refresh-token"
}
```

#### Logout All Devices
```
POST /api/auth/logout-all
```

Invalidate all refresh tokens.

**Headers:** `Authorization: Bearer <token>`

#### Get Active Sessions
```
GET /api/auth/sessions
```

List all active sessions.

**Headers:** `Authorization: Bearer <token>`

---

### Markets

#### Create Market
```
POST /api/markets
```

Create a new prediction market.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Will Bitcoin reach $100k by end of 2024?",
  "description": "Market resolves YES if Bitcoin (BTC) reaches $100,000 USD...",
  "category": "CRYPTO",
  "outcomeA": "Bitcoin reaches $100k",
  "outcomeB": "Bitcoin does not reach $100k",
  "closingAt": "2024-12-31T23:59:59.000Z",
  "resolutionSource": "CoinMarketCap official price"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "contractAddress": "CXXXXXXX...",
    "title": "Will Bitcoin reach $100k by end of 2024?",
    "status": "OPEN",
    "createdAt": "2024-01-27T12:00:00.000Z"
  }
}
```

#### List Markets
```
GET /api/markets
```

Get paginated list of markets with filters.

**Query Parameters:**
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 20, max: 100): Items per page
- `status` (string): Filter by status (OPEN, CLOSED, RESOLVED, DISPUTED, CANCELLED)
- `category` (string): Filter by category
- `sort` (string): Sort field (createdAt, closingAt, totalVolume, participantCount)
- `order` (string): Sort order (asc, desc)

**Example:**
```
GET /api/markets?status=OPEN&category=CRYPTO&sort=totalVolume&order=desc&page=1&limit=20
```

#### Get Market Details
```
GET /api/markets/{id}
```

Get detailed information about a specific market.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Market title",
    "description": "Market description",
    "status": "OPEN",
    "category": "CRYPTO",
    "outcomeA": "Outcome A description",
    "outcomeB": "Outcome B description",
    "totalVolume": 15000.50,
    "participantCount": 42,
    "yesLiquidity": 7500.25,
    "noLiquidity": 7500.25,
    "createdAt": "2024-01-27T12:00:00.000Z",
    "closingAt": "2024-12-31T23:59:59.000Z"
  }
}
```

#### Create AMM Pool
```
POST /api/markets/{id}/pool
```

Initialize AMM liquidity pool for a market (admin only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "initialLiquidity": 1000
}
```

---

### Trading

#### Buy Shares
```
POST /api/markets/{marketId}/buy
```

Purchase outcome shares using AMM pricing.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "outcome": 1,
  "amount": 100,
  "minShares": 95
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sharesBought": 98.5,
    "pricePerUnit": 0.65,
    "totalCost": 100,
    "feeAmount": 2.5,
    "txHash": "stellar-tx-hash",
    "tradeId": "uuid",
    "position": {
      "totalShares": 198.5,
      "averagePrice": 0.63
    }
  }
}
```

#### Sell Shares
```
POST /api/markets/{marketId}/sell
```

Sell outcome shares using AMM pricing.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "outcome": 1,
  "shares": 50,
  "minPayout": 30
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sharesSold": 50,
    "pricePerUnit": 0.65,
    "payout": 32.5,
    "feeAmount": 0.5,
    "txHash": "stellar-tx-hash",
    "tradeId": "uuid",
    "remainingShares": 148.5
  }
}
```

#### Get Market Odds
```
GET /api/markets/{marketId}/odds
```

Get current odds and liquidity for both outcomes.

**Response:**
```json
{
  "success": true,
  "data": {
    "yes": {
      "odds": 0.65,
      "percentage": 65,
      "liquidity": 7500.25
    },
    "no": {
      "odds": 0.35,
      "percentage": 35,
      "liquidity": 7500.25
    },
    "totalLiquidity": 15000.50
  }
}
```

---

### Oracle & Resolution

#### Submit Attestation
```
POST /api/markets/{id}/attest
```

Submit oracle attestation for market resolution.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "outcome": 1,
  "source": "Official announcement from organizer"
}
```

#### Resolve Market
```
POST /api/markets/{id}/resolve
```

Trigger market resolution based on attestations.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "winningOutcome": 1,
  "resolutionSource": "Official announcement"
}
```

#### Claim Winnings
```
POST /api/markets/{id}/claim
```

Claim winnings from a resolved market.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "amount": 150.75,
    "txHash": "stellar-tx-hash"
  }
}
```

---

### Treasury

#### Get Treasury Balances
```
GET /api/treasury/balances
```

Get current balances of treasury accounts.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "platform": 50000.00,
    "leaderboard": 10000.00,
    "creator": 5000.00
  }
}
```

#### Distribute Leaderboard Rewards
```
POST /api/treasury/distribute-leaderboard
```

Distribute rewards to top performers (admin only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "period": "weekly"
}
```

#### Distribute Creator Rewards
```
POST /api/treasury/distribute-creator
```

Distribute rewards to market creators (admin only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "marketId": "uuid"
}
```

---

### Health & Monitoring

#### Basic Health Check
```
GET /health
```

Simple health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-27T12:00:00.000Z",
  "environment": "development",
  "version": "1.0.0"
}
```

#### Detailed Health Check
```
GET /health/detailed
```

Detailed health status with service checks.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-27T12:00:00.000Z",
  "environment": "development",
  "version": "1.0.0",
  "services": {
    "redis": {
      "connected": true,
      "status": "ready"
    }
  }
}
```

#### Metrics
```
GET /metrics
```

Prometheus-compatible metrics endpoint.

---

## WebSocket API

### Connection

Connect to real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleEvent(data);
};
```

### Subscribe to Market

```javascript
ws.send(JSON.stringify({
  action: 'subscribe',
  marketId: 'uuid-of-market'
}));
```

### Unsubscribe

```javascript
ws.send(JSON.stringify({
  action: 'unsubscribe',
  marketId: 'uuid-of-market'
}));
```

### Event Types

#### Odds Changed
```json
{
  "type": "odds_changed",
  "marketId": "uuid",
  "yesOdds": 0.65,
  "noOdds": 0.35,
  "direction": "YES",
  "timestamp": 1706356800000
}
```

#### Market Updated
```json
{
  "type": "market_updated",
  "marketId": "uuid",
  "status": "CLOSED",
  "totalVolume": 15000.50,
  "participantCount": 42,
  "timestamp": 1706356800000
}
```

#### Trade Executed
```json
{
  "type": "trade_executed",
  "marketId": "uuid",
  "tradeType": "BUY",
  "outcome": 1,
  "quantity": 100,
  "pricePerUnit": 0.65,
  "timestamp": 1706356800000
}
```

#### Market Resolved
```json
{
  "type": "market_resolved",
  "marketId": "uuid",
  "winningOutcome": 1,
  "resolutionSource": "Official announcement",
  "timestamp": 1706356800000
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `UNAUTHORIZED` | Authentication required or invalid |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource already exists |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_ERROR` | Server error |
| `BLOCKCHAIN_ERROR` | Stellar blockchain error |
| `INSUFFICIENT_BALANCE` | Insufficient funds |
| `MARKET_CLOSED` | Market is closed for trading |
| `INVALID_SIGNATURE` | Invalid wallet signature |

---

## Data Models

### Market Categories

- `WRESTLING`
- `BOXING`
- `MMA`
- `SPORTS`
- `POLITICAL`
- `CRYPTO`
- `ENTERTAINMENT`

### Market Status

- `OPEN`: Active and accepting predictions
- `CLOSED`: Closed for new predictions, awaiting resolution
- `RESOLVED`: Resolved with winning outcome
- `DISPUTED`: Under dispute review
- `CANCELLED`: Cancelled and refunded

### User Tiers

- `BEGINNER`: New users
- `ADVANCED`: Experienced traders
- `EXPERT`: Top performers
- `LEGENDARY`: Elite traders

### Trade Types

- `BUY`: Buy outcome shares
- `SELL`: Sell outcome shares
- `COMMIT`: Commit prediction
- `REVEAL`: Reveal prediction
- `WINNINGS`: Claim winnings
- `REFUND`: Refund transaction

---

## Best Practices

### Authentication
- Store refresh tokens securely
- Implement token refresh logic before expiration
- Handle 401 errors by refreshing tokens

### Rate Limiting
- Implement exponential backoff on 429 errors
- Cache responses when appropriate
- Use WebSocket for real-time data instead of polling

### Error Handling
- Always check `success` field in responses
- Parse error codes for specific handling
- Display user-friendly error messages

### WebSocket
- Implement reconnection logic with exponential backoff
- Subscribe only to markets you're actively displaying
- Unsubscribe when leaving market views

---

## Support

For API support and questions:
- Email: api@boxmeout.com
- Documentation: https://docs.boxmeout.com
- Status Page: https://status.boxmeout.com
