/**
 * OpenAlgo API Service
 * Handles chart data fetching and WebSocket connections for OpenAlgo backend
 */

import logger from '../utils/logger';
import { safeParseJSON } from './storageService';
import { ConnectionState, setConnectionStatus, triggerNetworkRecovery, subscribeToNetworkRecovery } from './connectionStatus';
import {
  getHostUrl,
  shouldUseProxy,
  getApiBase,
  getLoginUrl,
  getWebSocketUrl,
  checkAuth,
  getApiKey,
} from './api/config';
// Re-export drawings service for backwards compatibility
export { saveDrawings, loadDrawings } from './drawingsService';
// Re-export options API service for backwards compatibility
export {
  getExpiry,
  getOptionChain,
  getOptionGreeks,
  getMultiOptionGreeks,
  fetchExpiryDates,
} from './optionsApiService';
// Re-export instrument service for backwards compatibility
export {
  searchSymbols,
  getInstruments,
  getLotSize,
  getInstrumentInfo,
  clearInstrumentCache,
  getIntervals,
} from './instrumentService';
// Re-export preferences service for backwards compatibility
export { fetchUserPreferences, saveUserPreferences } from './preferencesService';
// Re-export chart data service for backwards compatibility
export {
  getKlines,
  getHistoricalKlines,
  getTickerPrice,
  getDepth,
  getCachedPrevClose,
} from './chartDataService';

// Re-export config utilities for backwards compatibility
export { getHostUrl, shouldUseProxy, getApiBase, getLoginUrl, checkAuth, getApiKey };

// Import and re-export account services for backwards compatibility
import {
  ping as pingService,
  getFunds as getFundsService,
  getPositionBook as getPositionBookService,
  getOrderBook as getOrderBookService,
  getTradeBook as getTradeBookService,
  getHoldings as getHoldingsService,
} from './trading/account.service';
export {
  pingService as ping,
  getFundsService as getFunds,
  getPositionBookService as getPositionBook,
  getOrderBookService as getOrderBook,
  getTradeBookService as getTradeBook,
  getHoldingsService as getHoldings,
};

// Import and re-export order services for backwards compatibility
import {
  placeOrder as placeOrderService,
  modifyOrder as modifyOrderService,
  cancelOrder as cancelOrderService,
} from './orderService';
export {
  placeOrderService as placeOrder,
  modifyOrderService as modifyOrder,
  cancelOrderService as cancelOrder,
};

// ==================== TYPES ====================

/** Symbol subscription */
interface SymbolSubscription {
  symbol: string;
  exchange?: string | undefined;
}

/** WebSocket message data */
interface WSMessageData {
  ltp?: number | string | undefined;
  last_price?: number | string | undefined;
  price?: number | string | undefined;
  open?: number | string | undefined;
  high?: number | string | undefined;
  low?: number | string | undefined;
  volume?: number | string | undefined;
  timestamp?: number | undefined;
  bid?: number | string | undefined;
  ask?: number | string | undefined;
}

/** WebSocket message */
interface WSMessage {
  type: string;
  symbol?: string | undefined;
  exchange?: string | undefined;
  status?: string | undefined;
  message?: string | undefined;
  code?: string | undefined;
  broker?: string | undefined;
  data?: WSMessageData | undefined;
  _token?: string | undefined;  // data-hub tick: instrument_token string
}

/** Subscriber entry */
interface SubscriberEntry {
  symbols: Set<string>;
  symbolObjs: SymbolSubscription[];
  callback: (message: WSMessage) => void;
  mode: number;
  ready: boolean;
}

/** Subscription handle */
interface SubscriptionHandle {
  close: () => void;
  readonly readyState: number;
}

/** Managed WebSocket interface */
interface ManagedWebSocket {
  close: () => void;
  forceClose: () => void;
  unsubscribe: (symbols: (string | SymbolSubscription)[]) => void;
  readonly readyState: number;
  readonly isAuthenticated: boolean;
}

