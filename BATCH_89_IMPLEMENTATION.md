# Batch-89: BOXMEOUT Platform Enhancements

Comprehensive implementation documentation for issues #1251, #1276, #1277, and #1281.

---

## Issue #1281: F-63 — Market Search Box on Home Page

### API Client Function

```typescript
// frontend/lib/api.ts (add to existing file)
export async function searchMarkets(query: string): Promise<Market[]> {
  if (!query.trim()) {
    return [];
  }

  const response = await fetch(`/api/markets/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(`Market search failed: ${response.statusText}`);
  }

  return response.json();
}
```

### Market Search Hook

```typescript
// frontend/hooks/useMarketSearch.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { searchMarkets } from '@/lib/api';

interface UseMarketSearchOptions {
  debounceMs?: number;
}

export function useMarketSearch(options: UseMarketSearchOptions = {}) {
  const debounceMs = options.debounceMs || 300;
  const [results, setResults] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();
  const router = useRouter();

  const search = useCallback(async (query: string) => {
    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Update URL
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set('q', query);
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);

    // Skip if empty
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    // Debounce search
    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await searchMarkets(query);
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);
  }, [debounceMs]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return { results, loading, error, search };
}
```

### Updated Market Filter Bar Component

```typescript
// frontend/components/MarketFilterBar.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMarketSearch } from '@/hooks/useMarketSearch';
import styles from './MarketFilterBar.module.css';

export interface MarketFilterBarProps {
  onFilterChange?: (filters: FilterState) => void;
  onSearchResults?: (results: Market[]) => void;
}

export interface FilterState {
  category?: string;
  sortBy?: 'trending' | 'ending-soon' | 'volume';
  q?: string;
}

