# Swagger UI User Guide

## Accessing the Documentation

Once your server is running, navigate to:
```
http://localhost:3000/api-docs
```

---

## What You'll See

### 1. API Header
At the top, you'll see:
- **Title**: 🥊 BoxMeOut Stella - Prediction Markets API
- **Version**: 1.0.0
- **Description**: Overview of the API with database models and features
- **Servers**: Dropdown to switch between dev/staging/production

### 2. Authorize Button
Click this to authenticate and test protected endpoints:
1. Click "Authorize" button (top right)
2. Enter: `Bearer <your-access-token>`
3. Click "Authorize"
4. Now you can test protected endpoints!

### 3. API Sections (Tags)

The API is organized into these sections:

#### 🔐 Authentication
- POST `/api/auth/challenge` - Request authentication challenge
- POST `/api/auth/login` - Login with wallet signature
- POST `/api/auth/refresh` - Refresh access token
- POST `/api/auth/logout` - Logout current session
- POST `/api/auth/logout-all` - Logout from all devices
- GET `/api/auth/sessions` - Get active sessions
- GET `/api/auth/me` - Get current user info

#### 📊 Markets
- POST `/api/markets` - Create new prediction market
- GET `/api/markets` - List all markets (with filters)
- GET `/api/markets/{id}` - Get market details
- POST `/api/markets/{id}/pool` - Create AMM liquidity pool

#### 💰 Trading
- POST `/api/markets/{marketId}/buy` - Buy outcome shares
- POST `/api/markets/{marketId}/sell` - Sell outcome shares
- GET `/api/markets/{marketId}/odds` - Get current market odds

#### 🔮 Oracle
- POST `/api/markets/{id}/attest` - Submit oracle attestation
- POST `/api/markets/{id}/resolve` - Resolve market
- POST `/api/markets/{id}/claim` - Claim winnings

#### 🏦 Treasury
- GET `/api/treasury/balances` - Get treasury balances
- POST `/api/treasury/distribute-leaderboard` - Distribute leaderboard rewards
- POST `/api/treasury/distribute-creator` - Distribute creator rewards

#### ❤️ Health
- GET `/health` - Basic health check
- GET `/health/detailed` - Detailed health check
- GET `/metrics` - Prometheus metrics

---

## How to Use an Endpoint

### Step 1: Expand the Endpoint
Click on any endpoint to expand it. You'll see:
- **Description**: What the endpoint does
- **Parameters**: Path/query/header parameters
- **Request Body**: Expected request format
- **Responses**: Possible response codes and formats

### Step 2: Try It Out
1. Click the "Try it out" button
2. Fill in the required parameters
3. Edit the request body if needed
4. Click "Execute"

### Step 3: View Results
After execution, you'll see:
- **Request URL**: The actual URL called
- **Response Code**: HTTP status code (200, 400, etc.)
- **Response Body**: The actual response data
- **Response Headers**: HTTP headers returned
- **Duration**: How long the request took

---

## Testing Authentication Flow

### 1. Get a Challenge

**Endpoint**: POST `/api/auth/challenge`

1. Expand the endpoint
2. Click "Try it out"
3. Enter a Stellar public key:
   ```json
   {
     "publicKey": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
   }
   ```
4. Click "Execute"
5. Copy the `challenge` from the response

### 2. Sign the Challenge

Use your Stellar wallet to sign the challenge string.

### 3. Login

**Endpoint**: POST `/api/auth/login`

1. Expand the endpoint
2. Click "Try it out"
3. Enter:
   ```json
   {
     "publicKey": "GXXX...",
     "signature": "base64-encoded-signature",
     "signedPayload": "challenge-string"
   }
   ```
4. Click "Execute"
5. Copy the `accessToken` from the response

### 4. Authorize

1. Click the "Authorize" button at the top
2. In the "bearerAuth" section, enter:
   ```
   Bearer <your-access-token>
   ```
3. Click "Authorize"
4. Click "Close"

Now you can test all protected endpoints!

---

## Testing Market Operations

### 1. List Markets

**Endpoint**: GET `/api/markets`

1. Expand the endpoint
2. Click "Try it out"
3. Set filters (optional):
   - `status`: OPEN
   - `category`: CRYPTO
   - `sort`: totalVolume
   - `order`: desc
   - `page`: 1
   - `limit`: 10
4. Click "Execute"
5. View the list of markets

### 2. Get Market Details

**Endpoint**: GET `/api/markets/{id}`

1. Expand the endpoint
2. Click "Try it out"
3. Enter a market ID (UUID)
4. Click "Execute"
5. View detailed market information

### 3. Get Market Odds

**Endpoint**: GET `/api/markets/{marketId}/odds`

1. Expand the endpoint
2. Click "Try it out"
3. Enter a market ID
4. Click "Execute"
5. View current odds for YES and NO outcomes

---

## Testing Trading Operations

### Buy Shares

**Endpoint**: POST `/api/markets/{marketId}/buy`

**Prerequisites**: Must be authenticated

1. Expand the endpoint
2. Click "Try it out"
3. Enter market ID
4. Set request body:
   ```json
   {
     "outcome": 1,
     "amount": 100,
     "minShares": 95
   }
   ```
   - `outcome`: 0 for NO, 1 for YES
   - `amount`: USDC to spend
   - `minShares`: Slippage protection (optional)
5. Click "Execute"
6. View trade results

### Sell Shares