/** Candle data */
interface Candle {
  time: number;
  brokerTimestamp?: number | undefined;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Ticker update callback data */
interface TickerUpdate {
  symbol: string;
  exchange: string;
  last: number;
  open: number;
  volume: number;
  chg: number;
  chgP: number;
}

/**
 * Global registry of active WebSocket connections
 * Used for cleanup on app exit (beforeunload)
 */
const activeWebSockets = new Set<ManagedWebSocket>();

// Import getCachedPrevClose for WebSocket subscriptions
import { getCachedPrevClose } from './chartDataService';

/**
 * SHARED WEBSOCKET MANAGER - Singleton pattern
 * Maintains a SINGLE WebSocket connection for the entire application.
 * OpenAlgo only supports one WebSocket per API key, so we must share.
 */
class SharedWebSocketManager {
  private _ws: WebSocket | null = null;
  private _subscribers: Map<number, SubscriberEntry> = new Map();
  private _subscribedSymbols: Set<string> = new Set();
  private _nextId: number = 1;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempts: number = 0;                   // FIX: exponential backoff counter
  private _authenticated: boolean = false;
  private _wsWrapper: ManagedWebSocket | null = null;
  private _wasDisconnected: boolean = false;
  private _closing: boolean = false;                         // FIX: explicit-close guard

  constructor() {
    // Listen for network recovery to trigger immediate reconnection
    subscribeToNetworkRecovery(() => {
      logger.debug('[SharedWS] Network recovery detected, attempting reconnection');
      this._cancelReconnect();
      if (this._subscribers.size > 0 && !this._closing) {
        this._reconnectAttempts = 0;                         // reset backoff on network recovery
        this._ensureConnected();
      }
    });
  }

  /** Cancel any pending reconnect timer. */
  private _cancelReconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /** Compute backoff delay: 2s, 4s, 8s, 16s, capped at 30s. */
  private _backoffMs(): number {
    return Math.min(2000 * Math.pow(2, this._reconnectAttempts), 30_000);
  }

  /**
   * Subscribe to symbols. Returns an unsubscribe function.
   */
  subscribe(
    symbols: SymbolSubscription[],
    callback: (message: WSMessage) => void,
    mode: number = 2
  ): SubscriptionHandle {
    const subscriberId = this._nextId++;
    const symbolKeys = symbols.map((s) => `${s.symbol}:${s.exchange || 'NSE'}`);

    // CRITICAL FIX RC-1: Add ready flag to prevent race condition
    const subscription: SubscriberEntry = {
      symbols: new Set(symbolKeys),
      symbolObjs: symbols,
      callback,
      mode,
      ready: false,
    };

    this._subscribers.set(subscriberId, subscription);

    // Add symbols to global set
    const newSymbols: SymbolSubscription[] = [];
    for (const key of symbolKeys) {
      if (!this._subscribedSymbols.has(key)) {
        this._subscribedSymbols.add(key);
        const sym = symbols.find((s) => `${s.symbol}:${s.exchange || 'NSE'}` === key);
        if (sym) {
          newSymbols.push(sym);
        }
      }
    }

    // Ensure connection exists
    this._ensureConnected();

    // If already authenticated, subscribe new symbols immediately
    if (this._authenticated && newSymbols.length > 0) {
      this._subscribeSymbols(newSymbols);
    }

    // Mark subscription as ready
    subscription.ready = true;

    // Return unsubscribe function
    const self = this;
    return {
      close: () => self._unsubscribe(subscriberId),
      get readyState() {
        return self._ws?.readyState ?? WebSocket.CLOSED;
      },
    };
  }

  private _unsubscribe(subscriberId: number): void {
    const sub = this._subscribers.get(subscriberId);
    if (!sub) return;

    this._subscribers.delete(subscriberId);

    // Check if any symbols are no longer needed by remaining subscribers
    for (const symbolKey of sub.symbols) {
      let stillNeeded = false;
      for (const [, otherSub] of this._subscribers) {
        if (otherSub.symbols.has(symbolKey)) {
          stillNeeded = true;
          break;
        }
      }
      if (!stillNeeded) {
        this._subscribedSymbols.delete(symbolKey);
        this._unsubscribeSymbol(symbolKey);
      }
    }

    // Close connection if no subscribers left
    if (this._subscribers.size === 0 && this._ws) {
      this._closing = true;                                  // FIX: prevent onclose from re-scheduling
      this._cancelReconnect();
      this._authenticated = false;                           // FIX: reset auth state on explicit close
      if (this._wsWrapper) {
        activeWebSockets.delete(this._wsWrapper);
        this._wsWrapper = null;
      }
      this._ws.close();
      this._ws = null;
      this._closing = false;
    }
  }

