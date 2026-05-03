/**
 * Option Chain Service
 * Handles option chain fetching using OpenAlgo Option Chain API
 */

import {
  getOptionChain as fetchOptionChainAPI,
  getOptionGreeks,
  getMultiOptionGreeks,
  getKlines,
  searchSymbols,
  getExpiry,
  fetchExpiryDates,
} from './openalgo';
import logger from '../utils/logger';

// Import cache functions from dedicated module (used internally)
import {
  getCacheKey,
  isCacheValid,
  isNonFOSymbol,
  markAsNonFOSymbol,
  getOptionChainFromCache,
  setOptionChainInCache,
  shouldApplyRateLimit,
  getRateLimitWaitTime,
  updateLastApiCallTime,
  setExpiryInCache,
  getExpiryFromCache,
  getExpiryCacheKey,
  CACHE_CONFIG,
} from './optionChainCache';

// Re-export clearOptionChainCache for external use
export { clearOptionChainCache } from './optionChainCache';

// ==================== TYPES ====================

/** Underlying configuration */
export interface UnderlyingConfig {
  symbol: string;
  name: string;
  exchange: string;
  indexExchange: string;
}

/** Option data */
export interface OptionData {
  symbol: string;
  ltp: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  bid: number;
  ask: number;
  oi: number;
  volume: number;
  label: string;
  lotSize: number;
}

/** Option chain row */
export interface OptionChainRow {
  strike: number;
  ce: OptionData | null;
  pe: OptionData | null;
  straddlePremium: string;
}

/** Processed option chain data */
export interface ProcessedOptionChain {
  underlying: string;
  exchange: string;
  underlyingLTP: number;
  underlyingPrevClose: number;
  change: number;
  changePercent: number;
  atmStrike: number;
  expiryDate: string | null;
  expiryDateObj: Date | null;
  dte: number;
  expiries: string[];
  chain: OptionChainRow[];
  chainByExpiry: Record<string, OptionChainRow[]>;
}

/** Raw API option data */
interface RawOptionData {
  symbol?: string | undefined;
  ltp?: number | string | undefined;
  prev_close?: number | string | undefined;
  open?: number | string | undefined;
  high?: number | string | undefined;
  low?: number | string | undefined;
  bid?: number | string | undefined;
  ask?: number | string | undefined;
  oi?: number | string | undefined;
  volume?: number | string | undefined;
  label?: string | undefined;
  lotsize?: number | string | undefined;
  lot_size?: number | string | undefined;
}

/** Raw API chain row */
interface RawChainRow {
  strike?: number | string | undefined;
  ce?: RawOptionData | undefined;
  pe?: RawOptionData | undefined;
}

/** Raw API response */
interface RawOptionChainResponse {
  underlying?: string | undefined;
  underlyingLTP?: number | undefined;
  underlyingPrevClose?: number | undefined;
  underlying_prev_close?: number | undefined;
  atmStrike?: number | undefined;
  expiryDate?: string | undefined;
  chain?: RawChainRow[] | undefined;
}

/** Expiry tab info */
export interface ExpiryTabInfo {
  display: string;
  dte: number;
  label: string;
}

/** Candle data */
interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | undefined;
}

/** Symbol search result */
interface SymbolResult {
  symbol?: string | undefined;
}

/** Strategy leg config */
export interface LegConfig {
  direction: 'buy' | 'sell';
  quantity: number;
}

/** Straddle config */
export interface StraddleConfig {
  underlying?: string | undefined;
  ceSymbol?: string | undefined;
  peSymbol?: string | undefined;
  ceStrike?: number | undefined;
  peStrike?: number | undefined;
  expiry?: string | Date | undefined;
}

/** API error with code */
interface ApiError extends Error {
  code?: string | undefined;
}

// Common F&O underlyings with their index exchanges
export const UNDERLYINGS: UnderlyingConfig[] = [
  { symbol: 'NIFTY', name: 'NIFTY 50', exchange: 'NFO', indexExchange: 'NSE_INDEX' },
  { symbol: 'BANKNIFTY', name: 'BANK NIFTY', exchange: 'NFO', indexExchange: 'NSE_INDEX' },
  { symbol: 'FINNIFTY', name: 'FIN NIFTY', exchange: 'NFO', indexExchange: 'NSE_INDEX' },
  { symbol: 'MIDCPNIFTY', name: 'MIDCAP NIFTY', exchange: 'NFO', indexExchange: 'NSE_INDEX' },
  { symbol: 'SENSEX', name: 'SENSEX', exchange: 'BFO', indexExchange: 'BSE_INDEX' },
  { symbol: 'BANKEX', name: 'BANKEX', exchange: 'BFO', indexExchange: 'BSE_INDEX' },
  { symbol: 'CRUDEOIL', name: 'CRUDEOIL', exchange: 'MCX', indexExchange: 'MCX' },
  { symbol: 'NATURALGAS', name: 'NATURALGAS', exchange: 'MCX', indexExchange: 'MCX' },
];

