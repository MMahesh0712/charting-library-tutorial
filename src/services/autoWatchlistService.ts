/**
 * Auto Watchlist Service
 * Maintains the 8 active underlyings (indices + commodities) and their ATM options.
 * Fetches from data-hub's /api/v1/active-options endpoint every 30 seconds.
 */

import { getApiBase } from './api/config';
import { SYMBOL_REGISTRY } from '../utils/symbolNormalization'; // TSK-CS-019: single source of truth
import logger from '../utils/logger';
import type { ActiveOption, ActiveMarketsState } from '../types/domain/trades';

// Re-export shared types from the domain layer so existing importers keep working
export type { ActiveOption, ActiveMarketsState as AutoWatchlistState } from '../types/domain/trades';

/** Local alias for use within this file */
type AutoWatchlistState = ActiveMarketsState;

/**
 * TSK-CS-019: ACTIVE_UNDERLYINGS derived from SYMBOL_REGISTRY — single source of truth.
 * step, exchange, segment are taken directly from the registry; no duplicate hardcoding.
 */
export const ACTIVE_UNDERLYINGS = [
  'NIFTY 50',
  'NIFTY BANK',
  'NIFTY FIN SERVICE',
  'NIFTY MID SELECT',
  'SENSEX',
  'BANKEX',
  'CRUDEOIL',
  'NATURALGAS',
].map((name) => {
  const entry = SYMBOL_REGISTRY[name];
  if (!entry) throw new Error(`[AutoWatchlist] Unknown underlying: ${name}`);
  return {
    name,
    alias: entry.underlyingAlias,
    exchange: entry.exchange,
    segment: entry.segment,
    step: entry.step,
  };
}) as ReadonlyArray<{ name: string; alias: string; exchange: string; segment: string; step: number }>;

// NOTE: ActiveOption and AutoWatchlistState are now defined in types/domain/trades.ts
// and re-exported above. Local definitions removed to avoid duplication.

type Listener = (state: AutoWatchlistState) => void;

const REFRESH_INTERVAL_MS = 30_000; // 30 seconds

class AutoWatchlistService {
  private state: AutoWatchlistState = {
    options: [],
    isLoading: false,
    lastUpdated: null,
    error: null,
  };

  private listeners: Set<Listener> = new Set();
  private timer: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;

  /**
   * Subscribe to state changes. Returns unsubscribe function.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    // Start polling on first subscriber
    if (this.listeners.size === 1) {
      this._startPolling();
    }

    // Immediately fire with current state
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
      // Stop polling when no subscribers
      if (this.listeners.size === 0) {
        this._stopPolling();
      }
    };
  }

  /**
   * Force an immediate refresh.
   */
  async refresh(): Promise<void> {
    await this._fetchActiveOptions();
  }

  private _notify(): void {
    for (const listener of this.listeners) {
      try { listener(this.state); } catch (_) { }
    }
  }

  private _startPolling(): void {
    // Fetch immediately
    this._fetchActiveOptions();
    // Then every 30 seconds
    this.timer = setInterval(() => this._fetchActiveOptions(), REFRESH_INTERVAL_MS);
  }

  private _stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async _fetchActiveOptions(): Promise<void> {
    // Abort any in-flight request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.state = { ...this.state, isLoading: true, error: null };
    this._notify();

    try {
      const response = await fetch(`${getApiBase()}/active-options`, {
        method: 'GET',
        credentials: 'include',
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { status?: string; data?: ActiveOption[] };

      if (data && data.status === 'success' && Array.isArray(data.data)) {
        this.state = {
          options: data.data,
          isLoading: false,
          lastUpdated: Date.now(),
          error: null,
        };
      } else {
        this.state = {
          ...this.state,
          isLoading: false,
          error: 'Invalid response format',
        };
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      logger.warn('[AutoWatchlist] Fetch error:', err);
      this.state = {
        ...this.state,
        isLoading: false,
        error: (err as Error).message,
      };
    }

    this._notify();
  }
}

// Singleton instance
export const autoWatchlistService = new AutoWatchlistService();