  private _ensureConnected(): void {
    if (this._closing) return;                               // FIX: guard against explicit-close race
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return;
    if (this._ws && this._ws.readyState === WebSocket.CONNECTING) return;

    const url = getWebSocketUrl();
    const apiKey = getApiKey();

    if (!apiKey) {
      logger.error('[SharedWS] No API key found. Please configure your API key in settings.');
      return;
    }

    // FIX: Remove stale wrapper before creating new connection
    if (this._wsWrapper) {
      activeWebSockets.delete(this._wsWrapper);
      this._wsWrapper = null;
    }

    this._ws = new WebSocket(url);

    // Store wrapper reference for cleanup
    const self = this;
    this._wsWrapper = {
      close: () => self._ws?.close(),
      forceClose: () => self._ws?.close(),
      unsubscribe: () => {},
      get readyState() {
        return self._ws?.readyState ?? WebSocket.CLOSED;
      },
      get isAuthenticated() {
        return self._authenticated;
      },
    };
    activeWebSockets.add(this._wsWrapper);

    this._ws.onopen = () => {
      logger.debug('[SharedWS] Connected, authenticating...');
      this._ws!.send(JSON.stringify({ action: 'authenticate', api_key: apiKey }));
    };

    this._ws.onmessage = (event: MessageEvent) => {
      try {
        const message = safeParseJSON<WSMessage | null>(event.data, null);
        if (!message) return;

        // Handle ping
        if (message.type === 'ping') {
          this._ws!.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        // Handle authentication response
        if (
          (message.type === 'auth' && message.status === 'success') ||
          message.type === 'authenticated' ||
          message.status === 'authenticated'
        ) {
          logger.debug(
            '[SharedWS] Authenticated, subscribing to',
            this._subscribedSymbols.size,
            'symbols'
          );
          this._authenticated = true;
          this._reconnectAttempts = 0;                       // FIX: reset backoff on successful auth
          setConnectionStatus(ConnectionState.CONNECTED);
          this._resubscribeAll();

          // Trigger network recovery if we were disconnected before
          // This notifies components to refresh their data
          if (this._wasDisconnected) {
            this._wasDisconnected = false;
            logger.debug('[SharedWS] Reconnected after disconnect, triggering data recovery');
            triggerNetworkRecovery();
          }
          return;
        }

        // Handle auth error
        if (message.type === 'error' || (message.type === 'auth' && message.status !== 'success')) {
          logger.error('[SharedWS] Auth error:', message.message || message.code);
          return;
        }

        if (message.type === 'market_data' && message.symbol) {
          const symbolKey = `${message.symbol}:${message.exchange || 'NSE'}`;
          for (const [id, sub] of this._subscribers) {
            if (sub.ready && sub.symbols.has(symbolKey)) {
              try {
                sub.callback({ ...message, data: message.data || {} });
              } catch (err) {
                logger.error('[SharedWS] Callback error for subscriber', id, ':', err);
              }
            }
          }
        }

        // Handle data-hub tick format: { type: 'tick', data: { instrument_token, last_price, ... } }
        if (message.type === 'tick' && (message as any).data) {
          const tick = (message as any).data as Record<string, unknown>;
          const tokenStr = String(tick.instrument_token || '');
          // Forward to all subscribers that have this token registered
          for (const [id, sub] of this._subscribers) {
            if (sub.ready) {
              try {
                sub.callback({
                  type:     'tick',
                  symbol:   String(tick.tradingsymbol || tick.instrument_token || ''),
                  exchange: String(tick.exchange || 'NSE'),
                  data: {
                    ltp:        Number(tick.last_price || 0),
                    last_price: Number(tick.last_price || 0),
                    open:       Number((tick.ohlc as any)?.open  || tick.open_price  || 0),
                    high:       Number((tick.ohlc as any)?.high  || tick.high_price  || 0),
                    low:        Number((tick.ohlc as any)?.low   || tick.low_price   || 0),
                    volume:     Number(tick.volume_traded || tick.volume || 0),
                    timestamp:  Number(tick.exchange_timestamp || tick.timestamp || 0),
                  },
                  _token: tokenStr,
                });
              } catch (err) {
                logger.error('[SharedWS] Tick callback error for subscriber', id, ':', err);
              }
            }
          }
        }

        // Handle trade signal from strategies: { type: 'chart_signal', strategy, index, ... }
        // Dispatch as a DOM CustomEvent so App.tsx can add markers to the matching chart
        if (message.type === 'chart_signal') {
          try {
            window.dispatchEvent(
              new CustomEvent('pratham-chart-signal', {
                detail: message,
                bubbles: false,
              })
            );
          } catch (_) {}
        }
      } catch (err) {
        logger.error('[SharedWS] Failed to parse WebSocket message:', err);
        logger.debug('[SharedWS] Raw message data:', event.data);
      }
    };

    this._ws.onclose = () => {
      logger.debug('[SharedWS] Disconnected');
      this._authenticated = false;
      if (!this._closing) {
        // Only mark as disconnected and schedule reconnect for unexpected disconnects
        this._wasDisconnected = true;
        setConnectionStatus(ConnectionState.DISCONNECTED);
        if (this._subscribers.size > 0) {
          const delay = this._backoffMs();                   // FIX: exponential backoff
          logger.debug(`[SharedWS] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts + 1})`);
          this._reconnectTimer = setTimeout(() => {
            this._reconnectAttempts++;
            this._ensureConnected();
          }, delay);
        }
      }
    };

    this._ws.onerror = (err: Event) => {
      logger.error('[SharedWS] Error:', err);
    };
  }

  private _resubscribeAll(): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN || !this._authenticated) return;

