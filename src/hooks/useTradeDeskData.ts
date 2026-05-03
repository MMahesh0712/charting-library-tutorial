import { useCallback, useEffect, useState } from 'react';

export interface TradeDeskCockpit {
  connection?: {
    broker?: string;
    brokerConnected?: boolean;
    session?: string;
    dataHealth?: string;
    accountName?: string | null;
    clientId?: string | null;
    lastSync?: string;
  };
  money?: {
    totalPnL?: number;
    realizedPnL?: number;
    unrealizedPnL?: number;
    source?: string;
  };
  algoMonitor?: {
    algoTradesToday?: number;
    manualTradesToday?: number;
    algoRunningPositions?: number;
    lastAlgoAction?: {
      strategy?: string;
      index?: string;
      action?: string;
      time?: string;
    } | null;
    activeAlgoTrades?: Array<Record<string, unknown>>;
    strategyAttribution?: {
      counts?: Record<string, number>;
      pnl?: Record<string, number>;
    };
  };
  positions?: {
    openCount?: number;
    totalPnL?: number;
    totalM2M?: number;
  };
  orders?: {
    pending?: number;
    rejected?: number;
    completed?: number;
    total?: number;
    lastRejectReason?: string | null;
    recent?: Array<Record<string, unknown>>;
  };
  funds?: {
    available?: number;
    used?: number;
    openingBalance?: number;
    collateral?: number;
    net?: number;
  };
  risk?: {
    dailyLossLimit?: number | null;
    currentLoss?: number;
    slHitCount?: number;
    killSwitch?: boolean;
    killReason?: string | null;
    mode?: string;
    strategyModes?: Record<string, string>;
  };
  redFlags?: string[];
  brokerError?: string | null;
  apiHealth?: Record<string, string>;
  tradesToday?: number;
  stats?: {
    totalTradesToday?: number;
    algoTrades?: number;
    winners?: number;
    losers?: number;
    winRate?: number;
  };
}

export interface TradeDeskPosition {
  position_id?: string;
  strategy?: string;
  slot?: string;
  symbol?: string;
  index_name?: string;
  side?: string;
  entry_price?: number | string;
  current_price?: number | string;
  sl?: number | string | null;
  target?: number | string | null;
  lots?: number | string;
  lot_size?: number | string;
  quantity?: number | string;
  mode?: string;
  paper?: boolean;
  trade_id?: string;
  opened_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TradeDeskTrade {
  tradeId?: string;
  strategy?: string;
  index?: string;
  side?: string;
  symbol?: string;
  entryPrice?: number;
  exitPrice?: number | null;
  currentPrice?: number;
  quantity?: number;
  lots?: number;
  lotSize?: number;
  originalLots?: number;
  originalQuantity?: number;
  status?: string;
  pnl?: { total?: number } | number;
  openTime?: string;
  closeTime?: string | null;
  closeReason?: string | null;
  durationMinutes?: number | null;
  mode?: string;
  broker?: string;
  [key: string]: unknown;
}

export interface TradeDeskSystemEvent {
  id?: string | number;
  event_id?: string | number;
  event_type?: string;
  strategy?: string | null;
  details?: string | Record<string, unknown> | null;
  timestamp?: string;
  runtime_source?: string;
  [key: string]: unknown;
}

export interface UseTradeDeskDataReturn {
  cockpit: TradeDeskCockpit | null;
  positions: TradeDeskPosition[];
  trades: TradeDeskTrade[];
  events: TradeDeskSystemEvent[];
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  refresh: () => Promise<void>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export function useTradeDeskData(
  isOpen: boolean,
  isAuthenticated: boolean,
  refreshKey: number = 0,
): UseTradeDeskDataReturn {
  const [cockpit, setCockpit] = useState<TradeDeskCockpit | null>(null);
  const [positions, setPositions] = useState<TradeDeskPosition[]>([]);
  const [trades, setTrades] = useState<TradeDeskTrade[]>([]);
  const [events, setEvents] = useState<TradeDeskSystemEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !isOpen) return;

    setIsLoading(true);
    setError(null);

    const results = await Promise.allSettled([
      fetchJson<{ ok?: boolean; [key: string]: unknown }>('/api/trades/account-cockpit'),
      fetchJson<{ ok?: boolean; positions?: TradeDeskPosition[] }>('/api/db/positions'),
      fetchJson<{ trades?: TradeDeskTrade[] }>('/api/trades/today'),
      fetchJson<{ ok?: boolean; events?: TradeDeskSystemEvent[] }>('/api/db/system-events?limit=40'),
    ]);

    const [cockpitResult, positionsResult, tradesResult, eventsResult] = results;

    if (cockpitResult.status === 'fulfilled') {
      setCockpit(cockpitResult.value as unknown as TradeDeskCockpit);
    } else {
      setCockpit(null);
    }

    if (positionsResult.status === 'fulfilled') {
      setPositions(Array.isArray(positionsResult.value.positions) ? positionsResult.value.positions : []);
    } else {
      setPositions([]);
    }

    if (tradesResult.status === 'fulfilled') {
      setTrades(Array.isArray(tradesResult.value.trades) ? tradesResult.value.trades : []);
    } else {
      setTrades([]);
    }

    if (eventsResult.status === 'fulfilled') {
      setEvents(Array.isArray(eventsResult.value.events) ? eventsResult.value.events : []);
    } else {
      setEvents([]);
    }

    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length === results.length) {
      setError('Trade Desk data could not be loaded.');
    } else if (failures.length > 0) {
      setError('Some Trade Desk data is unavailable.');
    }

    setLastRefresh(new Date());
    setIsLoading(false);
  }, [isAuthenticated, isOpen]);

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;

    refresh();
    const intervalId = window.setInterval(refresh, 15000);
    return () => window.clearInterval(intervalId);
  }, [isOpen, isAuthenticated, refresh, refreshKey]);

  return {
    cockpit,
    positions,
    trades,
    events,
    isLoading,
    error,
    lastRefresh,
    refresh,
  };
}

export default useTradeDeskData;
