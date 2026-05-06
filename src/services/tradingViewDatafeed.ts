import { getHistoricalKlines, getKlines, subscribeToTicker } from './openalgo';
import { getInstrumentInfo, searchSymbols, type Instrument, type SearchResult } from './instrumentService';
import logger from '../utils/logger';
import { getCanonicalExchange, normalizeSymbol } from '../utils/symbolNormalization';

type DatafeedCallback<T> = (value: T) => void;
type DatafeedErrorCallback = (error: string) => void;
type HistoryCallback = (bars: TvBar[], meta?: { noData?: boolean }) => void;

export interface TvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TvSymbolInfo {
  ticker: string;
  name: string;
  description: string;
  type: string;
  session: string;
  timezone: string;
  exchange: string;
  listed_exchange: string;
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  has_no_volume: boolean;
  has_weekly_and_monthly: boolean;
  supported_resolutions: string[];
  volume_precision: number;
  data_status: 'streaming' | 'endofday';
}

interface TvPeriodParams {
  from: number;
  to: number;
  countBack: number;
  firstDataRequest: boolean;
}

interface SearchSymbolResultItem {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  ticker: string;
  type: string;
}

interface SubscriberRecord {
  uid: string;
  resolution: string;
  symbolInfo: TvSymbolInfo;
  lastBar: TvBar | null;
  resetCache?: () => void;
  close: () => void;
}

const SUPPORTED_RESOLUTIONS = ['1', '3', '5', '10', '15', '30', '60', '1D', '1W', '1M'];
const TV_TIMEZONE = 'Asia/Kolkata';
const TV_LOCALE = 'en';
const DEFAULT_PRICE_SCALE = 100;
const subscribers = new Map<string, SubscriberRecord>();

function toTvResolution(interval: string): string {
  const upper = interval.toUpperCase();
  const map: Record<string, string> = {
    '1M': '1',
    '3M': '3',
    '5M': '5',
    '10M': '10',
    '15M': '15',
    '30M': '30',
    '1H': '60',
    '60': '60',
    '1D': '1D',
    D: '1D',
    W: '1W',
    M: '1M',
  };
  return map[upper] || interval;
}

function fromTvResolution(resolution: string): string {
  const upper = resolution.toUpperCase();
  const map: Record<string, string> = {
    '1': '1m',
    '3': '3m',
    '5': '5m',
    '10': '10m',
    '15': '15m',
    '30': '30m',
    '60': '1h',
    D: '1d',
    '1D': '1d',
    '1W': '1w',
    '1M': '1M',
  };
  return map[upper] || resolution;
}

function getSessionByExchange(exchange: string): string {
  const upper = exchange.toUpperCase();
  if (upper === 'MCX') return '0900-2330';
  return '0915-1530';
}

function getSymbolType(result?: Partial<SearchResult> | null): string {
  const instrumentType = (result?.instrumenttype || '').toUpperCase();
  const exchange = (result?.exchange || '').toUpperCase();

  if (exchange.includes('INDEX')) return 'index';
  if (instrumentType === 'FUT') return 'futures';
  if (instrumentType === 'CE' || instrumentType === 'PE') return 'option';
  if (exchange === 'MCX') return 'futures';
  return 'stock';
}

function buildTicker(symbol: string, exchange: string): string {
  return `${exchange}:${symbol}`;
}

function toBarTimeMs(timeSeconds: number): number {
  return timeSeconds * 1000;
}

function normalizeSearchResults(results: SearchResult[]): SearchSymbolResultItem[] {
  return results.map((item) => {
    const exchange = getCanonicalExchange(item.symbol || '', item.exchange || 'NSE');
    const symbol = normalizeSymbol(item.symbol || '');
    return {
      symbol,
      full_name: buildTicker(symbol, exchange),
      description: item.name || item.symbol || symbol,
      exchange,
      ticker: buildTicker(symbol, exchange),
      type: getSymbolType({ instrumenttype: item.instrumenttype, exchange }),
    };
  });
}

async function resolveFromInstrument(symbolName: string, exchangeHint?: string): Promise<TvSymbolInfo> {
  const normalizedSymbol = normalizeSymbol(symbolName);
  const exchange = getCanonicalExchange(normalizedSymbol, exchangeHint || 'NSE');
  const instrument = await getInstrumentInfo(normalizedSymbol, exchange);

  const description =
    instrument?.name ||
    instrument?.tradingsymbol ||
    instrument?.symbol ||
    normalizedSymbol;

  return {
    ticker: buildTicker(normalizedSymbol, exchange),
    name: normalizedSymbol,
    description,
    type: getSymbolType({ instrumenttype: instrument?.instrumenttype, exchange }),
    session: getSessionByExchange(exchange),
    timezone: TV_TIMEZONE,
    exchange,
    listed_exchange: exchange,
    minmov: 1,
    pricescale: DEFAULT_PRICE_SCALE,
    has_intraday: true,
    has_no_volume: false,
    has_weekly_and_monthly: true,
    supported_resolutions: SUPPORTED_RESOLUTIONS,
    volume_precision: 0,
    data_status: 'streaming',
  };
}