const normalizeUnderlyingSymbol = (symbol: string | null | undefined): string =>
  String(symbol || '').trim().toUpperCase();

const OPTION_CHAIN_REQUEST_SYMBOL_ALIASES: Record<string, string> = {
  BANKNIFTY: 'NIFTY BANK',
  FINNIFTY: 'NIFTY FIN SERVICE',
  MIDCPNIFTY: 'NIFTY MID SELECT',
};

const getOptionChainRequestSymbol = (symbol: string | null | undefined): string => {
  const normalized = normalizeUnderlyingSymbol(symbol);
  return OPTION_CHAIN_REQUEST_SYMBOL_ALIASES[normalized] || normalized;
};

// Month codes for option symbols (NSE format)
const MONTH_CODES: Record<number, string> = {
  1: 'JAN',
  2: 'FEB',
  3: 'MAR',
  4: 'APR',
  5: 'MAY',
  6: 'JUN',
  7: 'JUL',
  8: 'AUG',
  9: 'SEP',
  10: 'OCT',
  11: 'NOV',
  12: 'DEC',
};

// Reverse month codes
const MONTH_TO_NUM: Record<string, number> = Object.fromEntries(
  Object.entries(MONTH_CODES).map(([k, v]) => [v, parseInt(k)])
);

/**
 * Safe parsing helpers for type coercion safety
 */
const safeParseFloat = (value: unknown, fallback: number = 0): number => {
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeParseInt = (value: unknown, fallback: number = 0): number => {
  const parsed = parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const createValidatedDate = (year: number, month: number, day: number): Date | null => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

/**
 * Parse expiry date strings from OpenAlgo/search into a Date object.
 */
export const parseExpiryDate = (expiryStr: string | null | undefined): Date | null => {
  if (!expiryStr) return null;

  const raw = String(expiryStr).trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return null;

  const monthCodeMatch = raw.match(/^(\d{1,2})-?([A-Z]{3})-?(\d{2}|\d{4})$/);
  if (monthCodeMatch) {
    const [, dayStr, monthStr, yearStr] = monthCodeMatch;
    const day = parseInt(dayStr!, 10);
    const month = MONTH_TO_NUM[monthStr!];
    const yearRaw = parseInt(yearStr!, 10);
    const year = yearStr!.length === 2 ? 2000 + yearRaw : yearRaw;

    if (!month) return null;
    return createValidatedDate(year, month, day);
  }

  const isoMatch = raw.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, yearStr, monthStr, dayStr] = isoMatch;
    return createValidatedDate(
      parseInt(yearStr!, 10),
      parseInt(monthStr!, 10),
      parseInt(dayStr!, 10)
    );
  }

  const compactIsoMatch = raw.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (compactIsoMatch) {
    const [, yearStr, monthStr, dayStr] = compactIsoMatch;
    return createValidatedDate(
      parseInt(yearStr!, 10),
      parseInt(monthStr!, 10),
      parseInt(dayStr!, 10)
    );
  }

  const numericDmyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (numericDmyMatch) {
    const [, dayStr, monthStr, yearStr] = numericDmyMatch;
    const yearRaw = parseInt(yearStr!, 10);
    const year = yearStr!.length === 2 ? 2000 + yearRaw : yearRaw;
    return createValidatedDate(year, parseInt(monthStr!, 10), parseInt(dayStr!, 10));
  }

  return null;
};

/**
 * Format Date to DDMMMYY format for API
 */
