/**
 * useChartSignals — Trade Marker Hook
 *
 * Listens for 'pratham-chart-signal' CustomEvents dispatched by SharedWebSocketManager
 * when strategies (GAP_PULSE, BET, GTL, etc.) fire trade entries/exits.
 *
 * Also hydrates from the REST API on mount so trade markers survive page refreshes.
 *
 * Usage:
 *   const { signals, getSignalsForIndex } = useChartSignals();
 *   const niftySignals = getSignalsForIndex('NIFTY');
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchChartTrades } from '../services/tradeDataService';
import { getUnderlyingAlias } from '../utils/symbolNormalization'; // TSK-CS-013
import type { ChartTrade } from '../services/tradeDataService';

// Strategy short codes for chart marker labels
const STRATEGY_CODES: Record<string, string> = {
  GAP_PULSE: 'GP',
  BET: 'BET',
  STRUCTURE_PULSE: 'SP',
  GTL: 'GTL',
  DNX_SEZ: 'DNX',
};

export interface ChartSignal {
  id: string;       // unique id
  strategy: string;       // 'GAP_PULSE' | 'BET' | ...
  code: string;       // 'GP' | 'BET' | ...
  index: string;       // 'NIFTY' | 'BANKNIFTY' | ...
  symbol: string;       // option tradingsymbol
  side: string;       // 'CE' | 'PE'
  entryPrice: number;
  exitPrice?: number;
  strike: number | null;
  time: number;       // unix seconds
  mode: string;       // 'LIVE' | 'PAPER'
  eventType: string;       // 'ENTRY' | 'EXIT' | 'SL' | 'TARGET'
  receivedAt: number;       // Date.now()
  tradeId?: string;       // core ledger trade ID
  sl?: number | null; // stop loss level
  target?: number | null; // target level
  exitReason?: string;
  realizedPnL?: number | null;
  lots?: number;
  // Lightweight-charts marker fields
  position: 'belowBar' | 'aboveBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text: string;
}

function buildMarker(raw: Record<string, unknown>): ChartSignal {
  const strategy = String(raw.strategy || '');
  const side = String(raw.side || '').toUpperCase();
  const eventType = String(raw.eventType || 'ENTRY').toUpperCase();
  const code = STRATEGY_CODES[strategy] || strategy.slice(0, 3);
  const mode = String(raw.mode || 'PAPER');
  const isLive = mode === 'LIVE';

  // Marker appearance based on side + event type
  let color = '#26a69a';   // teal (CE entry)
  let shape: ChartSignal['shape'] = 'arrowUp';
  let position: ChartSignal['position'] = 'belowBar';
  let text = `${code} ▲`;

  if (side === 'PE') {
    color = '#ef5350';     // red (PE entry)
    shape = 'arrowDown';
    position = 'aboveBar';
    text = `${code} ▼`;
  }

  if (eventType === 'EXIT' || eventType === 'SL' || eventType === 'TARGET' || eventType === 'SL_HIT' || eventType === 'TARGET_HIT') {
    const isTarget = eventType.includes('TARGET');
    const isSL = eventType.includes('SL');
    color = isTarget ? '#66bb6a' : isSL ? '#f44336' : '#9e9e9e';
    shape = 'circle';
    position = 'inBar';
    text = `${code} ✕`;
  }

  if (eventType === 'PARTIAL_EXIT') {
    color = '#ffca28'; // amber
    shape = 'circle';
    position = 'inBar';
    text = `${code} ½`;
  }

  // PAPER mode = slightly muted
  if (!isLive) color = color + 'CC'; // add opacity suffix (CSS)

  return {
    // TSK-CS-015: Deterministic id — no random, no flicker on re-render.
    // tradeId (from ledger) is the best anchor; fall back to strategy+index+time+eventType.
    id: raw.tradeId
      ? `${raw.tradeId}-${eventType}`
      : `${strategy}-${String(raw.index || '').toUpperCase()}-${Number(raw.time || 0)}-${eventType}`,
    strategy,
    code,
    // TSK-CS-013: normalize index to canonical alias (e.g. 'NIFTY 50' → 'NIFTY')
    index: getUnderlyingAlias(String(raw.index || '')).toUpperCase(),
    symbol: String(raw.symbol || ''),
    side,
    entryPrice: Number(raw.entryPrice || 0),
    exitPrice: raw.exitPrice ? Number(raw.exitPrice) : undefined,
    strike: raw.strike != null ? Number(raw.strike) : null,
    time: Number(raw.time || Math.floor(Date.now() / 1000)),
    mode,
    eventType,
    receivedAt: Date.now(),
    tradeId: raw.tradeId ? String(raw.tradeId) : undefined,
    sl: raw.sl != null ? Number(raw.sl) : null,
    target: raw.target != null ? Number(raw.target) : null,
    exitReason: raw.exitReason ? String(raw.exitReason) : undefined,
    realizedPnL: raw.realizedPnL != null ? Number(raw.realizedPnL) : null,
    lots: raw.lots ? Number(raw.lots) : undefined,
    position,
    color,
    shape,
    text,
  };
}

/**
 * Convert a historical ChartTrade from the REST API into a ChartSignal.
 */