**Endpoint**: POST `/api/markets/{marketId}/sell`

**Prerequisites**: Must be authenticated and own shares

1. Expand the endpoint
2. Click "Try it out"
3. Enter market ID
4. Set request body:
   ```json
   {
     "outcome": 1,
     "shares": 50,
     "minPayout": 30
   }
   ```
5. Click "Execute"
6. View sale results

---

## Understanding Responses

### Success Response (200)
```json
{
  "success": true,
  "data": {
    // Response data here
  },
  "meta": {
    "timestamp": "2024-01-27T12:00:00.000Z"
  }
}
```

### Error Response (400, 401, etc.)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "amount",
        "message": "Amount must be positive",
        "code": "INVALID_VALUE"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-27T12:00:00.000Z"
  }
}
```

---

## Viewing Schemas

### Models Section
Scroll down to see all data models:
- Click on any schema to expand it
- View all properties and their types
- See required fields
- Check validation rules
- View example values

### Common Schemas
- **User**: User account information
- **Market**: Prediction market details
- **Trade**: Trading transaction
- **Share**: User share holdings
- **Prediction**: User prediction with commit-reveal

---

## WebSocket Documentation

Scroll to the API description section to find:

### Connection Example
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
```

### Subscribe to Market
```javascript
ws.send(JSON.stringify({
  action: 'subscribe',
  marketId: 'uuid-of-market'
}));
```

### Event Types
- **odds_changed**: Real-time odds updates
- **market_updated**: Market status changes
- **trade_executed**: Trade notifications
- **market_resolved**: Resolution notifications

---

## Tips & Tricks

### 1. Use the Filter
Type in the filter box to search for specific endpoints or schemas.

### 2. Expand All
Click "Expand Operations" to see all endpoints at once.

### 3. Copy as cURL
After executing a request, you can copy it as a cURL command.

### 4. Download Spec
Download the OpenAPI spec from:
```
http://localhost:3000/api-docs.json
```

### 5. Persistent Auth
Your authorization token persists in the browser session.

### 6. Model Examples
Click on "Example Value" vs "Schema" to toggle between views.

### 7. Response Codes
Each endpoint shows all possible response codes with examples.

### 8. Try Different Servers
Use the server dropdown to test against different environments.

---

## Common Workflows

### Workflow 1: Create and Trade on Market

1. **Authenticate**
   - POST `/api/auth/challenge`
   - POST `/api/auth/login`
   - Click "Authorize"

2. **Create Market**
   - POST `/api/markets`
   - Note the market ID

3. **Create Pool**
   - POST `/api/markets/{id}/pool`
   - Provide initial liquidity

4. **Check Odds**
   - GET `/api/markets/{marketId}/odds`

5. **Buy Shares**
   - POST `/api/markets/{marketId}/buy`

6. **Monitor Odds**
   - GET `/api/markets/{marketId}/odds`

7. **Sell Shares**
   - POST `/api/markets/{marketId}/sell`

### Workflow 2: Resolve Market

1. **Authenticate** (as oracle/admin)

2. **Submit Attestation**
   - POST `/api/markets/{id}/attest`

3. **Resolve Market**
   - POST `/api/markets/{id}/resolve`

4. **Claim Winnings**
   - POST `/api/markets/{id}/claim`

---

## Troubleshooting

### "Unauthorized" Error
- Make sure you clicked "Authorize"
- Check your token hasn't expired
- Try refreshing your token

### "Not Found" Error
- Verify the ID/UUID is correct
- Check the resource exists
- Ensure proper formatting

### "Validation Error"
- Check required fields are provided
- Verify data types match schema
- Check min/max constraints

### "Rate Limit Exceeded"
- Wait for the rate limit to reset
- Check `X-RateLimit-Reset` header
- Reduce request frequency

---

## Keyboard Shortcuts

- **Ctrl/Cmd + F**: Search in page
- **Tab**: Navigate between fields
- **Enter**: Submit when in input field
- **Esc**: Close modals

---

## Export Options

### 1. Copy as cURL
After executing a request, copy the cURL command to use in terminal.

### 2. Download OpenAPI Spec
```
http://localhost:3000/api-docs.json
```

### 3. Import to Postman
1. Download the OpenAPI spec
2. Open Postman
3. Import → Upload Files
4. Select the downloaded JSON

### 4. Import to Insomnia
1. Download the OpenAPI spec
2. Open Insomnia
3. Import/Export → Import Data
4. Select the downloaded JSON

---

## Best Practices

1. **Always authenticate first** for protected endpoints
2. **Check response codes** to understand what happened
3. **Read error messages** for debugging hints
4. **Use example values** as templates
5. **Test in order** (create before update/delete)
6. **Monitor rate limits** in response headers
7. **Use filters** to find endpoints quickly
8. **Bookmark** the docs page for quick access

---

## Getting Help

If you encounter issues:
1. Check the error message details
2. Review the schema requirements
3. Verify your authentication
4. Check the markdown docs: `backend/API_DOCUMENTATION.md`
5. Review setup guide: `backend/docs/API_SETUP.md`

---

## Happy Testing! 🚀

The Swagger UI makes it easy to explore and test the BoxMeOut Stella API. Use it to:
- Learn the API structure
- Test authentication flows
- Experiment with trading
- Understand request/response formats
- Generate client code
- Debug integration issues

Enjoy building with BoxMeOut! 🥊
