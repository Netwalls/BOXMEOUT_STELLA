# Blockchain Event Indexer Service

## Overview

The Blockchain Event Indexer Service monitors Stellar blockchain events from smart contracts and synchronizes them with the application database. It ensures data consistency between on-chain and off-chain states.

## Architecture

### Components

1. **IndexerService** (`src/services/blockchain/indexer.ts`)
   - Core service that polls blockchain for events
   - Processes events and updates database
   - Maintains indexer state and checkpoints

2. **IndexerController** (`src/controllers/indexer.controller.ts`)
   - HTTP request handlers for indexer management
   - Admin-only endpoints for control

3. **IndexerRoutes** (`src/routes/indexer.routes.ts`)
   - RESTful API endpoints
   - Authentication and authorization middleware

## Features

### Event Monitoring
- ✅ Polls Stellar RPC for new ledgers
- ✅ Extracts contract events from ledgers
- ✅ Parses and processes events
- ✅ Updates database with blockchain state

### Event Types Supported
1. **market_created** - New market created on blockchain
2. **pool_created** - AMM pool initialized
3. **shares_bought** - User bought outcome shares
4. **shares_sold** - User sold outcome shares
5. **market_resolved** - Market outcome determined
6. **attestation_submitted** - Oracle attestation recorded
7. **distribution_executed** - Treasury distribution completed

### State Management
- ✅ Tracks last processed ledger
- ✅ Saves checkpoints to database
- ✅ Resumes from last checkpoint on restart
- ✅ Supports manual reprocessing

### Error Handling
- ✅ Exponential backoff for retries
- ✅ Dead Letter Queue (DLQ) for failed events
- ✅ Graceful degradation
- ✅ Comprehensive logging

## Configuration

### Environment Variables

```bash
# Stellar RPC Configuration
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK=testnet

# Contract Addresses
FACTORY_CONTRACT_ADDRESS=C...
AMM_CONTRACT_ADDRESS=C...
ORACLE_CONTRACT_ADDRESS=C...
TREASURY_CONTRACT_ADDRESS=C...

# Indexer Configuration
ENABLE_INDEXER=true                    # Enable/disable indexer
INDEXER_POLLING_INTERVAL=5000          # Polling interval in ms (default: 5000)

# Admin Configuration
ADMIN_WALLET_ADDRESSES=G...,G...       # Comma-separated admin addresses
```

## API Endpoints

### 1. Get Indexer Status
```
GET /api/indexer/status
```

**Authentication**: Required (Admin only)

**Response**:
```json
{
  "success": true,
  "data": {
    "state": {
      "lastProcessedLedger": 12345,
      "isRunning": true,
      "eventsProcessed": 1523
    },
    "latestLedger": 12350,
    "ledgersBehind": 5
  }
}
```

### 2. Start Indexer
```
POST /api/indexer/start
```

**Authentication**: Required (Admin only)

**Response**:
```json
{
  "success": true,
  "message": "Indexer started successfully"
}
```

### 3. Stop Indexer
```
POST /api/indexer/stop
```

**Authentication**: Required (Admin only)

**Response**:
```json
{
  "success": true,
  "message": "Indexer stopped successfully"
}
```

### 4. Reprocess Events
```
POST /api/indexer/reprocess
```

**Authentication**: Required (Admin only)

**Request Body**:
```json
{
  "startLedger": 12000
}
```

**Response**:
```json
{
  "success": true,
  "message": "Reprocessing from ledger 12000"
}
```

## Event Processing Flow

### 1. Polling Loop
```
┌─────────────────────────────────────┐
│  Start Polling                      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Get Latest Ledger                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Process New Ledgers (batch of 10)  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Save Checkpoint                    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Wait (polling interval)            │
└──────────────┬──────────────────────┘
               │
               └──────────────────────────┐
                                          │
                                          ▼
                                    (Repeat)
```

### 2. Event Processing
```
┌─────────────────────────────────────┐
│  Get Events for Ledger              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Parse Event Data                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Route to Event Handler             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Update Database                    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Log Success / Add to DLQ           │
└─────────────────────────────────────┘
```

## Event Handlers

### market_created
Updates market record with blockchain confirmation.

```typescript
{
  type: 'market_created',
  value: {
    marketId: string,
    creator: string,
    title: string
  }
}
```

### pool_created
Updates market liquidity and pool transaction hash.

```typescript
{
  type: 'pool_created',
  value: {
    marketId: string,
    yesReserve: number,
    noReserve: number
  }
}
```

### shares_bought
Confirms trade and updates market volume.

```typescript
{
  type: 'shares_bought',
  value: {
    marketId: string,
    buyer: string,
    outcome: number,
    shares: number,
    totalCost: number
  }
}
```

### shares_sold
Confirms sell trade.

```typescript
{
  type: 'shares_sold',
  value: {
    marketId: string,
    seller: string,
    outcome: number,
    shares: number,
    payout: number
  }
}
```

### market_resolved
Updates market status and winning outcome.

```typescript
{
  type: 'market_resolved',
  value: {
    marketId: string,
    outcome: number
  }
}
```

### attestation_submitted
Records oracle attestation.

```typescript
{
  type: 'attestation_submitted',
  value: {
    marketId: string,
    oracleId: string,
    outcome: number
  }
}
```

### distribution_executed
Confirms treasury distribution.

```typescript
{
  type: 'distribution_executed',
  value: {
    distributionType: string,
    amount: number,
    recipients: number
  }
}
```

