// backend/src/utils/metricsTracker.ts - Utility functions for tracking metrics
import {
  trackBlockchainCall,
  trackBlockchainError,
  trackPrediction,
  trackTrade,
  trackWebSocketConnection,
  trackWebSocketMessage,
  predictionCommitDuration,
  predictionRevealDuration,
  tradeDuration,
  databaseQueryDuration,
  databaseQueryErrors,
  cacheHits,
  cacheMisses,
  activeMarkets,
  marketCreations,
  marketResolutions,
} from '../config/metrics.js';

/**
 * Wrapper to track blockchain operations with timing
 */
export async function trackBlockchainOperation<T>(
  operation: string,
  contract: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = (Date.now() - startTime) / 1000;
    trackBlockchainCall(operation, contract, 'success', duration);
    return result;
  } catch (error: any) {
    const duration = (Date.now() - startTime) / 1000;
    trackBlockchainCall(operation, contract, 'error', duration);
    trackBlockchainError(operation, contract, error.name || 'UnknownError');
    throw error;
  }
}

/**
 * Track prediction commit with timing
 */
export async function trackPredictionCommit<T>(
  marketId: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = (Date.now() - startTime) / 1000;
    predictionCommitDuration.observe(duration);
    trackPrediction('commit', marketId);
    return result;
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    predictionCommitDuration.observe(duration);
    throw error;
  }
}

/**
 * Track prediction reveal with timing
 */
export async function trackPredictionReveal<T>(
  marketId: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = (Date.now() - startTime) / 1000;
    predictionRevealDuration.observe(duration);
    trackPrediction('reveal', marketId);
    return result;
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    predictionRevealDuration.observe(duration);
    throw error;
  }
}

/**
 * Track trade operation with timing
 */
export async function trackTradeOperation<T>(
  marketId: string,
  tradeType: 'buy' | 'sell',
  outcome: string,
  volumeUsdc: number,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = (Date.now() - startTime) / 1000;
    tradeDuration.labels(tradeType).observe(duration);
    trackTrade(marketId, tradeType, outcome, volumeUsdc);
    return result;
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    tradeDuration.labels(tradeType).observe(duration);
    throw error;
  }
}

/**
 * Track database query with timing
 */
export async function trackDatabaseQuery<T>(
  operation: string,
  table: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = (Date.now() - startTime) / 1000;
    databaseQueryDuration.labels(operation, table).observe(duration);
    return result;
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    databaseQueryDuration.labels(operation, table).observe(duration);
    databaseQueryErrors.labels(operation, table).inc();
    throw error;
  }
}

/**
 * Track cache hit
 */
export function trackCacheHit(cacheKey: string): void {
  cacheHits.labels(cacheKey).inc();
}

/**
 * Track cache miss
 */
export function trackCacheMiss(cacheKey: string): void {
  cacheMisses.labels(cacheKey).inc();
}

/**
 * Update active markets gauge
 */
export function updateActiveMarkets(count: number): void {
  activeMarkets.set(count);
}

/**
 * Track market creation
 */
export function trackMarketCreation(category: string): void {
  marketCreations.labels(category).inc();
}

/**
 * Track market resolution
 */
export function trackMarketResolution(outcome: string): void {
  marketResolutions.labels(outcome).inc();
}

/**
 * Export WebSocket tracking functions
 */
export { trackWebSocketConnection, trackWebSocketMessage };
