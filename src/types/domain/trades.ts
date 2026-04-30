/**
 * Trade Domain Types
 *
 * Single source of truth for all trade-related types used across:
 * - tradeDataService (historical trade hydration)
 * - useChartSignals (live websocket trade markers)
 * - TradeVisualizer (chart overlay rendering)
 * - ActiveMarkets / autoWatchlistService
 */

// ==================== CHART TRADE (REST ledger) ====================

/** Trade record from the backend ledger — used for historical chart hydration */
export interface ChartTrade {
  tradeId: string;
  strategy: string;
  /** Underlying index name e.g. 'NIFTY', 'BANKNIFTY' */
  index: string;
  /** Option tradingsymbol */
  symbol: string;
  /** Option side: 'CE' | 'PE' */
  side: string;
  entryPrice: number;
  exitPrice?: number;
  sl?: number | null;
  target?: number | null;
  /** Trade mode: 'LIVE' | 'PAPER' */
  mode: string;
  entryTime: string;
  exitTime?: string;
  exitReason?: string;
  realizedPnL?: number;
  lots?: number;
  currentPrice?: number;
  unrealizedPnL?: number;
}

/** Response shape from /api/v1/chart-trades */
export interface ChartTradesResponse {
  open: ChartTrade[];
  closed: ChartTrade[];
}

// ==================== CHART SIGNAL (WS + REST markers) ====================

/** Lightweight-charts marker position */
export type MarkerPosition = 'belowBar' | 'aboveBar' | 'inBar';

/** Lightweight-charts marker shape */
export type MarkerShape = 'arrowUp' | 'arrowDown' | 'circle' | 'square';

/** Trade event type */
export type TradeEventType = 'ENTRY' | 'EXIT' | 'SL' | 'TARGET' | 'SL_HIT' | 'TARGET_HIT';

/**
 * Chart signal — a visual marker placed on the chart for a trade event.
 * Built from both live WebSocket payloads and historical ChartTrades.
 */
export interface ChartSignal {
  /** Unique deterministic ID — used for deduplication */
  id: string;
  /** Strategy name e.g. 'GAP_PULSE', 'BET' */
  strategy: string;
  /** Short strategy code e.g. 'GP', 'BET' */
  code: string;
  /** Underlying index e.g. 'NIFTY', 'BANKNIFTY' */
  index: string;
  /** Option tradingsymbol */
  symbol: string;
  /** Option side: 'CE' | 'PE' */
  side: string;
  entryPrice: number;
  exitPrice?: number;
  strike: number | null;
  /** Unix seconds timestamp */
  time: number;
  /** Trade mode: 'LIVE' | 'PAPER' */
  mode: string;
  eventType: TradeEventType | string;
  /** Date.now() when signal was received */
  receivedAt: number;
  /** Core ledger trade ID for entry-exit pairing */
  tradeId?: string;
  sl?: number | null;
  target?: number | null;
  exitReason?: string;
  realizedPnL?: number | null;
  lots?: number;
  // Lightweight-charts marker rendering fields
  position: MarkerPosition;
  color: string;
  shape: MarkerShape;
  text: string;
}

/** Stable key for entry-exit trade pairing — deduplicates markers across reloads */
export type TradeKey = string;

/**
 * Build a stable TradeKey from a trade signal.
 * Combines tradeId + strategy + index + side + entryPrice for deterministic identity.
 */
export function buildTradeKey(signal: Pick<ChartSignal, 'tradeId' | 'strategy' | 'index' | 'side' | 'entryPrice'>): TradeKey {
  return [
    signal.tradeId || 'no-id',
    signal.strategy,
    signal.index,
    signal.side,
    signal.entryPrice,
  ].join(':');
}

// ==================== ACTIVE MARKET ====================

/** An actively traded option from the data-hub active-options endpoint */
export interface ActiveOption {
  symbol: string;
  exchange: string;
  type: 'CE' | 'PE';
  strike: number;
  /** Underlying display name e.g. 'NIFTY 50' */
  underlying: string;
  /** True when this strike is the ATM strike */
  atm?: boolean;
  /** TSK-CS-020: live market data fields (optional — filled by useAutoWatchlist) */
  ltp?: number;
  change?: number;
  changePercent?: number;
}

/** Live index data for Active Markets index cards */
export interface IndexLiveData {
  ltp: number;
  change: number;
  changePercent: number;
  prevClose: number;
}

/** State for the Active Markets panel */
export interface ActiveMarketsState {
  options: ActiveOption[];
  isLoading: boolean;
  lastUpdated: number | null;
  error: string | null;
}