export function MarketFilterBar({ onFilterChange, onSearchResults }: MarketFilterBarProps) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>({
    category: searchParams.get('category') || '',
    sortBy: (searchParams.get('sort') as any) || 'trending',
    q: searchParams.get('q') || '',
  });

  const { results, loading, error, search } = useMarketSearch({ debounceMs: 300 });

  useEffect(() => {
    onSearchResults?.(results);
  }, [results, onSearchResults]);

  const handleSearchChange = (query: string) => {
    setFilters(prev => ({ ...prev, q: query }));
    search(query);
    onFilterChange?.({ ...filters, q: query });
  };

  const handleCategoryChange = (category: string) => {
    setFilters(prev => ({ ...prev, category }));
    onFilterChange?.({ ...filters, category });
  };

  const handleSortChange = (sort: string) => {
    setFilters(prev => ({ ...prev, sortBy: sort as any }));
    onFilterChange?.({ ...filters, sortBy: sort as any });
  };

  return (
    <div className={styles.filterBar}>
      {/* Search Input */}
      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search markets..."
          value={filters.q}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={styles.searchInput}
          aria-label="Search markets"
        />
        {loading && <span className={styles.searchSpinner}>⟳</span>}
        {error && <span className={styles.searchError} title={error}>⚠️</span>}
      </div>

      {/* Category Filter */}
      <select
        value={filters.category}
        onChange={(e) => handleCategoryChange(e.target.value)}
        className={styles.filterSelect}
        aria-label="Filter by category"
      >
        <option value="">All Categories</option>
        <option value="sports">Sports</option>
        <option value="politics">Politics</option>
        <option value="crypto">Crypto</option>
        <option value="other">Other</option>
      </select>

      {/* Sort Filter */}
      <select
        value={filters.sortBy}
        onChange={(e) => handleSortChange(e.target.value)}
        className={styles.filterSelect}
        aria-label="Sort by"
      >
        <option value="trending">Trending</option>
        <option value="ending-soon">Ending Soon</option>
        <option value="volume">Volume</option>
      </select>

      {/* Search Results Info */}
      {filters.q && (
        <div className={styles.resultInfo}>
          {results.length > 0 && (
            <span>{results.length} market{results.length !== 1 ? 's' : ''} found</span>
          )}
          {results.length === 0 && !loading && (
            <span className={styles.noResults}>No markets match your search</span>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Issue #1277: F-59 — Add app/not-found.tsx and app/error.tsx

### Not Found Page

```typescript
// frontend/app/not-found.tsx
import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>404</h1>
        <h2 className={styles.subtitle}>Page Not Found</h2>
        <p className={styles.description}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/" className={styles.button}>
          Return Home
        </Link>
      </div>
    </div>
  );
}

export const metadata = {
  title: '404 - Not Found',
  description: 'The page you are looking for could not be found.',
};
```

### Error Page

```typescript
// frontend/app/error.tsx
'use client';

import { useEffect } from 'react';
import styles from './error.module.css';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error('Error:', error);
  }, [error]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Oops!</h1>
        <h2 className={styles.subtitle}>Something went wrong</h2>
        <p className={styles.description}>
          We encountered an unexpected error. Please try again.
        </p>
        {process.env.NODE_ENV === 'development' && error.message && (
          <details className={styles.errorDetails}>
            <summary>Error details (development only)</summary>
            <pre className={styles.errorText}>{error.message}</pre>
          </details>
        )}
        <button onClick={() => reset()} className={styles.button}>
          Try Again
        </button>
        <a href="/" className={styles.secondaryButton}>
          Return Home
        </a>
      </div>
    </div>
  );
}
```

### Styles

```css
/* frontend/app/not-found.module.css */
.container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.content {
  text-align: center;
  color: white;
}

.title {
  font-size: 6rem;
  font-weight: bold;
  margin: 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.subtitle {
  font-size: 2rem;
  margin: 1rem 0;
}

.description {
  font-size: 1.1rem;
  margin-bottom: 2rem;
  opacity: 0.9;
}

.button {
  display: inline-block;
  padding: 0.75rem 2rem;
  background-color: white;
  color: #667eea;
  text-decoration: none;
  border-radius: 0.5rem;
  font-weight: bold;
  transition: transform 0.2s, box-shadow 0.2s;
}

.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

### Market Detail Error Handling

```typescript
// frontend/app/markets/[id]/page.tsx (update existing)
import { notFound } from 'next/navigation';
import { getMarket } from '@/lib/api';
import { MarketDetail } from '@/components/MarketDetail';

interface MarketPageProps {
  params: { id: string };
}

export default async function MarketPage({ params }: MarketPageProps) {
  try {
    const market = await getMarket(params.id);
    return <MarketDetail market={market} />;
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      notFound();
    }
    throw error; // This will trigger error.tsx
  }
}
```

---

## Issue #1276: F-58 — Adopt a Data-Fetching Cache (SWR or React Query)

### Setup with SWR (Recommended for simplicity)

```typescript
// frontend/lib/swr-config.ts
import { SWRConfig } from 'swr';

export const swrConfig: SWRConfig = {
  dedupingInterval: 60000, // 1 minute
  focusThrottleInterval: 300000, // 5 minutes
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  revalidateIfStale: true,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
};

// Global fetcher
export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error('API Error');
    (error as any).status = response.status;
    throw error;
  }
  return response.json();
}
```

### Layout with SWR Provider

```typescript
// frontend/app/layout.tsx
import { SWRConfig } from 'swr';
import { swrConfig, fetcher } from '@/lib/swr-config';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <SWRConfig value={{ ...swrConfig, fetcher }}>
          {children}
        </SWRConfig>
      </body>
    </html>
  );
}
```

### Migrated Hooks

```typescript
// frontend/hooks/useMarket.ts (replaces old implementation)
import useSWR from 'swr';

export function useMarket(id: string | undefined) {
  const { data: market, error, isLoading, mutate } = useSWR(
    id ? `/api/markets/${id}` : null,
    {
      revalidateOnFocus: true,
      dedupingInterval: 60000,
    }
  );

  return {
    market,
    loading: isLoading,
    error: error?.message,
    refetch: mutate,
  };
}

