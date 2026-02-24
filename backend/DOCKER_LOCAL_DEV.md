# Docker Compose Local Development Setup

This document describes the local development environment with Soroban integration.

## Overview

The Docker Compose setup now includes:
- **PostgreSQL** - Main database
- **PostgreSQL Test** - Test database
- **Redis** - Caching and session storage
- **Soroban Node** - Local Stellar blockchain with Soroban smart contracts
- **Backend** - Node.js API server with auto-initialization

## Services

### Soroban (Stellar Quickstart)
- **Image**: `stellar/quickstart:testing`
- **Ports**:
  - `8000` - Horizon API (Stellar REST API)
  - `8001` - Soroban RPC (Smart contract interaction)
  - `11626` - Stellar Core peer port
  - `11625` - Stellar Core admin port
- **Network**: Standalone (local development)

### Backend
- **Auto-initialization**: On startup, the backend will:
  1. Wait for Soroban node to be ready
  2. Generate a deployer identity
  3. Deploy test USDC token
  4. Build and deploy all 5 Soroban contracts (Oracle, Factory, Treasury, AMM, Market)
  5. Initialize contracts with proper configuration
  6. Run database migrations
  7. Seed database with test markets and users

## Quick Start

### 1. Start all services
```bash
cd backend
docker-compose up -d
```

### 2. View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f soroban
```

### 3. Check initialization status
The backend container will show initialization progress in the logs:
```bash
docker-compose logs -f backend | grep INIT
```

### 4. Access services
- **Backend API**: http://localhost:3000
- **Horizon API**: http://localhost:8000
- **Soroban RPC**: http://localhost:8001
- **PostgreSQL**: localhost:5434
- **Redis**: localhost:6379

## Test Credentials

After seeding, you can login with:
- **Email**: `admin@boxmeout.com`
- **Password**: `password123`

Other test users:
- `john@example.com` / `password123`
- `sarah@example.com` / `password123`
- `mike@example.com` / `password123`

## Contract Addresses

After initialization, contract addresses are saved to `/app/.env.local` inside the container.

To view them:
```bash
docker-compose exec backend cat /app/.env.local
```

## Manual Contract Interaction

### Using Stellar CLI from host
```bash
# Install stellar CLI locally
curl -L https://github.com/stellar/stellar-cli/releases/download/v21.5.0/stellar-cli-21.5.0-x86_64-unknown-linux-musl.tar.gz | tar xz

# Interact with contracts
./stellar contract invoke \
  --id <CONTRACT_ID> \
  --network standalone \
  --rpc-url http://localhost:8001 \
  -- <function_name> <args>
```

### Using Stellar CLI from container
```bash
docker-compose exec backend stellar contract invoke \
  --id <CONTRACT_ID> \
  --network standalone \
  --rpc-url http://soroban:8001 \
  -- <function_name> <args>
```

## Troubleshooting

### Backend fails to start
Check if Soroban is healthy:
```bash
curl http://localhost:8000/
```

### Contracts not deploying
1. Check if contracts are built:
```bash
docker-compose exec backend ls -la /app/contracts/contracts/boxmeout/target/wasm32-unknown-unknown/release/
```

2. Rebuild contracts manually:
```bash
docker-compose exec backend bash
cd /app/contracts
cargo build --release --target wasm32-unknown-unknown
```

### Reset everything
```bash
docker-compose down -v
docker-compose up -d
```

## Environment Variables

Key environment variables in `.env.docker`:
- `INIT_LOCAL_DEV=true` - Enables auto-initialization
- `STELLAR_NETWORK=standalone` - Uses local Soroban node
- `STELLAR_HORIZON_URL=http://soroban:8000` - Horizon API endpoint
- `STELLAR_SOROBAN_RPC_URL=http://soroban:8001` - Soroban RPC endpoint

## Development Workflow

1. **Start services**: `docker-compose up -d`
2. **Make code changes**: Edit files locally
3. **Rebuild backend**: `docker-compose up -d --build backend`
4. **View logs**: `docker-compose logs -f backend`
5. **Run tests**: `docker-compose exec backend npm test`
6. **Stop services**: `docker-compose down`

## Database Management

### Run migrations
```bash
docker-compose exec backend npx prisma migrate dev
```

### Seed database
```bash
docker-compose exec backend npx prisma db seed
```

### Access database
```bash
docker-compose exec postgres psql -U postgres -d boxmeout_dev
```

## Backup and Restore

The `db-backup` service automatically backs up the database every 6 hours.

### Manual backup
```bash
docker-compose exec db-backup /scripts/backup.sh
```

### Restore from backup
```bash
docker-compose exec db-backup /scripts/restore.sh <backup_file>
```

## Production Deployment

For production, disable auto-initialization:
1. Set `INIT_LOCAL_DEV=false` in `.env.docker`
2. Use testnet or mainnet Soroban RPC URLs
3. Deploy contracts manually using `../deploy.sh`
4. Update contract addresses in `.env`

## Additional Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/)
- [Stellar Quickstart](https://github.com/stellar/quickstart)
