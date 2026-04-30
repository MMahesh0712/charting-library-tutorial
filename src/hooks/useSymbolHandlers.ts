/**
 * Symbol Handlers Hook
 * Manages symbol operations: change, compare, add to watchlist, remove from watchlist
 */

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { normalizeSymbolExchange } from '../utils/symbolNormalization'; // TSK-CS-021

// ==================== TYPES ====================

/** Scale mode for comparison symbols */
export type CompareScaleMode = 'samePercent' | 'newPriceScale' | 'newPane';

/** Scale mode constants for comparison symbols */
export const COMPARE_SCALE_MODES = {
  SAME_PERCENT: 'samePercent',
  NEW_PRICE_SCALE: 'newPriceScale',
  NEW_PANE: 'newPane',
} as const;

/** Comparison symbol colors */
const COMPARISON_COLORS = ['#f57f17', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5'];

/** Symbol data (can be string for legacy or object) */
export interface SymbolData {
  symbol: string;
  exchange?: string | undefined;
  scaleMode?: CompareScaleMode | undefined;
}

/** Comparison symbol with color */
export interface ComparisonSymbol {
  symbol: string;
  exchange: string;
  color: string;
  scaleMode: CompareScaleMode;
}

/** Chart configuration */
export interface ChartConfig {
  id: number;
  symbol: string;
  exchange: string;
  comparisonSymbols?: ComparisonSymbol[] | undefined;
  strategyConfig?: unknown | null | undefined;
  [key: string]: unknown;
}

/** Watchlist symbol (can be string for legacy or object) */
export type WatchlistSymbol = string | { symbol: string; exchange: string };

/** Watchlist item */
export interface Watchlist {
  id: string;
  name: string;
  symbols: WatchlistSymbol[];
}

/** Watchlists state */
export interface WatchlistsState {
  lists: Watchlist[];
  activeListId: string;
}

/** Search mode types */
export type SearchMode = 'switch' | 'compare' | 'add';

/** Hook parameters */
export interface UseSymbolHandlersParams {
  searchMode: SearchMode;
  setCharts: Dispatch<SetStateAction<ChartConfig[]>>;
  activeChartId: number;
  watchlistSymbols: WatchlistSymbol[];
  /** TSK-CS-018: Use Context domain functions instead of raw setter */
  addSymbolToWatchlist: (symbol: string, exchange?: string) => void;
  removeSymbolFromWatchlist: (symbol: string, exchange?: string | null) => void;
  setIsSearchOpen: Dispatch<SetStateAction<boolean>>;
  setSearchMode: Dispatch<SetStateAction<SearchMode>>;
}

/** Hook return type */
export interface UseSymbolHandlersReturn {
  handleSymbolChange: (symbolData: string | SymbolData) => void;
  handleRemoveFromWatchlist: (symbolData: string | SymbolData) => void;
  handleAddClick: () => void;
  handleSymbolClick: () => void;
  handleCompareClick: () => void;
}

// ==================== HOOK ====================

/**
 * Custom hook for symbol operations
 * @param params - Hook parameters
 * @returns Symbol handler functions
 */
export const useSymbolHandlers = ({
  searchMode,
  setCharts,
  activeChartId,
  watchlistSymbols,
  addSymbolToWatchlist,
  removeSymbolFromWatchlist,
  setIsSearchOpen,
  setSearchMode,
}: UseSymbolHandlersParams): UseSymbolHandlersReturn => {
  // Handle symbol selection based on search mode
  const handleSymbolChange = useCallback(
    (symbolData: string | SymbolData) => {
      // Handle both string (legacy) and object format { symbol, exchange, scaleMode }
      const rawSymbol = typeof symbolData === 'string' ? symbolData : symbolData.symbol;
      const rawExchange = typeof symbolData === 'string' ? 'NSE' : symbolData.exchange || 'NSE';
      // TSK-CS-021: normalize to canonical symbol/exchange at the single entry point
      const { symbol, exchange } = normalizeSymbolExchange(rawSymbol, rawExchange);
      const scaleMode =
        typeof symbolData === 'object' && symbolData.scaleMode
          ? symbolData.scaleMode
          : COMPARE_SCALE_MODES.SAME_PERCENT;

      if (searchMode === 'switch') {
        setCharts((prev) =>
          prev.map((chart) =>
            chart.id === activeChartId
              ? { ...chart, symbol: symbol, exchange: exchange, strategyConfig: null }
              : chart
          )
        );
      } else if (searchMode === 'compare') {
        setCharts((prev) =>
          prev.map((chart) => {
            if (chart.id === activeChartId) {
              const currentComparisons = chart.comparisonSymbols || [];
              // Check both symbol AND exchange to allow same symbol from different exchanges
              const exists = currentComparisons.find(
                (c) => c.symbol === symbol && c.exchange === exchange
              );

              if (exists) {
                // Remove (match both symbol and exchange)
                return {
                  ...chart,
                  comparisonSymbols: currentComparisons.filter(
                    (c) => !(c.symbol === symbol && c.exchange === exchange)
                  ),
                };
              } else {
                // Add with scale mode
                const colorIndex = currentComparisons.length % COMPARISON_COLORS.length;
                const nextColor = COMPARISON_COLORS[colorIndex] ?? '#f57f17';
                return {
                  ...chart,
                  comparisonSymbols: [
                    ...currentComparisons,
                    { symbol: symbol, exchange: exchange, color: nextColor, scaleMode: scaleMode },
                  ],
                };
              }
            }
            return chart;
          })
        );
        // Do not close search in compare mode to allow multiple selections
      } else {
        // Add to watchlist mode
        // Check both symbol AND exchange to allow same symbol from different exchanges
        const existsInWatchlist = watchlistSymbols.some((s) => {
          if (typeof s === 'string') return s === symbol;
          return s.symbol === symbol && s.exchange === exchange;
        });
        if (!existsInWatchlist) {
          // TSK-CS-018: use Context domain function, not raw state setter
          addSymbolToWatchlist(symbol, exchange);
        }
        setIsSearchOpen(false);
      }
    },
    [searchMode, setCharts, activeChartId, watchlistSymbols, addSymbolToWatchlist, setIsSearchOpen]
  );

  // Remove symbol from watchlist
  const handleRemoveFromWatchlist = useCallback(
    (symbolData: string | SymbolData) => {
      const symbolToRemove = typeof symbolData === 'string' ? symbolData : symbolData.symbol;
      const exchangeToRemove = typeof symbolData === 'string' ? null : symbolData.exchange || null;
      // TSK-CS-018: use Context domain function, not raw state setter
      removeSymbolFromWatchlist(symbolToRemove, exchangeToRemove);
    },
    [removeSymbolFromWatchlist]
  );

  // Open search in 'add to watchlist' mode
  const handleAddClick = useCallback(() => {
    setSearchMode('add');
    setIsSearchOpen(true);
  }, [setSearchMode, setIsSearchOpen]);

  // Open search in 'switch symbol' mode
  const handleSymbolClick = useCallback(() => {
    setSearchMode('switch');
    setIsSearchOpen(true);
  }, [setSearchMode, setIsSearchOpen]);

  // Open search in 'compare' mode
  const handleCompareClick = useCallback(() => {
    setSearchMode('compare');
    setIsSearchOpen(true);
  }, [setSearchMode, setIsSearchOpen]);

  return {
    handleSymbolChange,
    handleRemoveFromWatchlist,
    handleAddClick,
    handleSymbolClick,
    handleCompareClick,
  };
};

export default useSymbolHandlers;