## Database Schema

### Indexer Checkpoints
Stored in `audit_logs` table with action `INDEXER_CHECKPOINT`:

```typescript
{
  action: 'INDEXER_CHECKPOINT',
  resourceType: 'INDEXER',
  resourceId: 'blockchain-indexer',
  newValue: {
    ledger: number,
    eventsProcessed: number,
    timestamp: string
  }
}
```

### Dead Letter Queue
Failed events stored in `blockchain_dlq` table:

```typescript
{
  txHash: string,
  serviceName: 'BlockchainIndexerService',
  functionName: string,
  params: object,
  error: string,
  status: 'PENDING' | 'RETRYING' | 'RESOLVED' | 'FAILED',
  retryCount: number
}
```

## Monitoring

### Key Metrics
- **lastProcessedLedger**: Last ledger successfully processed
- **isRunning**: Indexer running status
- **eventsProcessed**: Total events processed
- **ledgersBehind**: How many ledgers behind current
- **lastError**: Most recent error message

### Health Checks
```bash
# Check indexer status
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/indexer/status

# Expected response
{
  "success": true,
  "data": {
    "state": {
      "lastProcessedLedger": 12345,
      "isRunning": true,
      "eventsProcessed": 1523
    },
    "latestLedger": 12350,
    "ledgersBehind": 5
  }
}
```

### Alerts
Set up monitoring for:
- ✅ Indexer stopped unexpectedly
- ✅ Ledgers behind > 100
- ✅ Events in DLQ > 10
- ✅ Last error timestamp > 5 minutes

## Performance

### Optimization Strategies
1. **Batch Processing**: Processes 10 ledgers per cycle
2. **Checkpoint Frequency**: Saves state every 10 ledgers
3. **Polling Interval**: Configurable (default 5 seconds)
4. **Event Filtering**: Only monitors configured contracts

### Scalability
- Handles ~1000 events/minute
- Processes ledgers in batches
- Graceful degradation under load
- Can catch up from historical ledgers

## Error Handling

### Retry Strategy
1. **Network Errors**: Retry with exponential backoff
2. **Parse Errors**: Log and skip event
3. **Database Errors**: Add to DLQ for manual review
4. **Contract Errors**: Log and continue

### Dead Letter Queue
Failed events are stored for manual review:

```sql
SELECT * FROM blockchain_dlq 
WHERE status = 'PENDING' 
ORDER BY created_at DESC;
```

## Deployment

### Startup
The indexer starts automatically with the server if `ENABLE_INDEXER=true`:

```typescript
// In src/index.ts
if (process.env.ENABLE_INDEXER !== 'false') {
  await indexerService.start();
}
```

### Shutdown
Graceful shutdown saves checkpoint:

```typescript
// On SIGTERM/SIGINT
await indexerService.stop();
```

### Manual Control
```bash
# Start indexer
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/indexer/start

# Stop indexer
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/indexer/stop

# Reprocess from ledger 12000
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startLedger": 12000}' \
  http://localhost:3000/api/indexer/reprocess
```

## Troubleshooting

### Indexer Not Starting
1. Check `ENABLE_INDEXER` environment variable
2. Verify contract addresses are configured
3. Check RPC URL is accessible
4. Review logs for errors

### Events Not Processing
1. Check indexer status endpoint
2. Verify ledgers are advancing
3. Check DLQ for failed events
4. Review contract event formats

### High Ledgers Behind
1. Increase polling frequency
2. Increase batch size
3. Check RPC performance
4. Review database performance

### DLQ Growing
1. Review failed events
2. Check event format changes
3. Verify database schema
4. Manual reprocessing may be needed

## Best Practices

### Development
- ✅ Test with testnet first
- ✅ Monitor DLQ regularly
- ✅ Set up alerts for critical metrics
- ✅ Keep contract addresses updated

### Production
- ✅ Use dedicated RPC endpoint
- ✅ Set appropriate polling interval
- ✅ Monitor indexer health
- ✅ Regular DLQ cleanup
- ✅ Backup checkpoint data

### Maintenance
- ✅ Review logs weekly
- ✅ Clear old DLQ entries
- ✅ Update event handlers for new contracts
- ✅ Test reprocessing periodically

## Future Enhancements

### Planned Features
1. **Multi-threaded Processing**: Parallel ledger processing
2. **Event Subscriptions**: WebSocket-based real-time events
3. **Historical Sync**: Bulk import from genesis
4. **Event Replay**: Replay events for testing
5. **Metrics Dashboard**: Real-time monitoring UI
6. **Auto-recovery**: Automatic DLQ reprocessing

### Potential Improvements
- GraphQL subscriptions for events
- Event filtering by market/user
- Custom event handlers via plugins
- Distributed indexing for high volume

## Security

### Access Control
- ✅ Admin-only endpoints
- ✅ JWT authentication required
- ✅ Wallet address verification

### Data Integrity
- ✅ Transaction hash verification
- ✅ Ledger sequence validation
- ✅ Event signature checking

### Audit Trail
- ✅ All events logged
- ✅ Checkpoint history maintained
- ✅ DLQ for failed events

## Conclusion

The Blockchain Event Indexer Service provides reliable, real-time synchronization between the Stellar blockchain and the application database. It ensures data consistency, handles errors gracefully, and provides admin tools for monitoring and control.

For support or questions, review the logs and DLQ, or contact the development team.
