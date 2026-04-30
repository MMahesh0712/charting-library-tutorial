/**
 * useAutoWatchlist — React hook for the Auto Watchlist feature.
 *
 * Wraps the AutoWatchlistService to provide reactive state in components.
 * Returns the 8 active indices and their dynamically calculated ATM options.
 *
 * Usage:
 *   const { indices, activeOptions, isLoading, refresh } = useAutoWatchlist();
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  autoWatchlistService,
  ACTIVE_UNDERLYINGS,
  type AutoWatchlistState,
  type ActiveOption,
} from '../services/autoWatchlistService';
import { useWatchlist } from '../context/WatchlistContext';
import { isSameSymbol } from '../utils/symbolNormalization';
import type { IndexLiveData } from '../types/domain/trades';

export interface AutoWatchlistResult {
  /** The 8 active underlyings (constant list with metadata) */
  indices: typeof ACTIVE_UNDERLYINGS;
  /** Dynamically fetched ATM ± 1 strike options for all underlyings */
  activeOptions: ActiveOption[];
  /** Options grouped by underlying name */
  optionsByUnderlying: Record<string, ActiveOption[]>;
  /** TSK-CS-020: Live LTP/change data for each index, keyed by alias e.g. 'NIFTY' */
  indexLiveData: Record<string, IndexLiveData>;
  /** Whether a fetch is in progress */
  isLoading: boolean;
  /** Timestamp of last successful fetch */
  lastUpdated: number | null;
  /** Error message if last fetch failed */
  error: string | null;
  /** Force an immediate refresh */
  refresh: () => Promise<void>;
}

export function useAutoWatchlist(): AutoWatchlistResult {
  const [state, setState] = useState<AutoWatchlistState>({
    options: [],
    isLoading: false,
    lastUpdated: null,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = autoWatchlistService.subscribe((newState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    await autoWatchlistService.refresh();
  }, []);

  // TSK-CS-020: Get live LTP data for index cards from WatchlistContext
  const { watchlistData } = useWatchlist();
  const indexLiveData = useMemo<Record<string, IndexLiveData>>(() => {
    const result: Record<string, IndexLiveData> = {};
    for (const underlying of ACTIVE_UNDERLYINGS) {
      const liveItem = watchlistData.find(d => isSameSymbol(d.symbol, underlying.name));
      if (liveItem && liveItem.ltp) {
        result[underlying.alias] = {
          ltp: liveItem.ltp || 0,
          change: (liveItem as any).change || 0,
          changePercent: (liveItem as any).changePercent || 0,
          prevClose: (liveItem as any).close || 0,
        };
      }
    }
    return result;
  }, [watchlistData]);

  // Enrich active options with live LTP/change.
  // Primary source: backend already includes ltp/changePercent from lastTicks in the active-options response.
  // Secondary source: watchlistData (only relevant if the option happens to be in the watchlist).
  const enrichedOptions = useMemo<ActiveOption[]>(() => {
    return state.options.map(opt => {
      // Try to find a fresher tick in watchlistData (exact symbol match)
      const live = watchlistData.find(d => d.symbol === opt.symbol);
      if (live && live.ltp) {
        return {
          ...opt,
          ltp: live.ltp,
          change: (live as any).change ?? opt.change,
          changePercent: (live as any).changePercent ?? opt.changePercent,
        };
      }
      // Use ltp already provided by the backend in the active-options response
      return opt;
    });
  }, [state.options, watchlistData]);

  // Group options by underlying for easy rendering
  const optionsByUnderlying = useMemo<Record<string, ActiveOption[]>>(() => {
    const groups: Record<string, ActiveOption[]> = {};
    for (const opt of enrichedOptions) {
      const key = opt.underlying || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(opt);
      }
    return groups;
  }, [enrichedOptions]);

  return {
    indices: ACTIVE_UNDERLYINGS,
    activeOptions: enrichedOptions,
    optionsByUnderlying,
    indexLiveData,
    isLoading: state.isLoading,
    lastUpdated: state.lastUpdated,
    error: state.error,
    refresh,
  };
}

export default useAutoWatchlist;