// frontend/hooks/useMarkets.ts
import useSWR from 'swr';

export function useMarkets(filters?: MarketFilters) {
  const queryString = new URLSearchParams(
    Object.entries(filters || {}).reduce((acc, [key, value]) => {
      if (value) acc[key] = String(value);
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  const { data, error, isLoading, mutate } = useSWR(
    `/api/markets?${queryString}`,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  return {
    markets: data || [],
    loading: isLoading,
    error: error?.message,
    refetch: mutate,
  };
}

// frontend/hooks/useMarketBets.ts
import useSWR from 'swr';

export function useMarketBets(marketId: string | undefined) {
  const { data: bets, error, isLoading, mutate } = useSWR(
    marketId ? `/api/markets/${marketId}/bets` : null,
    {
      revalidateOnFocus: true,
    }
  );

  return {
    bets,
    loading: isLoading,
    error: error?.message,
    refetch: mutate,
  };
}

// frontend/hooks/usePortfolio.ts
import useSWR from 'swr';

export function usePortfolio(walletAddress: string | undefined) {
  const { data: portfolio, error, isLoading, mutate } = useSWR(
    walletAddress ? `/api/portfolio/${walletAddress}` : null,
    {
      revalidateOnFocus: true,
      dedupingInterval: 60000,
    }
  );

  return {
    portfolio,
    loading: isLoading,
    error: error?.message,
    refetch: mutate,
  };
}
```

### Mutations with Cache Invalidation

```typescript
// frontend/hooks/usePlaceBet.ts
import useSWR, { mutate } from 'swr';
import { placeBet } from '@/lib/api';

export function usePlaceBet() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const execute = async (marketId: string, amount: number, outcome: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await placeBet(marketId, amount, outcome);

      // Invalidate cache for this market's bets and portfolio
      await mutate(`/api/markets/${marketId}/bets`);
      await mutate((key) => 
        typeof key === 'string' && key.includes('/api/portfolio')
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to place bet';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error };
}

// frontend/hooks/useClaimWinnings.ts
import useSWR, { mutate } from 'swr';
import { claimWinnings } from '@/lib/api';

export function useClaimWinnings() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const execute = async (marketId: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await claimWinnings(marketId);

      // Invalidate cache for portfolio and market bets
      await mutate((key) => 
        typeof key === 'string' && key.includes('/api/portfolio')
      );
      await mutate(`/api/markets/${marketId}/bets`);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim winnings';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error };
}
```

---

## Issue #1251: B-73 — Keep .env.example in Sync with config.ts

### Updated config.ts with Validation

```typescript
// backend/src/config.ts
import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  
  // Database
  DATABASE_URL: z.string().url('Invalid database URL'),
  
  // Stellar
  STELLAR_NETWORK_PASSPHRASE: z.string(),
  STELLAR_HORIZON_URL: z.string().url('Invalid Horizon URL'),
  STELLAR_RPC_URL: z.string().url('Invalid RPC URL'),
  STELLAR_SERVER_SECRET_KEY: z.string(),
  
  // CORS & Security
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('loopback'),
  
  // Admin Configuration
  ADMIN_WALLET_ADDRESSES: z.string()
    .transform(val => val.split(',').map(addr => addr.trim()))
    .default(''),
  
  // Authentication
  WALLET_AUTH_CHALLENGE_TTL_MS: z.string()
    .transform(Number)
    .pipe(z.number().int().positive('TTL must be positive'))
    .default('900000'), // 15 minutes
  
  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('24h'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof envSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    try {
      config = envSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Configuration validation failed:');
        error.errors.forEach(err => {
          console.error(`  ${err.path.join('.')}: ${err.message}`);
        });
      }
      process.exit(1);
    }
  }
  return config;
}
```

### Updated .env.example

```bash
# backend/.env.example
# Server Configuration
# Set to 'development', 'production', or 'test'
NODE_ENV=development

# Port the server listens on
PORT=3000

# Database Connection
# PostgreSQL connection string (required)
DATABASE_URL=postgresql://user:password@localhost:5432/boxmeout

# Stellar Configuration
# The network passphrase (either 'Test SDF Network ; September 2015' or 'Public Global Stellar Network ; September 2015')
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Horizon API endpoint (testnet or public)
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# Soroban RPC endpoint
STELLAR_RPC_URL=https://soroban-testnet.stellar.org

# Server secret key for signing transactions (starts with S)
STELLAR_SERVER_SECRET_KEY=S...

# CORS & Security
# Allowed origin for CORS (comma-separated for multiple origins)
CORS_ORIGIN=http://localhost:3000

# Trust proxy setting: 'loopback', 'linklocal', 'uniquelocal', or a number
TRUST_PROXY=loopback

# Admin Configuration
# Comma-separated list of admin wallet addresses (public keys starting with G)
ADMIN_WALLET_ADDRESSES=GH...

# Authentication
# Time-to-live for SEP-10 auth challenges in milliseconds (default: 900000 = 15 minutes)
WALLET_AUTH_CHALLENGE_TTL_MS=900000

# JWT Secret & Expiry
# Secret key for JWT signing (minimum 32 characters)
JWT_SECRET=your-secret-key-here-at-least-32-characters-long

# JWT expiry time (e.g., '24h', '7d', '30d')
JWT_EXPIRY=24h

# Logging
# Log level: 'debug', 'info', 'warn', 'error'
LOG_LEVEL=info
```

### CI Check Script

```bash
#!/bin/bash
# backend/scripts/check-env-sync.sh
# Verifies that .env.example contains all keys from config.ts

set -e

echo "Checking .env.example sync with config.ts..."

# Extract env keys from config.ts (from z.object{...})
CONFIG_KEYS=$(grep -oP "^\s*[A-Z_]+(?=:)" backend/src/config.ts | sort | uniq)

# Extract env keys from .env.example
ENV_KEYS=$(grep -oP "^[A-Z_]+" backend/.env.example | sort | uniq)

# Compare
MISSING_IN_ENV=$(comm -23 <(echo "$CONFIG_KEYS") <(echo "$ENV_KEYS"))

if [ -n "$MISSING_IN_ENV" ]; then
  echo "❌ The following keys are in config.ts but missing from .env.example:"
  echo "$MISSING_IN_ENV"
  exit 1
fi

echo "✓ .env.example is in sync with config.ts"
exit 0
```

### GitHub Actions Check

```yaml
# backend/.github/workflows/env-check.yml
name: Environment File Sync Check

on:
  pull_request:
    paths:
      - 'backend/src/config.ts'
      - 'backend/.env.example'

jobs:
  check-env-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check env.example sync
        run: bash backend/scripts/check-env-sync.sh
```

---

## Testing Requirements

### Unit Tests
- [ ] Market search with debounce
- [ ] Search URL parameter sync
- [ ] Not found page rendering
- [ ] Error page with retry
- [ ] SWR hook caching
- [ ] Cache invalidation on mutations
- [ ] Config validation

### Integration Tests
- [ ] Search results display in filter bar
- [ ] Market detail calls notFound() on 404
- [ ] Multiple hooks share cached data
- [ ] Mutations invalidate related caches

### E2E Tests
- [ ] User can search for markets
- [ ] Bad market ID shows 404 page
- [ ] Error page retry button works
- [ ] Placing bet updates portfolio cache

---

## Deployment Checklist
- [ ] Install `swr` package
- [ ] Set up SWR provider in root layout
- [ ] Migrate all data hooks to SWR
- [ ] Update mutations to invalidate caches
- [ ] Add not-found.tsx page
- [ ] Add error.tsx page
- [ ] Update market detail route to call notFound()
- [ ] Add search functionality to market filter bar
- [ ] Validate all config keys in backend/src/config.ts
- [ ] Ensure all config keys are documented in .env.example
- [ ] Add CI check script for env sync
- [ ] Test all functionality locally
- [ ] Verify error pages work correctly
