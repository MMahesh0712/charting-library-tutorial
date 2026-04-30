/**
 * Trade Data Service
 * Fetches historical trade data from data-hub for chart marker hydration.
 * Called on chart mount so trade markers survive page refreshes.
 */

import logger from '../utils/logger';
import { getApiBase } from './api/config';
import { getUnderlyingAlias } from '../utils/symbolNormalization';
import type { ChartTrade, ChartTradesResponse } from '../types/domain/trades';

// Re-export shared types from the domain layer so existing importers keep working
export type { ChartTrade, ChartTradesResponse } from '../types/domain/trades';

/**
 * Fetch all trades (open + recently closed) from data-hub.
 * Returns open trades and closed trades from the last 7 days.
 */
export async function fetchChartTrades(): Promise<ChartTradesResponse> {
  try {
    const response = await fetch(`${getApiBase()}/chart-trades`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      logger.warn('[TradeData] chart-trades API returned:', response.status);
      return { open: [], closed: [] };
    }

    const data = await response.json() as { status?: string; data?: ChartTradesResponse };

    if (data && data.status === 'success' && data.data) {
      logger.debug('[TradeData] Loaded trades:', {
        open: data.data.open?.length || 0,
        closed: data.data.closed?.length || 0,
      });
      return data.data;
    }

    return { open: [], closed: [] };
  } catch (error) {
    logger.error('[TradeData] Error fetching chart trades:', error);
    return { open: [], closed: [] };
  }
}

/**
 * Filter trades by index name.
 * Uses symbolNormalization.getUnderlyingAlias() for alias resolution -
 * single source of truth instead of scattered replace chains.
 */
export function getTradesForIndex(
  trades: ChartTrade[],
  index: string
): ChartTrade[] {
  const normalizedIndex = getUnderlyingAlias(index).toUpperCase();

  return trades.filter(t => {
    const tradeIndex = getUnderlyingAlias(t.index || '').toUpperCase();
    return tradeIndex === normalizedIndex;
  });
}

export default {
  fetchChartTrades,
  getTradesForIndex,
};