function tradeToSignal(trade: ChartTrade, eventType: 'ENTRY' | 'EXIT'): ChartSignal {
  const entryTimeUnix = trade.entryTime
    ? Math.floor(new Date(trade.entryTime).getTime() / 1000)
    : Math.floor(Date.now() / 1000);
  const exitTimeUnix = trade.exitTime
    ? Math.floor(new Date(trade.exitTime).getTime() / 1000)
    : entryTimeUnix;

  return buildMarker({
    strategy: trade.strategy,
    index: getUnderlyingAlias(trade.index || ''), // TSK-CS-013
    symbol: trade.symbol,
    side: trade.side,
    entryPrice: eventType === 'ENTRY' ? trade.entryPrice : (trade.exitPrice || trade.entryPrice),
    exitPrice: trade.exitPrice,
    time: eventType === 'ENTRY' ? entryTimeUnix : exitTimeUnix,
    mode: trade.mode,
    eventType,
    tradeId: trade.tradeId,
    sl: trade.sl,
    target: trade.target,
    exitReason: trade.exitReason,
    realizedPnL: trade.realizedPnL,
    lots: trade.lots,
  });
}

// Max signals to keep in memory per index
const MAX_SIGNALS_PER_INDEX = 200;

// TSK-CS-014: Module-level singleton so React 18 StrictMode double-invoke
// doesn't cause duplicate hydration fetches. Shared across all hook instances.
let _hydrationPromise: Promise<Record<string, ChartSignal[]>> | null = null;

function getHydrationData(): Promise<Record<string, ChartSignal[]>> {
  if (_hydrationPromise) return _hydrationPromise;
  _hydrationPromise = fetchChartTrades().then(({ open, closed }) => {
    const allSignals: Record<string, ChartSignal[]> = {};

    const addSignal = (signal: ChartSignal) => {
      if (!signal.index) return;
      if (!allSignals[signal.index]) allSignals[signal.index] = [];
      allSignals[signal.index].push(signal);
    };

    for (const trade of open) addSignal(tradeToSignal(trade, 'ENTRY'));
    for (const trade of closed) {
      addSignal(tradeToSignal(trade, 'ENTRY'));
      addSignal(tradeToSignal(trade, 'EXIT'));
    }

    for (const idx of Object.keys(allSignals)) {
      allSignals[idx].sort((a, b) => a.time - b.time);
      allSignals[idx] = allSignals[idx].slice(-MAX_SIGNALS_PER_INDEX);
    }
    return allSignals;
  }).catch(() => ({}));
  return _hydrationPromise;
}

export function useChartSignals() {
  // Map of index → signals array
  const [signalsByIndex, setSignalsByIndex] = useState<Record<string, ChartSignal[]>>({});
  const listenerAttached = useRef(false);

  // TSK-CS-014: Hydrate from REST API on mount using module-level singleton promise.
  // Safe against React 18 StrictMode double-invoke (same promise reused).
  useEffect(() => {
    let cancelled = false;
    getHydrationData().then(allSignals => {
      if (!cancelled) {
        setSignalsByIndex(prev => ({ ...prev, ...allSignals }));
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Live WebSocket signals
  useEffect(() => {
    if (listenerAttached.current) return;
    listenerAttached.current = true;

    const handler = (event: Event) => {
      const custom = event as CustomEvent<Record<string, unknown>>;
      try {
        const signal = buildMarker(custom.detail || {});
        if (!signal.index) return;

        setSignalsByIndex(prev => {
          const existing = prev[signal.index] || [];
          // Avoid duplicate (same time + strategy + eventType + tradeId)
          const isDup = existing.some(s => s.time === signal.time && s.strategy === signal.strategy && s.eventType === signal.eventType && (!signal.tradeId || s.tradeId === signal.tradeId));
          if (isDup) return prev;
          const updated = [...existing, signal].slice(-MAX_SIGNALS_PER_INDEX);
          return { ...prev, [signal.index]: updated };
        });
      } catch (_) { }
    };

    window.addEventListener('pratham-chart-signal', handler);
    return () => {
      window.removeEventListener('pratham-chart-signal', handler);
      listenerAttached.current = false;
    };
  }, []);

  const getSignalsForIndex = useCallback(
    (index: string): ChartSignal[] => signalsByIndex[index.toUpperCase()] || [],
    [signalsByIndex]
  );

  const clearSignalsForIndex = useCallback((index: string) => {
    setSignalsByIndex(prev => {
      const next = { ...prev };
      delete next[index.toUpperCase()];
      return next;
    });
  }, []);

  return { signalsByIndex, getSignalsForIndex, clearSignalsForIndex };
}

export type { ChartSignal as TradeMarker };