    // FIX: O(n) dedup using Set instead of Array.some() O(n²)
    const seen = new Set<string>();
    const allSymbols: SymbolSubscription[] = [];
    for (const [, sub] of this._subscribers) {
      for (const symObj of sub.symbolObjs) {
        const key = `${symObj.symbol}:${symObj.exchange || 'NSE'}`;
        if (!seen.has(key)) {
          seen.add(key);
          allSymbols.push(symObj);
        }
      }
    }

    for (const sym of allSymbols) {
      this._ws.send(
        JSON.stringify({
          action: 'subscribe',
          symbol: sym.symbol,
          exchange: sym.exchange || 'NSE',
          mode: 2,
        })
      );
    }
  }

  private _subscribeSymbols(symbols: SymbolSubscription[]): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN || !this._authenticated) return;

    for (const sym of symbols) {
      this._ws.send(
        JSON.stringify({
          action: 'subscribe',
          symbol: sym.symbol,
          exchange: sym.exchange || 'NSE',
          mode: 2,
        })
      );
    }
  }

  private _unsubscribeSymbol(symbolKey: string): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;

    const parts = symbolKey.split(':');
    if (parts.length !== 2) {
      logger.warn('[SharedWS] Invalid symbolKey format:', symbolKey);
      return;
    }

    const [symbol, exchange] = parts;
    this._ws.send(
      JSON.stringify({
        action: 'unsubscribe',
        symbol,
        exchange: exchange || 'NSE',
      })
    );
  }
}

// Global singleton instance
export const sharedWebSocket = new SharedWebSocketManager();

/**
 * Close all active WebSocket connections
 */
export const closeAllWebSockets = (): void => {
  logger.debug('[WebSocket] Closing all active connections:', activeWebSockets.size);
  activeWebSockets.forEach((ws) => {
    try {
      if (ws && typeof ws.close === 'function') {
        ws.close();
      }
    } catch (error) {
      logger.debug('[WebSocket] Error closing connection:', error);
    }
  });
  activeWebSockets.clear();
};

/**
 * Force close all WebSocket connections without unsubscribe
 */
export const forceCloseAllWebSockets = (): void => {
  logger.debug('[WebSocket] Force closing all active connections:', activeWebSockets.size);
  activeWebSockets.forEach((ws) => {
    try {
      if (ws && typeof ws.forceClose === 'function') {
        ws.forceClose();
      } else if (ws && typeof ws.close === 'function') {
        ws.close();
      }
    } catch {
      // Ignore errors during force close
    }
  });
  activeWebSockets.clear();
};

// IST offset for consistent time display
const IST_OFFSET_SECONDS = 19800; // 5 hours 30 minutes