function aggregateRealtimeBar(lastBar: TvBar | null, resolution: string, tick: TvBar): TvBar {
  const interval = fromTvResolution(resolution);

  const bucketSizeMs = (() => {
    if (interval === '1h') return 60 * 60 * 1000;
    if (interval === '1d') return 24 * 60 * 60 * 1000;
    if (interval === '1w') return 7 * 24 * 60 * 60 * 1000;
    if (interval === '1M') return 30 * 24 * 60 * 60 * 1000;
    const minutes = parseInt(interval, 10);
    return Number.isFinite(minutes) ? minutes * 60 * 1000 : 5 * 60 * 1000;
  })();

  const roundedTime = Math.floor(tick.time / bucketSizeMs) * bucketSizeMs;

  if (!lastBar || roundedTime > lastBar.time) {
    return {
      time: roundedTime,
      open: tick.open,
      high: tick.high,
      low: tick.low,
      close: tick.close,
      volume: tick.volume || 0,
    };
  }

  return {
    ...lastBar,
    high: Math.max(lastBar.high, tick.high),
    low: Math.min(lastBar.low, tick.low),
    close: tick.close,
    volume: (lastBar.volume || 0) + (tick.volume || 0),
  };
}

export function createTradingViewDatafeed() {
  return {
    onReady(callback: DatafeedCallback<Record<string, unknown>>) {
      setTimeout(() => {
        callback({
          supported_resolutions: SUPPORTED_RESOLUTIONS,
          exchanges: [
            { value: '', name: 'All Exchanges', desc: '' },
            { value: 'NSE', name: 'NSE', desc: 'National Stock Exchange' },
            { value: 'BSE', name: 'BSE', desc: 'Bombay Stock Exchange' },
            { value: 'MCX', name: 'MCX', desc: 'Multi Commodity Exchange' },
          ],
          symbols_types: [
            { name: 'All types', value: '' },
            { name: 'Stocks', value: 'stock' },
            { name: 'Indices', value: 'index' },
            { name: 'Futures', value: 'futures' },
            { name: 'Options', value: 'option' },
          ],
          supports_marks: false,
          supports_timescale_marks: false,
          supports_time: true,
        });
      }, 0);
    },

    async searchSymbols(
      userInput: string,
      exchange: string,
      symbolType: string,
      onResultReadyCallback: DatafeedCallback<SearchSymbolResultItem[]>
    ) {
      try {
        const rawResults = await searchSymbols(userInput, exchange || undefined);
        let items = normalizeSearchResults(rawResults);

        if (exchange) {
          items = items.filter((item) => item.exchange.toUpperCase() === exchange.toUpperCase());
        }

        if (symbolType) {
          items = items.filter((item) => item.type === symbolType);
        }

        onResultReadyCallback(items.slice(0, 50));
      } catch (error) {
        logger.error('[TradingViewDatafeed] searchSymbols failed:', error);
        onResultReadyCallback([]);
      }
    },

    async resolveSymbol(
      symbolName: string,
      onSymbolResolvedCallback: DatafeedCallback<TvSymbolInfo>,
      onResolveErrorCallback: DatafeedErrorCallback
    ) {
      try {
        const [exchangeHint, rawSymbol] = symbolName.includes(':')
          ? symbolName.split(':')
          : [undefined, symbolName];

        const symbolInfo = await resolveFromInstrument(rawSymbol, exchangeHint);
        onSymbolResolvedCallback(symbolInfo);
      } catch (error) {
        logger.error('[TradingViewDatafeed] resolveSymbol failed:', error);
        onResolveErrorCallback('unknown_symbol');
      }
    },

    async getBars(
      symbolInfo: TvSymbolInfo,
      resolution: string,
      periodParams: TvPeriodParams,
      onHistoryCallback: HistoryCallback,
      onErrorCallback: DatafeedErrorCallback
    ) {
      try {
        const interval = fromTvResolution(resolution);
        const symbol = normalizeSymbol(symbolInfo.name);
        const exchange = symbolInfo.exchange;

        const fromDate = new Date(periodParams.from * 1000).toISOString().slice(0, 10);
        const toDate = new Date(periodParams.to * 1000).toISOString().slice(0, 10);

        const candles = periodParams.firstDataRequest
          ? await getKlines(symbol, exchange, interval)
          : await getHistoricalKlines(symbol, exchange, interval, fromDate, toDate);

        const bars: TvBar[] = candles
          .map((bar) => ({
            time: toBarTimeMs(bar.time),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          }))
          .sort((a, b) => a.time - b.time);

        onHistoryCallback(bars, { noData: bars.length === 0 });
      } catch (error) {
        logger.error('[TradingViewDatafeed] getBars failed:', error);
        onErrorCallback((error as Error).message || 'Failed to load historical data');
      }
    },

    subscribeBars(
      symbolInfo: TvSymbolInfo,
      resolution: string,
      onRealtimeCallback: DatafeedCallback<TvBar>,
      subscriberUID: string,
      onResetCacheNeededCallback?: () => void
    ) {
      const symbol = normalizeSymbol(symbolInfo.name);
      const exchange = symbolInfo.exchange;

      const subscription = subscribeToTicker(symbol, exchange, fromTvResolution(resolution), (tick) => {
        const realtimeBar = aggregateRealtimeBar(
          subscribers.get(subscriberUID)?.lastBar || null,
          resolution,
          {
            time: toBarTimeMs(tick.time),
            open: tick.open,
            high: tick.high,
            low: tick.low,
            close: tick.close,
            volume: tick.volume,
          }
        );

        const existing = subscribers.get(subscriberUID);
        if (existing) {
          existing.lastBar = realtimeBar;
        }

        onRealtimeCallback(realtimeBar);
      });

      subscribers.set(subscriberUID, {
        uid: subscriberUID,
        resolution,
        symbolInfo,
        lastBar: null,
        resetCache: onResetCacheNeededCallback,
        close: () => subscription.close(),
      });
    },

    unsubscribeBars(subscriberUID: string) {
      const existing = subscribers.get(subscriberUID);
      if (!existing) return;

      existing.close();
      subscribers.delete(subscriberUID);
    },
  };
}

export default createTradingViewDatafeed;
