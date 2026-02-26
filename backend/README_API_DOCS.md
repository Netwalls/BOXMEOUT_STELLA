# API Documentation - Quick Start

## 🎉 Implementation Complete

Comprehensive OpenAPI/Swagger documentation has been implemented for the BoxMeOut Stella API.

## 📚 Access Documentation

### 1. Start the Server

```bash
cd backend
npm install  # Install dependencies if not already done
npm run dev
```

### 2. Open Swagger UI

Navigate to: **http://localhost:3000/api-docs**

You'll see:
- Interactive API documentation
- All endpoints organized by category
- Try-it-out functionality
- Request/response schemas
- Authentication flows
- WebSocket event documentation

### 3. Get OpenAPI Spec

Download the raw OpenAPI specification:
- **JSON Format**: http://localhost:3000/api-docs.json

Use this to:
- Generate client SDKs
- Import into Postman/Insomnia
- Validate in CI/CD
- Share with third-party developers

## 📖 Documentation Files

### Interactive (Swagger UI)
- **URL**: `/api-docs`
- **Features**: Browse, test, and explore the API interactively

### Programmatic (OpenAPI JSON)
- **URL**: `/api-docs.json`
- **Use**: Generate SDKs, import to tools, CI/CD validation

### Reference (Markdown)
- **File**: `backend/API_DOCUMENTATION.md`
- **Content**: Comprehensive guide with examples

### Setup Guide
- **File**: `backend/docs/API_SETUP.md`
- **Content**: How to maintain and extend documentation

### Implementation Summary
- **File**: `backend/docs/SWAGGER_IMPLEMENTATION_SUMMARY.md`
- **Content**: Complete implementation details

## 🔐 Testing Authentication

### 1. Get Challenge

In Swagger UI:
1. Expand "Authentication" section
2. Try `POST /api/auth/challenge`
3. Enter a Stellar public key
4. Execute and copy the challenge

### 2. Login

1. Sign the challenge with your Stellar wallet
2. Try `POST /api/auth/login`
3. Submit publicKey, signature, and signedPayload
4. Copy the accessToken from response

### 3. Authorize

1. Click the "Authorize" button at the top
2. Enter: `Bearer <your-access-token>`
3. Click "Authorize"
4. Now you can test protected endpoints!

## 🚀 Quick Examples

### List Markets

```bash
curl http://localhost:3000/api/markets?status=OPEN&limit=10
```

### Get Market Odds

```bash
curl http://localhost:3000/api/markets/{marketId}/odds
```

### Buy Shares (Authenticated)

```bash
curl -X POST http://localhost:3000/api/markets/{marketId}/buy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "outcome": 1,
    "amount": 100,
    "minShares": 95
  }'
```

## 🔌 WebSocket Connection

### Connect

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('Connected to BoxMeOut WebSocket');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

### Subscribe to Market

```javascript
ws.send(JSON.stringify({
  action: 'subscribe',
  marketId: 'your-market-uuid'
}));
```

### Handle Events

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'odds_changed':
      console.log('Odds updated:', data.yesOdds, data.noOdds);
      break;
    case 'market_updated':
      console.log('Market status:', data.status);
      break;
    case 'trade_executed':
      console.log('Trade:', data.tradeType, data.quantity);
      break;
    case 'market_resolved':
      console.log('Winner:', data.winningOutcome);
      break;
  }
};
```

## 📦 Generate Client SDK

### TypeScript

```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/api-docs.json \
  -g typescript-axios \
  -o ./generated/typescript-client
```

### Python

```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/api-docs.json \
  -g python \
  -o ./generated/python-client
```

### Other Languages

OpenAPI Generator supports 50+ languages:
- Java, Go, Ruby, PHP, C#, Swift, Kotlin, Rust, and more
- See: https://openapi-generator.tech/docs/generators

## 📋 What's Documented

### ✅ All Endpoints (23 total)

**Authentication (7)**
- Challenge, Login, Refresh, Logout, Sessions, Me

**Markets (4)**
- Create, List, Get Details, Create Pool

**Trading (3)**
- Buy Shares, Sell Shares, Get Odds

**Oracle (3)**
- Attest, Resolve, Claim Winnings

**Treasury (3)**
- Get Balances, Distribute Leaderboard, Distribute Creator

**Health (3)**
- Basic Health, Detailed Health, Metrics

### ✅ All Schemas (40+)

- User, Market, Trade, Prediction, Share
- Request/Response models
- Error formats
- Pagination
- WebSocket events

### ✅ Authentication Flows

- Stellar wallet challenge-response
- JWT token management
- Session handling
- Security schemes

### ✅ WebSocket Events

- Odds Changed
- Market Updated
- Trade Executed
- Market Resolved

## 🛠️ Maintenance

### Adding New Endpoints

Add JSDoc comment to your route:

```typescript
/**
 * @swagger
 * /api/your-endpoint:
 *   post:
 *     summary: Brief description
 *     tags: [YourTag]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/YourSchema'
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/your-endpoint', requireAuth, controller.method);
```

### Adding New Schemas

Edit `backend/src/config/swagger.ts`:

```typescript
YourSchema: {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
  },
  required: ['id', 'name'],
},
```

## 🎯 Key Features

- ✅ Interactive Swagger UI
- ✅ Try-it-out functionality
- ✅ Complete request/response examples
- ✅ Authentication flow documentation
- ✅ WebSocket event documentation
- ✅ Rate limiting information
- ✅ Error code reference
- ✅ SDK generation support
- ✅ Postman/Insomnia import
- ✅ Custom styling and branding

## 📞 Support

For questions or issues:
- Check `backend/API_DOCUMENTATION.md` for detailed reference
- See `backend/docs/API_SETUP.md` for setup guide
- Review `backend/docs/SWAGGER_IMPLEMENTATION_SUMMARY.md` for implementation details

## 🎊 Ready to Use!

The API documentation is fully functional and ready for:
- Frontend development
- Third-party integrations
- Client SDK generation
- API testing
- Developer onboarding

Start the server and visit `/api-docs` to explore!
