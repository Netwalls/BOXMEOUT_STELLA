# Health Check Endpoints

This document describes the health check endpoints available in the BoxMeOut backend API.

## Endpoints

### 1. Basic Health Check (Liveness Probe)
**Endpoint:** `GET /api/health`

Returns a simple status indicating the service is running.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "service": "boxmeout-backend"
}
```

### 2. Readiness Check
**Endpoint:** `GET /api/ready`

Checks if critical dependencies (Database, Redis) are available.

**Response (200 OK):**
```json
{
  "status": "ready",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "database": { "connected": true },
    "redis": { "connected": true, "status": "ready" }
  }
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "not_ready",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "database": { "connected": false },
    "redis": { "connected": false, "status": "disconnected" }
  }
}
```

### 3. Deep Health Check (Comprehensive)
**Endpoint:** `GET /api/health/deep`

Performs comprehensive health checks on all dependencies with detailed metrics.

**Checks:**
- PostgreSQL connectivity and response time
- Redis connectivity and response time
- Soroban RPC reachability and response time

**Response (200 OK - All Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "service": "boxmeout-backend",
  "components": {
    "postgresql": {
      "status": "healthy",
      "connected": true,
      "responseTime": 15
    },
    "redis": {
      "status": "healthy",
      "connected": true,
      "responseTime": 8
    },
    "soroban_rpc": {
      "status": "healthy",
      "reachable": true,
      "responseTime": 120,
      "endpoint": "https://soroban-testnet.stellar.org"
    }
  }
}
```

**Response (503 Service Unavailable - Degraded):**
```json
{
  "status": "degraded",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "service": "boxmeout-backend",
  "components": {
    "postgresql": {
      "status": "healthy",
      "connected": true,
      "responseTime": 15
    },
    "redis": {
      "status": "unhealthy",
      "connected": false,
      "responseTime": 5002,
      "error": "Connection timeout"
    },
    "soroban_rpc": {
      "status": "unhealthy",
      "reachable": false,
      "responseTime": 5001,
      "endpoint": "https://soroban-testnet.stellar.org",
      "error": "Request timeout"
    }
  }
}
```

**Response (503 - Soroban Not Configured):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "service": "boxmeout-backend",
  "components": {
    "postgresql": {
      "status": "healthy",
      "connected": true,
      "responseTime": 15
    },
    "redis": {
      "status": "healthy",
      "connected": true,
      "responseTime": 8
    },
    "soroban_rpc": {
      "status": "not_configured",
      "reachable": false,
      "error": "STELLAR_SOROBAN_RPC_URL not configured"
    }
  }
}
```

## Usage

### Kubernetes Liveness Probe
```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
```

### Kubernetes Readiness Probe
```yaml
readinessProbe:
  httpGet:
    path: /api/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

### Monitoring/Alerting
Use the `/api/health/deep` endpoint for comprehensive monitoring:
```bash
curl http://localhost:3000/api/health/deep
```

## Component Status Values

### PostgreSQL
- `healthy`: Database is connected and responsive
- `unhealthy`: Database connection failed or query timed out

### Redis
- `healthy`: Redis is connected and responding to PING
- `unhealthy`: Redis connection failed or not responding

### Soroban RPC
- `healthy`: RPC endpoint is reachable and responding
- `unhealthy`: RPC endpoint is unreachable or returning errors
- `not_configured`: `STELLAR_SOROBAN_RPC_URL` environment variable not set

## Response Times

All response times are measured in milliseconds and represent the time taken to complete the health check operation.

## Overall Status

The overall status is determined as follows:
- `healthy`: All components are healthy (or Soroban is not_configured)
- `degraded`: One or more components are unhealthy
