/**
 * Chart Data Service
 * Handles OHLC data fetching (klines) and market quotes/depth
 */

import logger from '../utils/logger';
import { getApiBase, getLoginUrl, getApiKey, convertInterval } from './api/config';
import { safeParseJSON } from './storageService';

/** Candle/OHLC data structure */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Ticker price response */
export interface TickerPrice {
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  symbol: string;
  volume: number;
  open: number;
}

/** Depth level */
export interface DepthLevel {
  price: number;
  quantity: number;
}

/** Market depth response */
export interface DepthData {
  asks: DepthLevel[];
  bids: DepthLevel[];
  ltp: number;
  ltq: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  volume: number;
  oi: number;
  totalBuyQty: number;
  totalSellQty: number;
}

/** API response structure */
interface HistoryApiResponse {
  data?: Array<{
    timestamp?: number;
    date?: string;
    datetime?: string;
    open?: number | string;
    high?: number | string;
    low?: number | string;
    close?: number | string;
    volume?: number | string;
  }>;
}

/** Quotes API response */
interface QuotesApiResponse {
  data?: {
    ltp?: number | string;
    last_price?: number | string;
    prev_close?: number | string;
    previous_close?: number | string;
    open?: number | string;
    high?: number | string;
    low?: number | string;
    volume?: number | string;
  };
}

/** Depth API response */
interface DepthApiResponse {
  data?: {
    asks?: Array<{ price?: number | string; quantity?: number | string }>;
    bids?: Array<{ price?: number | string; quantity?: number | string }>;
    ltp?: number | string;
    ltq?: number | string;
    high?: number | string;
    low?: number | string;
    open?: number | string;
    prev_close?: number | string;
    volume?: number | string;
    oi?: number | string;
    totalbuyqty?: number | string;
    totalsellqty?: number | string;
  };
}

/**
 * HIGH FIX BUG-10: Safe parseFloat that prevents NaN propagation
 * @param value - Value to parse
 * @param fallback - Fallback value if parsing fails (default: 0)
 * @returns Parsed number or fallback
 */
const safeParseFloat = (value: unknown, fallback: number = 0): number => {
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Module-scoped cache for previous close prices
 * Used by WebSocket updates which don't include prev_close (mode 2)
 */
const prevCloseCache = new Map<string, number>();
const MAX_PREV_CLOSE_CACHE_SIZE = 200;

/**
 * Get cached previous close for a symbol
 * Used by WebSocket subscriptions which don't receive prev_close
 * @param symbol - Trading symbol
 * @param exchange - Exchange code
 * @returns Cached prev_close or undefined
 */
export const getCachedPrevClose = (symbol: string, exchange: string = 'NSE'): number | undefined => {
  return prevCloseCache.get(`${symbol}:${exchange}`);
};

/**
 * Set cached previous close for a symbol
 * @param symbol - Trading symbol
 * @param exchange - Exchange code
 * @param prevClose - Previous close price
 */
export const setCachedPrevClose = (symbol: string, exchange: string, prevClose: number): void => {
  // Evict oldest entry if cache is at capacity
  if (prevCloseCache.size >= MAX_PREV_CLOSE_CACHE_SIZE) {
    const firstKey = prevCloseCache.keys().next().value;
    if (firstKey) prevCloseCache.delete(firstKey);
  }
  prevCloseCache.set(`${symbol}:${exchange}`, prevClose);
};

// IST offset for consistent time display
const IST_OFFSET_SECONDS = 19800; // 5 hours 30 minutes in seconds

/**
 * Get historical OHLC data (klines)
 * @param symbol - Trading symbol (e.g., 'RELIANCE')
 * @param exchange - Exchange code (e.g., 'NSE')
 * @param interval - Interval (e.g., '1d', '1h', '5m')
 * @param limit - Number of candles (default 1000)
 * @param signal - Optional abort signal
 */
export const getKlines = async (
  symbol: string,
  exchange: string = 'NSE',
  interval: string = '1d',
  _limit: number = 1000,
  signal?: AbortSignal
): Promise<Candle[]> => {
  try {
    // Calculate date range (last 2 years for daily, adjust for intraday)
    const endDate = new Date();
    const startDate = new Date();

    // Adjust start date based on interval to ensure enough candles (target: 235+)
    // Indian markets have ~6 trading hours/day (9:15 AM - 3:30 PM)
    if (interval.includes('h')) {
      // Hourly intervals need more days to get 235 candles
      startDate.setDate(startDate.getDate() - 180);
    } else if (interval.includes('m')) {
      // Minute intervals: scale days based on granularity
      const minutes = parseInt(interval);
      if (!isNaN(minutes) && minutes < 15) {
        startDate.setDate(startDate.getDate() - 15);
      } else {
        startDate.setDate(startDate.getDate() - 90);
      }
    } else if (/^(W|1w|M|1M)$/i.test(interval)) {
      startDate.setFullYear(startDate.getFullYear() - 10); // 10 years for weekly/monthly
    } else {
      startDate.setFullYear(startDate.getFullYear() - 2); // 2 years for daily
    }

    const formatDate = (d: Date): string => d.toISOString().split('T')[0] as string;

    const response = await fetch(`${getApiBase()}/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      ...(signal && { signal }),
      body: JSON.stringify({
        apikey: getApiKey(),
        symbol,
        exchange,
        interval: convertInterval(interval),
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
      }),
    });

    logger.debug('[OpenAlgo] History request:', {
      symbol,
      exchange,
      interval: convertInterval(interval),
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = getLoginUrl();
        return [];
      }
      throw new Error(`OpenAlgo history error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as HistoryApiResponse;
    logger.debug('[OpenAlgo] History response:', data);

    // Transform OpenAlgo/data-hub response to lightweight-charts format
    // NOTE: data-hub /api/v1/history returns `time` already as UTC unix seconds.
    // Do NOT add IST_OFFSET_SECONDS here — that would shift candles 5.5h into the future.
    if (data && data.data && Array.isArray(data.data)) {
      const candles: Candle[] = data.data
        .map((d) => {
          let time: number;
          if (typeof d.timestamp === 'number') {
            // data-hub returns pre-computed unix seconds — use as-is
            time = d.timestamp;
          } else if (d.date || d.datetime) {
            // Fallback for raw ISO string (should not happen with current data-hub)
            time = new Date(d.date || d.datetime || 0).getTime() / 1000;
          } else {
            time = 0;
          }

          return {
            time,
            open: safeParseFloat(d.open),
            high: safeParseFloat(d.high),
            low: safeParseFloat(d.low),
            close: safeParseFloat(d.close),
            volume: safeParseFloat(d.volume, 0),
          };
        })
        .filter(
          (candle) =>
            candle &&
            candle.time > 0 &&
            [candle.open, candle.high, candle.low, candle.close].every((value) =>
              Number.isFinite(value)
            )
        );

      // Sort by time ascending and remove duplicates
      // Use forward loop with push (O(1)) instead of backward loop with unshift (O(n))
      candles.sort((a, b) => a.time - b.time);
      const deduped: Candle[] = [];
      const seenTimes = new Set<number>();
      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        if (candle && !seenTimes.has(candle.time)) {
          seenTimes.add(candle.time);
          deduped.push(candle);
        }
      }
      return deduped;
    }

    return [];
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      logger.error('[ChartData] Error fetching klines:', error);
    }
    return [];
  }
};

