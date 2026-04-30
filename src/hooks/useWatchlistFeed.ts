/**
 * useWatchlistFeed
 *
 * Manages all market-data concerns for the watchlist:
 *   - Initial REST hydration (getTickerPrice with retry)
 *   - Incremental symbol additions / removals
 *   - Real-time WebSocket price updates (subscribeToMultiTicker)
 *   - Chart-alert crossing detection on every tick
 *   - Alert sound + popup + log side-effects on trigger
 *
 * Extracted from App.tsx to keep AppContent focused on orchestration.
 * No logic was changed during extraction.
 */

import { useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { getTickerPrice, subscribeToMultiTicker } from '../services/openalgo';
import { getJSON, setJSON, STORAGE_KEYS } from '../services/storageService';
import logger from '../utils/logger';
import type { WatchlistSymbol, WatchlistItemData } from '../context/WatchlistContext';

// ---------- Types ----------

/** @internal — internal shape used by the hook's live-tick updater. External consumers use WatchlistItemData from WatchlistContext. */
interface WatchlistFeedItem {
  symbol: string;
  exchange: string;
  last: string;
  open: number;
  chg: string;
  chgP: string;
  volume: number;
  up: boolean;
}

/** Raw symbol entry in the watchlist — either a ###section marker or a symbol object. */
export type WatchlistSymbolEntry = WatchlistSymbol | string;

/** Live ticker payload from subscribeToMultiTicker callback. */
export interface TickerPayload {
  symbol: string;
  exchange?: string;
  ltp?: number;
  last?: number | string;
  open?: number;
  change?: number | string;
  changePercent?: number | string;
  volume?: number;
  [key: string]: unknown;
}

interface UseWatchlistFeedOptions {
  /** Flat symbol list (may include ###section markers). */
  watchlistSymbols: WatchlistSymbolEntry[];
  /** Stable key that changes when the symbol list changes. */
  watchlistSymbolsKey: string;
  /** Active watchlist list ID — switching lists triggers full reload. */
  activeListId: string | null;
  /** Only fetch when true; skip when null/false. */
  isAuthenticated: boolean | null;
  /** Shared ref from AlertContext — tracks previous price per symbol:exchange key. */
  alertPricesRef: MutableRefObject<Map<string, number>>;
  /** Ref that always reflects the active chart symbol/exchange — used for popup suppression. */
  activeChartRef: MutableRefObject<{ symbol: string; exchange: string }>;
  /** Remove an invalid symbol from the watchlist (called when 400/404 is returned). */
  handleRemoveFromWatchlist: (symObj: { symbol: string; exchange: string }) => void;
  /** Push a global alert popup (AlertContext domain function). */
  addGlobalPopup: (popup: Omit<{ id: number; symbol?: string; message?: string; price?: number; [key: string]: unknown }, 'id'>) => number;
  /** Append an alert log entry (AlertContext domain function). */
  addAlertLog: (log: Omit<{ id?: string; alertId?: string; symbol?: string; message?: string; timestamp?: number; type?: string; [key: string]: unknown }, 'timestamp'>) => void;
  /** Increment the unread alert badge (AlertContext domain function). */
  incrementUnreadCount: () => void;
  /** Show a toast notification. */
  showToast: (message: string, type?: string) => void;
  /** WatchlistContext setter — hook writes live price data into context state. */
  setWatchlistData: React.Dispatch<React.SetStateAction<WatchlistItemData[]>>;
  /** WatchlistContext setter — hook writes loading state into context state. */
  setWatchlistLoading: React.Dispatch<React.SetStateAction<boolean>>;
  /** Current watchlist data from context — used for update strategy decisions. */
  watchlistData: WatchlistItemData[];
}



// ---------- Hook ----------

export function useWatchlistFeed({
  watchlistSymbols,
  watchlistSymbolsKey,
  activeListId,
  isAuthenticated,
  alertPricesRef,
  activeChartRef,
  handleRemoveFromWatchlist,
  addGlobalPopup,
  addAlertLog,
  incrementUnreadCount,
  showToast,
  setWatchlistData,
  setWatchlistLoading,
  watchlistData,
}: UseWatchlistFeedOptions): void {
  // Internal refs
  const prevSymbolsRef = useRef<string[] | null>(null);
  const lastActiveListIdRef = useRef<string | null>(null);
  const watchlistFetchingRef = useRef(false);
  const watchlistSymbolsRef = useRef<any[]>([]);

  // Keep watchlistSymbolsRef in sync so WebSocket callback avoids stale closure
  useEffect(() => {
    watchlistSymbolsRef.current = watchlistSymbols;
  }, [watchlistSymbols]);

  // ----- Alert sound -----
  const playAlertSound = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'square';
      oscillator.frequency.value = 2048;

      const now = ctx.currentTime;
      for (let i = 0; i < 10; i++) {
        const t = now + i * 0.30;
        gainNode.gain.setValueAtTime(1.0, t);
        gainNode.gain.setValueAtTime(0.0, t + 0.15);
      }

      oscillator.start(now);
      oscillator.stop(now + 3.1);
      oscillator.onended = () => ctx.close();
    } catch (error) {
      console.error('Alert sound failed:', error);
    }
  }, []);

  // ----- Alert symbols helper -----
  const getAlertSymbols = useCallback(() => {
    try {
      const chartAlertsStr = localStorage.getItem(STORAGE_KEYS.CHART_ALERTS);
      if (!chartAlertsStr) return [];

      const chartAlertsData = JSON.parse(chartAlertsStr);
      const alertSymbols: { symbol: string; exchange: string }[] = [];

      for (const [key, alerts] of Object.entries(chartAlertsData)) {
        if (!Array.isArray(alerts)) continue;
        const hasActiveAlert = alerts.some((a: any) => a && a.price && !a.triggered);
        if (hasActiveAlert) {
          const [symbol, exchange] = key.split(':');
          alertSymbols.push({ symbol, exchange: exchange || 'NSE' });
        }
      }

      return alertSymbols;
    } catch (err) {
      console.warn('[Alerts] Failed to get alert symbols:', err);
      return [];
    }
  }, []);

  // ----- Main effect -----
  useEffect(() => {
    console.log('=== WATCHLIST EFFECT ===');
    console.log('isAuthenticated:', isAuthenticated);
    console.log('watchlistSymbols count:', watchlistSymbols.length);
    console.log('watchlistSymbolsKey:', watchlistSymbolsKey);

    logger.debug('[Watchlist Effect] Running, isAuthenticated:', isAuthenticated);

    if (isAuthenticated !== true) {
      console.log('=== SKIPPING - NOT AUTHENTICATED ===');
      logger.debug('[Watchlist Effect] Skipping - not authenticated');
      setWatchlistLoading(false);
      return;
    }

    if (watchlistFetchingRef.current) {
      logger.debug('[Watchlist Effect] Skipping - fetch already in progress');
      return;
    }

    let ws: any = null;
    let mounted = true;
    let initialDataLoaded = false;
    const abortController = new AbortController();

    const currentSymbolKeys = (watchlistSymbols as any[])
      .filter((s: any) => !(typeof s === 'string' && s.startsWith('###')))
      .map((s: any) => {
        if (typeof s === 'string') return `${s}-NSE`;
        return `${s.symbol}-${s.exchange || 'NSE'}`;
      });

    logger.debug('[Watchlist Effect] currentSymbolKeys:', currentSymbolKeys);

    const currentSymbolsSet = new Set(currentSymbolKeys);
    const prevSymbolsSet = new Set(prevSymbolsRef.current || []);

    const isListSwitch = lastActiveListIdRef.current !== activeListId;
    const isInitialLoad = prevSymbolsRef.current === null;

    logger.debug('[Watchlist Effect] isInitialLoad:', isInitialLoad, 'isListSwitch:', isListSwitch);

    const addedSymbolKeys = currentSymbolKeys.filter(s => !prevSymbolsSet.has(s));
    const removedSymbolKeys = (prevSymbolsRef.current || []).filter(s => !currentSymbolsSet.has(s));

    prevSymbolsRef.current = currentSymbolKeys;
    lastActiveListIdRef.current = activeListId;

    // ----- Per-symbol REST fetch with retry -----
    const fetchSymbol = async (symObj: any) => {
      let symbol: string, exchange: string;
      if (typeof symObj === 'string') {
        const fullSymbolObj = watchlistSymbols.find(s =>
          (typeof s === 'string' ? s : s.symbol) === symObj
        );
        symbol = symObj;
        exchange = (fullSymbolObj && typeof fullSymbolObj === 'object')
          ? (fullSymbolObj.exchange || 'NSE')
          : 'NSE';
      } else {
        symbol = symObj.symbol;
        exchange = symObj.exchange || 'NSE';
      }

      const MAX_RETRIES = 2;
      let attempt = 0;

      while (attempt <= MAX_RETRIES) {
        try {
          const data = await getTickerPrice(symbol, exchange, abortController.signal);
          if (data && mounted) {
            return {
              symbol, exchange,
              last: parseFloat(data.lastPrice).toFixed(2),
              open: data.open || 0,
              chg: parseFloat(data.priceChange).toFixed(2),
              chgP: parseFloat(data.priceChangePercent).toFixed(2) + '%',
              volume: data.volume || 0,
              up: parseFloat(data.priceChange) >= 0,
            };
          }
          break;
        } catch (error: any) {
          if (error.name === 'AbortError') return null;

          if (
            error.message &&
            ((error.message.includes('Symbol') && error.message.includes('not found')) ||
              error.message.includes('400') ||
              error.message.includes('404'))
          ) {
            console.warn(`Removing invalid symbol ${symbol}:${exchange} — ${error.message}`);
            setTimeout(() => {
              if (mounted) {
                handleRemoveFromWatchlist({ symbol, exchange });
                showToast(`Removed invalid symbol: ${symbol}`, 'warning');
              }
            }, 0);
            return null;
          }

          attempt++;
          if (attempt > MAX_RETRIES) {
            console.error(`Error fetching ${symbol} after ${MAX_RETRIES + 1} attempts:`, error);
            return null;
          }

          const delay = 1000 * attempt;
          console.warn(`Fetch failed for ${symbol}. Retrying in ${delay}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
          if (mounted) await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      return null;
    };

    // ----- Full reload (initial / list switch / symbol added) -----
    const hydrateWatchlist = async () => {
      console.log('=== HYDRATE WATCHLIST CALLED ===');
      logger.debug('[Watchlist] hydrateWatchlist called');
      watchlistFetchingRef.current = true;
      setWatchlistLoading(true);

      try {
        const symbolObjs = (watchlistSymbols as any[]).filter(
          (s: any) => !(typeof s === 'string' && s.startsWith('###'))
        );
        console.log('symbolObjs to fetch:', symbolObjs.map((s: any) => typeof s === 'string' ? s : s.symbol));
        logger.debug('[Watchlist] Processing symbols:', symbolObjs);

        // Show cached data immediately for instant UX
        const symbolsWithCachedData = symbolObjs
          .filter((s: any) => typeof s === 'object' && s.last !== undefined && s.last !== '--')
          .map((s: any) => ({
            symbol: s.symbol,
            exchange: s.exchange || 'NSE',
            last: s.last,
            chg: s.chg,
            chgP: s.chgP,
            up: s.up,
          }));

        logger.debug('[Watchlist] Symbols with cached data:', symbolsWithCachedData.length);

        if (symbolsWithCachedData.length > 0 && mounted) {
          setWatchlistData(symbolsWithCachedData as WatchlistItemData[]);
          setWatchlistLoading(false);
          initialDataLoaded = true;
          logger.debug('[Watchlist] Displayed cached data, now fetching fresh prices...');
        }

        console.log('Fetching fresh quotes for', symbolObjs.length, 'symbols');
        logger.debug('[Watchlist] Fetching fresh quotes for all', symbolObjs.length, 'symbols');

        const fetchPromises = symbolObjs.map(fetchSymbol);
        const results = await Promise.allSettled(fetchPromises);
        const validResults = results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
          .map(r => r.value);

        console.log('=== API RESULTS ===');
        console.log('Total results:', results.length, 'Valid results:', validResults.length);
        console.log('Sample result:', validResults[0]);
        logger.debug('[Watchlist] Fresh quotes received:', validResults.length);

        if (mounted && validResults.length > 0) {
          console.log('=== SETTING WATCHLIST DATA ===', validResults.length, 'items');
          setWatchlistData(validResults);
        }

        if (mounted) {
          setWatchlistLoading(false);
          initialDataLoaded = true;

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
          }

          // Merge alert symbols so crossing detection covers non-watchlist symbols
          const alertSymbols = getAlertSymbols();
          const watchlistKeys = new Set(
            symbolObjs.map((s: any) =>
              typeof s === 'string' ? `${s}:NSE` : `${s.symbol}:${s.exchange || 'NSE'}`
            )
          );
          const additionalAlertSymbols = alertSymbols.filter(
            as => !watchlistKeys.has(`${as.symbol}:${as.exchange}`)
          );
          const allSymbolsToSubscribe = [...symbolObjs, ...additionalAlertSymbols];

          console.log('=== SETTING UP WEBSOCKET ===');
          console.log('Watchlist symbols:', symbolObjs.length);
          console.log('Additional alert symbols:', additionalAlertSymbols.length);
          console.log('Total subscribed:', allSymbolsToSubscribe.length);

          ws = subscribeToMultiTicker(allSymbolsToSubscribe, (ticker: any) => {
            if (!mounted || !initialDataLoaded) return;

            // Alert crossing detection
            try {
              const chartAlertsData = getJSON(STORAGE_KEYS.CHART_ALERTS, {});
              const alertKey = `${ticker.symbol}:${ticker.exchange || 'NSE'}`;
              const symbolAlerts = (chartAlertsData as any)[alertKey] || [];

              const currentPrice = parseFloat(String(ticker.last));
              if (!Number.isFinite(currentPrice)) return;

              const prevPrice = alertPricesRef.current.get(alertKey);
              alertPricesRef.current.set(alertKey, currentPrice);

              if (prevPrice === undefined) return;

              for (const alert of symbolAlerts) {
                if (!alert.price || alert.triggered) continue;

                const alertPrice = parseFloat(alert.price);
                if (!Number.isFinite(alertPrice)) continue;

                const condition = alert.condition || 'crossing';
                let triggered = false;
                let direction = '';

                const crossedUp = prevPrice < alertPrice && currentPrice >= alertPrice;
                const crossedDown = prevPrice > alertPrice && currentPrice <= alertPrice;

                if (condition === 'crossing') {
                  triggered = crossedUp || crossedDown;
                  direction = crossedUp ? 'up' : 'down';
                } else if (condition === 'crossing_up') {
                  triggered = crossedUp;
                  direction = 'up';
                } else if (condition === 'crossing_down') {
                  triggered = crossedDown;
                  direction = 'down';
                }

                if (triggered) {
                  console.log('[Alerts] TRIGGERED:', ticker.symbol, 'crossed', direction, 'at', currentPrice, 'target:', alertPrice);

                  alert.triggered = true;
                  (chartAlertsData as any)[alertKey] = symbolAlerts;
                  setJSON(STORAGE_KEYS.CHART_ALERTS, chartAlertsData);

                  playAlertSound();

                  const isOnCurrentChart =
                    ticker.symbol === activeChartRef.current.symbol &&
                    (ticker.exchange || 'NSE') === activeChartRef.current.exchange;

                  if (!isOnCurrentChart) {
                    // TSK-CS-022: use AlertContext domain function
                    addGlobalPopup({
                      alertId: alert.id,
                      symbol: ticker.symbol,
                      exchange: ticker.exchange || 'NSE',
                      price: alertPrice.toFixed(2),
                      direction,
                      timestamp: Date.now(),
                    });
                  }

                  // TSK-CS-022: use AlertContext domain functions
                  addAlertLog({
                    alertId: alert.id,
                    symbol: ticker.symbol,
                    exchange: ticker.exchange || 'NSE',
                    message: `Alert: ${ticker.symbol} crossed ${direction} ${alertPrice.toFixed(2)}`,
                    type: 'trigger',
                  });
                  incrementUnreadCount();
                }
              }
            } catch (_) {
              // Silent fail for alert check
            }

            // Live price update
            setWatchlistData(prev => {
              const tickerExchange = ticker.exchange || 'NSE';
              const index = prev.findIndex(
                item => item.symbol === ticker.symbol && item.exchange === tickerExchange
              );
              if (index !== -1) {
                const newData = [...prev];
                newData[index] = {
                  ...newData[index],
                  last: ticker.last.toFixed(2),
                  open: ticker.open,
                  volume: ticker.volume,
                  chg: ticker.chg.toFixed(2),
                  chgP: ticker.chgP.toFixed(2) + '%',
                  up: ticker.chg >= 0,
                };
                return newData;
              }
              // Fallback: create item from WebSocket data if REST failed
              const symbolData = watchlistSymbolsRef.current.find((s: any) => {
                if (typeof s === 'string') return s === ticker.symbol;
                return s.symbol === ticker.symbol && s.exchange === tickerExchange;
              });
              if (symbolData) {
                return [
                  ...prev,
                  {
                    symbol: ticker.symbol,
                    exchange: tickerExchange,
                    last: ticker.last.toFixed(2),
                    open: ticker.open,
                    volume: ticker.volume,
                    chg: ticker.chg.toFixed(2),
                    chgP: ticker.chgP.toFixed(2) + '%',
                    up: ticker.chg >= 0,
                  },
                ];
              }
              return prev;
            });
          });
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          logger.debug('[Watchlist] Fetch aborted (expected during navigation)');
        } else {
          console.error('Error fetching watchlist data:', error);
          if (mounted) {
            showToast('Failed to load watchlist data', 'error');
            setWatchlistLoading(false);
            initialDataLoaded = true;
          }
        }
      } finally {
        watchlistFetchingRef.current = false;
      }
    };

    // ----- Incremental symbol additions -----
    const hydrateAddedSymbols = async () => {
      const addedSymbolObjs = (watchlistSymbols as any[]).filter((symObj: any) => {
        if (typeof symObj === 'string' && symObj.startsWith('###')) return false;
        const key =
          typeof symObj === 'string'
            ? `${symObj}-NSE`
            : `${symObj.symbol}-${symObj.exchange || 'NSE'}`;
        return addedSymbolKeys.includes(key);
      });

      const promises = addedSymbolObjs.map(fetchSymbol);
      const results = await Promise.allSettled(promises);
      const validResults = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      if (mounted && validResults.length > 0) {
        setWatchlistData(prev => [...prev, ...validResults]);
      }
    };

    // ----- Decide update strategy -----
    const needsFullReload =
      isInitialLoad ||
      isListSwitch ||
      (currentSymbolKeys.length > 0 && watchlistData.length === 0) ||
      addedSymbolKeys.length > 0;

    console.log('=== UPDATE STRATEGY ===');
    console.log('isInitialLoad:', isInitialLoad, 'isListSwitch:', isListSwitch);
    console.log('watchlistData.length:', watchlistData.length, 'currentSymbolKeys.length:', currentSymbolKeys.length);
    console.log('needsFullReload:', needsFullReload);
    console.log('addedSymbolKeys:', addedSymbolKeys.length, 'removedSymbolKeys:', removedSymbolKeys.length);

    if (needsFullReload) {
      console.log('>>> Calling hydrateWatchlist()');
      hydrateWatchlist();
    } else if (removedSymbolKeys.length > 0) {
      setWatchlistData(prev => prev.filter(item => !removedSymbolKeys.includes(`${item.symbol}-${item.exchange}`)));
    }
  }, [watchlistSymbolsKey, activeListId, isAuthenticated, watchlistSymbols, watchlistData, addGlobalPopup, addAlertLog, incrementUnreadCount, showToast, setWatchlistData, setWatchlistLoading, alertPricesRef, activeChartRef, handleRemoveFromWatchlist]);

  return null;
}