export const formatExpiryDate = (date: Date | null | undefined): string => {
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTH_CODES[date.getMonth() + 1];
  const year = String(date.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
};

/**
 * Normalize expiry values from backend/search to DDMMMYY code
 */
export const normalizeExpiryCode = (expiry: string | null | undefined): string => {
  if (!expiry) return '';

  const raw = String(expiry).trim().toUpperCase();
  if (!raw) return '';

  const parsed = parseExpiryDate(raw);
  if (parsed) {
    return formatExpiryDate(parsed);
  }

  return raw.replace(/-/g, '');
};

/**
 * Calculate days to expiry from expiry date string
 */
export const getDaysToExpiry = (expiryStr: string | null | undefined): number => {
  const expiryDate = parseExpiryDate(expiryStr);
  if (!expiryDate) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);

  const diffTime = expiryDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

/**
 * Get expiry label type (CW, NW, CM, etc.)
 */
export const getExpiryLabel = (expiryStr: string, index: number): string => {
  const dte = getDaysToExpiry(expiryStr);
  if (index === 0) return 'CW'; // Current Week
  if (index === 1) return 'NW'; // Next Week
  if (dte <= 7) return 'W' + (index + 1);
  if (dte <= 35) return 'CM'; // Current Month
  return 'NM'; // Next Month
};

/**
 * Format expiry for TradingView-style tab display
 */
export const formatExpiryTab = (expiryStr: string, index: number): ExpiryTabInfo => {
  const date = parseExpiryDate(expiryStr);
  if (!date) return { display: expiryStr, dte: 0, label: '' };

  const day = date.getDate();
  const month = date.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
  const year = date.getFullYear().toString().slice(-2);
  const dte = getDaysToExpiry(expiryStr);
  const label = getExpiryLabel(expiryStr, index);

  return { display: `${day} ${month} '${year}`, dte, label };
};

/**
 * Get option chain for an underlying using OpenAlgo Option Chain API
 */
export const getOptionChain = async (
  underlying: string,
  exchange: string = 'NFO',
  expiryDate: string | null = null,
  strikeCount: number = 15,
  forceRefresh: boolean = false
): Promise<ProcessedOptionChain> => {
  const normalizedUnderlying = normalizeUnderlyingSymbol(underlying);
  const requestUnderlying = getOptionChainRequestSymbol(normalizedUnderlying);

  // Check if symbol is known to not support F&O
  if (isNonFOSymbol(normalizedUnderlying)) {
    logger.debug('[OptionChain] Symbol known to not support F&O:', normalizedUnderlying);
    const error: ApiError = new Error(`${normalizedUnderlying} does not support F&O trading`);
    error.code = 'NO_FO_SUPPORT';
    throw error;
  }

  const cacheKey = getCacheKey(normalizedUnderlying, expiryDate);
  const cached = getOptionChainFromCache(cacheKey);

  // Return cached data if valid and not forcing refresh
  if (!forceRefresh && isCacheValid(cached)) {
    logger.debug(
      '[OptionChain] Using cached data for:',
      cacheKey,
      '(age:',
      Math.round((Date.now() - cached!.timestamp) / 1000),
      's)'
    );
    return cached!.data as ProcessedOptionChain;
  }

  // Rate limit protection
  if (shouldApplyRateLimit()) {
    const waitTime = getRateLimitWaitTime();
    logger.debug('[OptionChain] Rate limit protection: waiting', waitTime, 'ms before API call');

    if (cached) {
      logger.debug('[OptionChain] Using stale cache to avoid rate limit');
      return cached.data as ProcessedOptionChain;
    }

    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  try {
    const underlyingConfig = UNDERLYINGS.find((u) => u.symbol === normalizedUnderlying);
    const optionExchange = exchange || underlyingConfig?.exchange || 'NFO';
    const requestExchange =
      underlyingConfig?.indexExchange ||
      (optionExchange === 'BFO' ? 'BSE_INDEX' : optionExchange === 'MCX' ? 'MCX' : 'NSE_INDEX');

    logger.debug('[OptionChain] Fetching fresh chain:', {
      underlying: normalizedUnderlying,
      requestUnderlying,
      exchange: requestExchange,
      optionExchange,
      expiryDate,
      strikeCount,
    });

    updateLastApiCallTime();

    const result = (await fetchOptionChainAPI(
      requestUnderlying,
      requestExchange,
      expiryDate,
      strikeCount
    )) as RawOptionChainResponse | null;

    if (!result) {
      logger.error('[OptionChain] API returned null');

      if (cached) {
        logger.debug('[OptionChain] API returned null, using stale cache for:', cacheKey);
        return cached.data as ProcessedOptionChain;
      }

      throw new Error('Option chain API unavailable (rate limit)');
    }

    // Transform chain data
    const chain: OptionChainRow[] = (result.chain || [])
      .filter((row) => row && typeof row.strike !== 'undefined')
      .map((row) => {
        const strike = safeParseFloat(row.strike);
        const ceLtp = safeParseFloat(row.ce?.ltp);
        const peLtp = safeParseFloat(row.pe?.ltp);
        const straddlePremium = (ceLtp + peLtp).toFixed(2);

        return {
          strike,
          ce:
            row.ce && typeof row.ce === 'object'
              ? {
                  symbol: row.ce.symbol || '',
                  ltp: ceLtp,
                  prevClose: safeParseFloat(row.ce.prev_close),
                  open: safeParseFloat(row.ce.open),
                  high: safeParseFloat(row.ce.high),
                  low: safeParseFloat(row.ce.low),
                  bid: safeParseFloat(row.ce.bid),
                  ask: safeParseFloat(row.ce.ask),
                  oi: safeParseInt(row.ce.oi),
                  volume: safeParseInt(row.ce.volume),
                  label: row.ce.label || '',
                  lotSize: safeParseInt(row.ce.lotsize || row.ce.lot_size),
                }
              : null,
          pe:
            row.pe && typeof row.pe === 'object'
              ? {
                  symbol: row.pe.symbol || '',
                  ltp: peLtp,
                  prevClose: safeParseFloat(row.pe.prev_close),
                  open: safeParseFloat(row.pe.open),
                  high: safeParseFloat(row.pe.high),
                  low: safeParseFloat(row.pe.low),
                  bid: safeParseFloat(row.pe.bid),
                  ask: safeParseFloat(row.pe.ask),
                  oi: safeParseInt(row.pe.oi),
                  volume: safeParseInt(row.pe.volume),
                  label: row.pe.label || '',
                  lotSize: safeParseInt(row.pe.lotsize || row.pe.lot_size),
                }
              : null,
          straddlePremium,
        };
      });

    const normalizedResultExpiry = normalizeExpiryCode(result.expiryDate || expiryDate);
    const expiryDateObj = parseExpiryDate(normalizedResultExpiry);
    const dte = getDaysToExpiry(normalizedResultExpiry);

    const underlyingLTP = result.underlyingLTP || 0;
    const underlyingPrevClose =
      result.underlyingPrevClose || result.underlying_prev_close || 0;
    const change = underlyingPrevClose > 0 ? underlyingLTP - underlyingPrevClose : 0;
    const changePercent = underlyingPrevClose > 0 ? (change / underlyingPrevClose) * 100 : 0;

    const processedData: ProcessedOptionChain = {
      underlying: normalizedUnderlying,
      exchange: optionExchange,
      underlyingLTP,
      underlyingPrevClose,
      change,
      changePercent,
      atmStrike: result.atmStrike || 0,
      expiryDate: normalizedResultExpiry || null,
      expiryDateObj,
      dte,
      expiries: normalizedResultExpiry ? [normalizedResultExpiry] : [],
      chain,
      chainByExpiry: normalizedResultExpiry ? { [normalizedResultExpiry]: chain } : {},
    };

    if (chain.length > 0) {
      setOptionChainInCache(cacheKey, processedData);
    }

    return processedData;
  } catch (error) {
    logger.error('[OptionChain] Error fetching option chain:', error);

    const apiError = error as ApiError;
    if (apiError.code === 'NO_FO_SUPPORT') {
      markAsNonFOSymbol(normalizedUnderlying);
      throw error;
    }

    if (cached) {
      logger.debug('[OptionChain] API error, returning stale cache for:', cacheKey);
      return cached.data as ProcessedOptionChain;
    }

    return {
      underlying: normalizedUnderlying,
      exchange,
      underlyingLTP: 0,
      underlyingPrevClose: 0,
      change: 0,
      changePercent: 0,
      atmStrike: 0,
      expiryDate: null,
      expiryDateObj: null,
      dte: 0,
      expiries: [],
      chain: [],
      chainByExpiry: {},
    };
  }
};

/**
 * Get available expiries for an underlying
 */
export const getAvailableExpiries = async (
  underlying: string,
  exchange: string | null = null,
  instrumenttype: string = 'options'
): Promise<string[]> => {
  const normalizedUnderlying = normalizeUnderlyingSymbol(underlying);
  const requestUnderlying = getOptionChainRequestSymbol(normalizedUnderlying);

  try {
    let foExchange = exchange;
    if (!foExchange) {
      const underlyingConfig = UNDERLYINGS.find((u) => u.symbol === normalizedUnderlying);
      if (underlyingConfig) {
        foExchange = underlyingConfig.exchange;
      } else {
        foExchange = 'NFO';
      }
    }

    const cacheKey = getExpiryCacheKey(normalizedUnderlying, foExchange, instrumenttype);
    const cached = getExpiryFromCache(cacheKey);

    if (isCacheValid(cached, CACHE_CONFIG.EXPIRY_CACHE_TTL_MS)) {
      logger.debug(
        '[OptionChain] Using cached expiries for:',
        cacheKey,
        '(age:',
        Math.round((Date.now() - cached!.timestamp) / 1000),
        's)'
      );
      return cached!.data as string[];
    }

    logger.debug('[OptionChain] Fetching expiries for', normalizedUnderlying, 'as', requestUnderlying, 'on', foExchange);

    let expiryDates = await fetchExpiryDates(requestUnderlying, foExchange, instrumenttype);

    if (!expiryDates || expiryDates.length === 0) {
      logger.debug(
        '[OptionChain] fetchExpiryDates returned empty, trying getExpiry for',
        requestUnderlying
      );
      expiryDates = await getExpiry(requestUnderlying, foExchange, instrumenttype);
    }

    if (!expiryDates || expiryDates.length === 0) {
      logger.debug(
        '[OptionChain] Expiry APIs returned empty, falling back to symbol parsing for',
        requestUnderlying
      );
      return await getExpiriesFromSymbolSearch(normalizedUnderlying);
    }

    const expiries = expiryDates.map((dateStr) => {
      if (typeof dateStr !== 'string') {
        logger.warn('[OptionChain] Non-string expiry date:', dateStr);
        return String(dateStr || '');
      }
      return normalizeExpiryCode(dateStr);
    }).filter(Boolean);

    setExpiryInCache(cacheKey, expiries);

    return expiries;
  } catch (error) {
    logger.error('[OptionChain] Error getting expiries:', error);
    try {
      return await getExpiriesFromSymbolSearch(normalizedUnderlying || requestUnderlying);
    } catch (fallbackError) {
      logger.error('[OptionChain] Fallback symbol search also failed:', fallbackError);
      return [];
    }
  }
};

/**
 * Fallback: Get expiries by parsing option symbols
 */
const getExpiriesFromSymbolSearch = async (underlying: string): Promise<string[]> => {
  try {
    const normalizedUnderlying = normalizeUnderlyingSymbol(underlying);
    const searchTerms = Array.from(new Set([
      getOptionChainRequestSymbol(normalizedUnderlying),
      normalizedUnderlying,
    ].filter(Boolean)));

    let symbols: SymbolResult[] = [];
    for (const searchTerm of searchTerms) {
      const result = (await searchSymbols(searchTerm)) as SymbolResult[] | null;
      if (result?.length) {
        symbols = result;
        break;
      }
    }

    if (!symbols || symbols.length === 0) {
      return [];
    }

    const expirySet = new Set<string>();
    const expiryPattern = /(\d{2}[A-Z]{3}\d{2})/;

    symbols.forEach((sym) => {
      const match = sym.symbol?.match(expiryPattern);
      if (match && match[1]) {
        expirySet.add(match[1]);
      }
    });

    const expiries = Array.from(expirySet).sort((a, b) => {
      const dateA = parseExpiryDate(a);
      const dateB = parseExpiryDate(b);
      return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
    });

    logger.debug('[OptionChain] Expiries from symbol search for', underlying, ':', expiries);
    return expiries;
  } catch (error) {
    logger.error('[OptionChain] Error in symbol search fallback:', error);
    return [];
  }
};

/**
 * Get option greeks for a symbol
 */
export const fetchOptionGreeks = async (
  symbol: string,
  exchange: string = 'NFO'
): Promise<unknown> => {
  return await getOptionGreeks(symbol, exchange);
};

/**
 * Get option greeks for multiple symbols in a single batch request
 */
export const fetchMultiOptionGreeks = async (
  symbols: Array<{ symbol: string; exchange?: string | undefined }>,
  options: Record<string, unknown> = {}
): Promise<unknown> => {
  return await getMultiOptionGreeks(symbols, options);
};

/**
 * Combine CE and PE OHLC data into straddle/strangle premium
 */
export const combinePremiumOHLC = (
  ceData: Candle[] | null | undefined,
  peData: Candle[] | null | undefined
): Candle[] => {
  if (!ceData?.length || !peData?.length) return [];

  const peMap = new Map(peData.map((d) => [d.time, d]));

  const combined: Candle[] = [];
  for (const ce of ceData) {
    const pe = peMap.get(ce.time);
    if (pe) {
      combined.push({
        time: ce.time,
        open: ce.open + pe.open,
        high: ce.high + pe.high,
        low: ce.low + pe.low,
        close: ce.close + pe.close,
        volume: (ce.volume || 0) + (pe.volume || 0),
      });
    }
  }

  return combined;
};

/**
 * Combine multiple leg OHLC data into strategy premium
 */
export const combineMultiLegOHLC = (
  legDataArrays: (Candle[] | null | undefined)[],
  legConfigs: LegConfig[]
): Candle[] => {
  if (!legDataArrays?.length || !legConfigs?.length) return [];
  if (legDataArrays.length !== legConfigs.length) {
    logger.warn('[combineMultiLegOHLC] Mismatch between data arrays and configs');
    return [];
  }

  const legMaps = legDataArrays.map(
    (data) => new Map((data || []).map((candle) => [candle.time, candle]))
  );

  const allTimes = new Set<number>();
  legDataArrays.forEach((data) => {
    if (data) data.forEach((d) => allTimes.add(d.time));
  });

  const combined: Candle[] = [];
  const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

  for (const time of sortedTimes) {
    const hasAllLegs = legMaps.every((map) => map.has(time));
    if (!hasAllLegs) continue;

    let open = 0,
      high = 0,
      low = 0,
      close = 0,
      volume = 0;

    legConfigs.forEach((leg, i) => {
      const candle = legMaps[i]!.get(time)!;
      const multiplier = leg.direction === 'buy' ? 1 : -1;
      const qty = leg.quantity || 1;

      open += multiplier * qty * candle.open;
      high += multiplier * qty * candle.high;
      low += multiplier * qty * candle.low;
      close += multiplier * qty * candle.close;
      volume += candle.volume || 0;
    });

    const allPrices = [open, high, low, close];
    const trueHigh = Math.max(...allPrices);
    const trueLow = Math.min(...allPrices);

    combined.push({
      time,
      open,
      high: trueHigh,
      low: trueLow,
      close,
      volume,
    });
  }

  return combined;
};

/**
 * Fetch combined straddle/strangle premium data
 */
export const fetchStraddlePremium = async (
  ceSymbol: string,
  peSymbol: string,
  exchange: string = 'NFO',
  interval: string = '5m',
  signal?: AbortSignal | undefined
): Promise<Candle[]> => {
  try {
    const [ceData, peData] = await Promise.all([
      getKlines(ceSymbol, exchange, interval, 1000, signal),
      getKlines(peSymbol, exchange, interval, 1000, signal),
    ]);

    return combinePremiumOHLC(ceData as Candle[] | null, peData as Candle[] | null);
  } catch (error) {
    const err = error as Error & { name?: string };
    if (err.name !== 'AbortError') {
      logger.error('Error fetching straddle premium:', error);
    }
    return [];
  }
};

/**
 * Format straddle display name
 */
export const formatStraddleName = (config: StraddleConfig | null | undefined): string => {
  if (!config) return '';

  const { underlying, ceStrike, peStrike, expiry } = config;

  let expiryStr: string;
  if (typeof expiry === 'string') {
    expiryStr = expiry;
  } else if (expiry instanceof Date) {
    expiryStr = formatExpiryDate(expiry);
  } else {
    expiryStr = '';
  }

  const day = expiryStr.slice(0, 2);
  const month = expiryStr.slice(2, 5);

  if (ceStrike === peStrike) {
    return `${underlying} ${ceStrike} Straddle (${day} ${month})`;
  } else {
    return `${underlying} ${ceStrike}/${peStrike} Strangle (${day} ${month})`;
  }
};

export default {
  UNDERLYINGS,
  parseExpiryDate,
  formatExpiryDate,
  getDaysToExpiry,
  getExpiryLabel,
  formatExpiryTab,
  getOptionChain,
  getAvailableExpiries,
  fetchOptionGreeks,
  combinePremiumOHLC,
  combineMultiLegOHLC,
  fetchStraddlePremium,
  formatStraddleName,
};