/**
 * Get historical OHLC data with explicit date range (for pagination/scroll loading)
 * @param symbol - Trading symbol
 * @param exchange - Exchange code
 * @param interval - Interval
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param signal - Optional abort signal
 */
export const getHistoricalKlines = async (
  symbol: string,
  exchange: string = 'NSE',
  interval: string = '1d',
  startDate: string,
  endDate: string,
  signal?: AbortSignal
): Promise<Candle[]> => {
  try {
    const response = await fetch(`${getApiBase()}/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      ...(signal && { signal }),
      body: JSON.stringify({
        apikey: getApiKey(),
        symbol,
        exchange,
        interval: convertInterval(interval),
        start_date: startDate,
        end_date: endDate,
      }),
    });

    logger.debug('[OpenAlgo] Historical request:', {
      symbol,
      exchange,
      interval: convertInterval(interval),
      start_date: startDate,
      end_date: endDate,
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = getLoginUrl();
        return [];
      }
      throw new Error(`OpenAlgo history error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as HistoryApiResponse;
    logger.debug('[OpenAlgo] Historical response:', data);

    // Same fix as getKlines: data-hub returns UTC unix seconds, no IST offset needed
    if (data && data.data && Array.isArray(data.data)) {
      const candles: Candle[] = data.data
        .map((d) => {
          let time: number;
          if (typeof d.timestamp === 'number') {
            time = d.timestamp; // Already UTC unix seconds from data-hub
          } else if (d.date || d.datetime) {
            time = new Date(d.date || d.datetime || 0).getTime() / 1000;
          } else {
            time = 0;
          }

          return {
            time,
            open: safeParseFloat(d.open),
            high: safeParseFloat(d.high),
            low: safeParseFloat(d.low),
            close: safeParseFloat(d.close),
            volume: safeParseFloat(d.volume, 0),
          };
        })
        .filter(
          (candle) =>
            candle &&
            candle.time > 0 &&
            [candle.open, candle.high, candle.low, candle.close].every((value) =>
              Number.isFinite(value)
            )
        );

      // Sort by time ascending and remove duplicates
      // Use forward loop with push (O(1)) instead of backward loop with unshift (O(n))
      candles.sort((a, b) => a.time - b.time);
      const deduped: Candle[] = [];
      const seenTimes = new Set<number>();
      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        if (candle && !seenTimes.has(candle.time)) {
          seenTimes.add(candle.time);
          deduped.push(candle);
        }
      }
      return deduped;
    }

    return [];
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      logger.error('[ChartData] Error fetching historical klines:', error);
    }
    return [];
  }
};

