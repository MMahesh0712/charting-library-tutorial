/**
 * Drawings Service
 * Handles saving and loading chart drawings to/from the backend
 */

import { getApiKey, getApiBase } from './api/config';
import logger from '../utils/logger';

/** Drawing object structure (from LineToolManager) */
export interface Drawing {
  id: string;
  type: string;
  points: Array<{ time: number; price: number }>;
  options?: Record<string, unknown>;
}

/** API response structure */
interface ChartApiResponse {
  status: 'success' | 'error';
  data?: Record<string, string>;
  message?: string;
}

// Extend Window interface for chart prefs cache
declare global {
  interface Window {
    _chartPrefsCache?: Record<string, string>;
  }
}

/**
 * Save chart drawings to backend
 * @param symbol - Trading symbol
 * @param exchange - Exchange code
 * @param interval - Chart interval
 * @param drawings - Array of drawing objects from LineToolManager.exportDrawings()
 * @returns Success status
 */
export const saveDrawings = async (
  symbol: string,
  exchange: string = 'NSE',
  interval: string = '1d',
  drawings: Drawing[],
  chartId?: string
): Promise<boolean> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      logger.warn('[DrawingsService] saveDrawings: No API key');
      return false;
    }

    // TSK-CS-012: Include chartId in key so multi-chart same-symbol doesn't collide
    const keyParts = ['drawings', symbol, exchange, interval];
    if (chartId) keyParts.push(chartId);
    const drawingsKey = keyParts.join('_');

    const response = await fetch(`${getApiBase()}/chart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        apikey: apiKey,
        [drawingsKey]: JSON.stringify(drawings),
      }),
    });

    if (!response.ok) {
      logger.error('[DrawingsService] saveDrawings error:', response.status);
      return false;
    }

    const data = (await response.json()) as ChartApiResponse;
    logger.debug('[DrawingsService] saveDrawings success:', {
      symbol,
      exchange,
      interval,
      count: drawings.length,
    });
    return data.status === 'success';
  } catch (error) {
    logger.error('[DrawingsService] Error saving drawings:', error);
    return false;
  }
};

/**
 * Load chart drawings from backend
 * @param symbol - Trading symbol
 * @param exchange - Exchange code
 * @param interval - Chart interval
 * @returns Array of drawing objects or null if not found
 */
export const loadDrawings = async (
  symbol: string,
  exchange: string = 'NSE',
  interval: string = '1d',
  chartId?: string
): Promise<Drawing[] | null> => {
  // TSK-CS-012: Include chartId in key so multi-chart same-symbol doesn't collide
  const keyParts = ['drawings', symbol, exchange, interval];
  if (chartId) keyParts.push(chartId);
  const drawingsKey = keyParts.join('_');

  // First, check if CloudSync has already loaded data (stored in global cache)
  if (window._chartPrefsCache && window._chartPrefsCache[drawingsKey]) {
    try {
      const cached = window._chartPrefsCache[drawingsKey];
      const drawings =
        typeof cached === 'string' ? (JSON.parse(cached) as Drawing[]) : cached;
      logger.debug('[DrawingsService] loadDrawings from cache:', {
        symbol,
        exchange,
        interval,
        count: Array.isArray(drawings) ? drawings.length : 0,
      });
      return drawings as Drawing[];
    } catch (parseError) {
      logger.warn('[DrawingsService] Failed to parse cached drawings:', parseError);
    }
  }

  // Fallback: make API call
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      logger.debug('[DrawingsService] loadDrawings: No API key, skipping');
      return null;
    }

    const response = await fetch(
      `${getApiBase()}/chart?apikey=${encodeURIComponent(apiKey)}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    // 400 likely means no data saved yet - treat as empty result
    if (response.status === 400) {
      logger.debug('[DrawingsService] loadDrawings: No saved preferences yet');
      return null;
    }

    if (!response.ok) {
      if (response.status === 401) {
        return null;
      }
      logger.debug('[DrawingsService] loadDrawings status:', response.status);
      return null;
    }

    const data = (await response.json()) as ChartApiResponse;

    if (data.status === 'success' && data.data) {
      // Store in cache for future use
      if (!window._chartPrefsCache) window._chartPrefsCache = {};
      Object.assign(window._chartPrefsCache, data.data);

      const drawingsJson = data.data[drawingsKey];

      if (drawingsJson) {
        try {
          const drawings = JSON.parse(drawingsJson) as Drawing[];
          logger.debug('[DrawingsService] loadDrawings success:', {
            symbol,
            exchange,
            interval,
            count: drawings.length,
          });
          return drawings;
        } catch (parseError) {
          logger.warn('[DrawingsService] Failed to parse drawings JSON:', parseError);
          return null;
        }
      }
    }

    return null;
  } catch (error) {
    logger.debug('[DrawingsService] loadDrawings error:', (error as Error).message);
    return null;
  }
};

export default {
  saveDrawings,
  loadDrawings,
};