/**
 * Subscribe to real-time ticker updates via WebSocket
 */
export const subscribeToTicker = (
  symbol: string,
  exchange: string = 'NSE',
  _interval: string,
  callback: (candle: Candle) => void
): SubscriptionHandle => {
  const subscriptions = [{ symbol, exchange }];
  const subscriptionId = `${symbol}:${exchange}`;

  return sharedWebSocket.subscribe(
    subscriptions,
    (message: WSMessage) => {
      if (message.type !== 'market_data' && message.type !== 'tick') return;

      const messageId = `${message.symbol}:${message.exchange || 'NSE'}`;
      if (messageId !== subscriptionId) return;

      const data = message.data || {};
      const ltp = parseFloat(String(data.ltp || data.last_price || 0));

      if (ltp > 0) {
        let time: number;
        let brokerTimestamp: number;

        if (data.timestamp) {
          brokerTimestamp = Math.floor(data.timestamp / 1000);
          time = brokerTimestamp;
        } else {
          brokerTimestamp = Math.floor(Date.now() / 1000);
          time = brokerTimestamp;
        }

        const candle: Candle = {
          time,
          brokerTimestamp,
          open: parseFloat(String(data.open || ltp)),
          high: parseFloat(String(data.high || ltp)),
          low: parseFloat(String(data.low || ltp)),
          close: ltp,
          volume: parseFloat(String(data.volume || 0)),
        };

        logger.debug('[WebSocket] Quote for', message.symbol, ':', {
          time: candle.time,
          brokerTimestamp: candle.brokerTimestamp,
          ltp,
        });
        callback(candle);
      }
    },
    2
  );
};

/**
 * Subscribe to multiple tickers for watchlist
 */
export const subscribeToMultiTicker = (
  symbols: (string | SymbolSubscription)[],
  callback: (update: TickerUpdate) => void
): SubscriptionHandle | null => {
  if (!symbols || symbols.length === 0) return null;

  const subscriptions: SymbolSubscription[] = symbols.map((sym) => {
    if (typeof sym === 'string') {
      return { symbol: sym, exchange: 'NSE' };
    }
    return { symbol: sym.symbol, exchange: sym.exchange || 'NSE' };
  });

  return sharedWebSocket.subscribe(
    subscriptions,
    (message: WSMessage) => {
      if ((message.type !== 'market_data' && message.type !== 'tick') || !message.symbol) return;

      const data = message.data || {};
      const ltp = parseFloat(String(data.ltp || data.last_price || 0));
      const exchange = message.exchange || 'NSE';

      if (ltp > 0) {
        const cachedPrevClose = getCachedPrevClose(message.symbol, exchange);
        const prevClose = cachedPrevClose || parseFloat(String(data.open || ltp));
        const change = ltp - prevClose;
        const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

        callback({
          symbol: message.symbol,
          exchange: exchange,
          last: ltp,
          open: parseFloat(String(data.open || prevClose)),
          volume: parseFloat(String(data.volume || 0)),
          chg: change,
          chgP: changePercent,
        });
      }
    },
    2
  );
};

// Import for default export
import { searchSymbols, getIntervals } from './instrumentService';
import { getOptionChain, getOptionGreeks, getMultiOptionGreeks, fetchExpiryDates } from './optionsApiService';
import { saveDrawings, loadDrawings } from './drawingsService';
import { fetchUserPreferences, saveUserPreferences } from './preferencesService';
import { getKlines, getHistoricalKlines, getTickerPrice } from './chartDataService';

export default {
  checkAuth,
  getKlines,
  getHistoricalKlines,
  getTickerPrice,
  subscribeToTicker,
  subscribeToMultiTicker,
  searchSymbols,
  getIntervals,
  fetchUserPreferences,
  saveUserPreferences,
  getOptionChain,
  getOptionGreeks,
  getMultiOptionGreeks,
  fetchExpiryDates,
  saveDrawings,
  loadDrawings,
  // Accounts API
  ping: pingService,
  getFunds: getFundsService,
  getPositionBook: getPositionBookService,
  getOrderBook: getOrderBookService,
  getTradeBook: getTradeBookService,
  getHoldings: getHoldingsService,
  placeOrder: placeOrderService,
  modifyOrder: modifyOrderService,
  cancelOrder: cancelOrderService,
};