/**
 * Get 24hr ticker price data
 * @param symbol - Trading symbol
 * @param exchange - Exchange code
 * @param signal - Optional abort signal
 */
export const getTickerPrice = async (
  symbol: string,
  exchange: string = 'NSE',
  signal?: AbortSignal
): Promise<TickerPrice | null> => {
  try {
    const response = await fetch(`${getApiBase()}/quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      ...(signal && { signal }),
      body: JSON.stringify({
        apikey: getApiKey(),
        symbol,
        exchange,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = getLoginUrl();
        return null;
      }

      // Try to read custom error message from backend
      let errorMessage = `OpenAlgo quotes error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.text();
        if (errorData) {
          const jsonError = safeParseJSON<{ message?: string } | null>(errorData, null);
          if (jsonError && jsonError.message) errorMessage = jsonError.message;
          else errorMessage = errorData;
        }
      } catch (e) {
        logger.debug('[ChartData] Failed to read error response:', e);
      }

      throw new Error(errorMessage);
    }

    const data = (await response.json()) as QuotesApiResponse;
    logger.debug('[OpenAlgo] Quotes request:', { symbol, exchange });
    logger.debug('[OpenAlgo] Quotes response:', data);

    if (data && data.data) {
      const quoteData = data.data;
      const ltp = parseFloat(String(quoteData.ltp || quoteData.last_price || 0));

      // prev_close can be 0 from some brokers - need explicit check for valid value
      let prevClose = parseFloat(String(quoteData.prev_close || quoteData.previous_close || 0));

      // If prev_close is 0 or invalid, fall back to open price
      if (prevClose <= 0) {
        prevClose = parseFloat(String(quoteData.open || ltp));
        logger.debug('[OpenAlgo] prev_close unavailable, using open as fallback:', prevClose);
      }

      const change = ltp - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      // Cache prev_close for WebSocket updates
      setCachedPrevClose(symbol, exchange, prevClose);

      return {
        lastPrice: ltp.toString(),
        priceChange: change.toFixed(2),
        priceChangePercent: changePercent.toFixed(2),
        symbol: symbol,
        volume: parseFloat(String(quoteData.volume || 0)),
        open: parseFloat(String(quoteData.open || 0)),
      };
    }

    if (!data || !data.data) {
      logger.warn('[OpenAlgo] No data in quotes response for', symbol, data);
    }
    return null;
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      logger.error('[ChartData] Error fetching ticker price:', error);
      throw error;
    }
    return null;
  }
};

/**
 * Get Market Depth (DOM) data
 * Returns 5 best bid/ask levels with prices and quantities
 * @param symbol - Trading symbol (e.g., 'NIFTY31JUL25FUT')
 * @param exchange - Exchange code (e.g., 'NFO', 'NSE')
 * @param signal - Optional abort signal
 * @returns Depth data with bids, asks, totals, and market info
 */
export const getDepth = async (
  symbol: string,
  exchange: string = 'NSE',
  signal?: AbortSignal
): Promise<DepthData | null> => {
  try {
    const response = await fetch(`${getApiBase()}/depth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      ...(signal && { signal }),
      body: JSON.stringify({
        apikey: getApiKey(),
        symbol,
        exchange,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = getLoginUrl();
        return null;
      }
      throw new Error(`OpenAlgo depth error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DepthApiResponse;
    logger.debug('[OpenAlgo] Depth request:', { symbol, exchange });
    logger.debug('[OpenAlgo] Depth response:', data);

    if (data && data.data) {
      const depthData = data.data;
      return {
        asks: (depthData.asks || []).map((a) => ({
          price: parseFloat(String(a.price || 0)),
          quantity: parseInt(String(a.quantity || 0), 10),
        })),
        bids: (depthData.bids || []).map((b) => ({
          price: parseFloat(String(b.price || 0)),
          quantity: parseInt(String(b.quantity || 0), 10),
        })),
        ltp: parseFloat(String(depthData.ltp || 0)),
        ltq: parseInt(String(depthData.ltq || 0), 10),
        high: parseFloat(String(depthData.high || 0)),
        low: parseFloat(String(depthData.low || 0)),
        open: parseFloat(String(depthData.open || 0)),
        prevClose: parseFloat(String(depthData.prev_close || 0)),
        volume: parseInt(String(depthData.volume || 0), 10),
        oi: parseInt(String(depthData.oi || 0), 10),
        totalBuyQty: parseInt(String(depthData.totalbuyqty || 0), 10),
        totalSellQty: parseInt(String(depthData.totalsellqty || 0), 10),
      };
    }

    return null;
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      logger.error('[ChartData] Error fetching depth:', error);
    }
    return null;
  }
};

export default {
  getKlines,
  getHistoricalKlines,
  getTickerPrice,
  getDepth,
  getCachedPrevClose,
  setCachedPrevClose,
};
