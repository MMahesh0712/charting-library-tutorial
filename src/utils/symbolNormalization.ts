/**
 * Symbol Normalization Utility
 *
 * Single source of truth for symbol/exchange identity across:
 * - Chart engine (useChart, workspaceStore)
 * - Watchlist (WatchlistContext, WatchlistSelector)
 * - Alerts (AlertContext, globalAlertMonitor)
 * - Active Markets (autoWatchlistService)
 * - Backend payloads (openalgo API)
 *
 * Problem solved:
 *   useChart.ts uses 'NIFTY 50' / 'NSE'
 *   workspaceStore migration uses 'NIFTY' / 'NSE_INDEX'
 *   Ticker subscriptions, watchlist highlight, alerts can mismatch.
 *
 * Rule: The canonical display form is the Zerodha/broker name.
 *       The canonical exchange is what the backend/openalgo accepts.
 */

import type { Exchange } from '../types/domain/trading';

// ==================== CANONICAL SYMBOL TABLE ====================

export interface SymbolCanonical {
  /** Display name used in UI (watchlist, chart header, alerts) */
  displayName: string;
  /** Exchange string accepted by openalgo REST/WS */
  exchange: Exchange;
  /** All known aliases this symbol appears as */
  aliases: string[];
  /** Underlying alias used in option chain / ATM calculations */
  underlyingAlias: string;
  /** Lot/strike step */
  step: number;
  /** Asset segment */
  segment: 'INDICES' | 'MCX' | 'EQUITY';
}

/**
 * Master table of canonical symbols for the 8 active underlyings + common equities.
 * Add new symbols here — do NOT scatter symbol strings elsewhere in the codebase.
 */
export const SYMBOL_REGISTRY: Record<string, SymbolCanonical> = {
  'NIFTY 50': {
    displayName: 'NIFTY 50',
    exchange: 'NSE',
    aliases: ['NIFTY 50', 'NIFTY', 'NSE:NIFTY 50', 'NSE:NIFTY'],
    underlyingAlias: 'NIFTY',
    step: 50,
    segment: 'INDICES',
  },
  'NIFTY BANK': {
    displayName: 'NIFTY BANK',
    exchange: 'NSE',
    aliases: ['NIFTY BANK', 'BANKNIFTY', 'NIFTYBANK', 'NSE:NIFTY BANK', 'NSE:BANKNIFTY'],
    underlyingAlias: 'BANKNIFTY',
    step: 100,
    segment: 'INDICES',
  },
  'NIFTY FIN SERVICE': {
    displayName: 'NIFTY FIN SERVICE',
    exchange: 'NSE',
    aliases: ['NIFTY FIN SERVICE', 'FINNIFTY', 'NIFTYFIN', 'NSE:NIFTY FIN SERVICE', 'NSE:FINNIFTY'],
    underlyingAlias: 'FINNIFTY',
    step: 50,
    segment: 'INDICES',
  },
  'NIFTY MID SELECT': {
    displayName: 'NIFTY MID SELECT',
    exchange: 'NSE',
    aliases: ['NIFTY MID SELECT', 'MIDCPNIFTY', 'NSE:NIFTY MID SELECT', 'NSE:MIDCPNIFTY'],
    underlyingAlias: 'MIDCPNIFTY',
    step: 25,
    segment: 'INDICES',
  },
  'SENSEX': {
    displayName: 'SENSEX',
    exchange: 'BSE',
    aliases: ['SENSEX', 'BSE SENSEX', 'BSE:SENSEX'],
    underlyingAlias: 'SENSEX',
    step: 100,
    segment: 'INDICES',
  },
  'BANKEX': {
    displayName: 'BANKEX',
    exchange: 'BSE',
    aliases: ['BANKEX', 'BSE:BANKEX'],
    underlyingAlias: 'BANKEX',
    step: 100,
    segment: 'INDICES',
  },
  'CRUDEOIL': {
    displayName: 'CRUDEOIL',
    exchange: 'MCX',
    aliases: ['CRUDEOIL', 'MCX:CRUDEOIL', 'CRUDE OIL'],
    underlyingAlias: 'CRUDEOIL',
    step: 100,
    segment: 'MCX',
  },
  'NATURALGAS': {
    displayName: 'NATURALGAS',
    exchange: 'MCX',
    aliases: ['NATURALGAS', 'MCX:NATURALGAS', 'NATURAL GAS', 'NATGAS'],
    underlyingAlias: 'NATURALGAS',
    step: 25,
    segment: 'MCX',
  },
};

// ==================== ALIAS LOOKUP MAP ====================

/** Fast reverse lookup: alias string → canonical display name */
const ALIAS_TO_CANONICAL: Map<string, string> = new Map();

for (const [canonical, entry] of Object.entries(SYMBOL_REGISTRY)) {
  for (const alias of entry.aliases) {
    ALIAS_TO_CANONICAL.set(alias.toUpperCase(), canonical);
  }
}

// ==================== PUBLIC API ====================

/**
 * Normalize a symbol string to its canonical display name.
 * Returns the input unchanged if not found in the registry.
 *
 * @example
 *   normalizeSymbol('BANKNIFTY')   // → 'NIFTY BANK'
 *   normalizeSymbol('NIFTY')       // → 'NIFTY 50'
 *   normalizeSymbol('INFY')        // → 'INFY'  (not in registry, pass-through)
 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol) return symbol;
  const upper = symbol.toUpperCase();
  return ALIAS_TO_CANONICAL.get(upper) ?? symbol;
}

/**
 * Get canonical exchange for a symbol.
 * Returns the provided fallback exchange if symbol not found in registry.
 *
 * @example
 *   getCanonicalExchange('BANKNIFTY', 'NSE')     // → 'NSE'
 *   getCanonicalExchange('CRUDEOIL', 'MCX')      // → 'MCX'
 *   getCanonicalExchange('INFY', 'NSE')           // → 'NSE'  (pass-through)
 */
export function getCanonicalExchange(symbol: string, fallbackExchange: string = 'NSE'): string {
  const canonical = normalizeSymbol(symbol);
  return SYMBOL_REGISTRY[canonical]?.exchange ?? fallbackExchange;
}

/**
 * Normalize both symbol and exchange together.
 * Use this when building a chart subscription or alert key.
 *
 * @example
 *   normalizeSymbolExchange('BANKNIFTY', 'NSE')
 *   // → { symbol: 'NIFTY BANK', exchange: 'NSE' }
 *
 *   normalizeSymbolExchange('NIFTY', 'NSE_INDEX')
 *   // → { symbol: 'NIFTY 50', exchange: 'NSE' }
 */
export function normalizeSymbolExchange(
  symbol: string,
  exchange: string = 'NSE'
): { symbol: string; exchange: Exchange } {
  const normalizedSymbol = normalizeSymbol(symbol);
  const canonicalExchange = (SYMBOL_REGISTRY[normalizedSymbol]?.exchange ?? exchange) as Exchange;
  return { symbol: normalizedSymbol, exchange: canonicalExchange };
}

/**
 * Get the underlying alias used in option chain lookups (e.g. ATM calc).
 * Returns the symbol itself if not found in registry.
 *
 * @example
 *   getUnderlyingAlias('NIFTY 50')    // → 'NIFTY'
 *   getUnderlyingAlias('NIFTY BANK')  // → 'BANKNIFTY'
 */
export function getUnderlyingAlias(symbol: string): string {
  const canonical = normalizeSymbol(symbol);
  return SYMBOL_REGISTRY[canonical]?.underlyingAlias ?? canonical;
}

/**
 * Check whether two symbol strings refer to the same canonical symbol.
 *
 * @example
 *   isSameSymbol('NIFTY', 'NIFTY 50')     // → true
 *   isSameSymbol('BANKNIFTY', 'NIFTY BANK') // → true
 *   isSameSymbol('INFY', 'RELIANCE')        // → false
 */
export function isSameSymbol(a: string, b: string): boolean {
  return normalizeSymbol(a) === normalizeSymbol(b);
}

/**
 * Build a stable subscription/alert key that is immune to alias mismatches.
 *
 * @example
 *   buildSymbolKey('NIFTY', 'NSE_INDEX')    // → 'NIFTY 50:NSE'
 *   buildSymbolKey('BANKNIFTY', 'NSE')       // → 'NIFTY BANK:NSE'
 */
export function buildSymbolKey(symbol: string, exchange: string): string {
  const { symbol: s, exchange: e } = normalizeSymbolExchange(symbol, exchange);
  return `${s}:${e}`;
}

/**
 * List all canonical symbols in the registry.
 */
export function listCanonicalSymbols(): string[] {
  return Object.keys(SYMBOL_REGISTRY);
}

/**
 * Get full registry entry for a symbol (by any alias).
 * Returns undefined if not found.
 */
export function getSymbolInfo(symbol: string): SymbolCanonical | undefined {
  const canonical = normalizeSymbol(symbol);
  return SYMBOL_REGISTRY[canonical];
}

/**
 * Resolve the signal-index key for any symbol.
 * Works for both index names and option tradingsymbols.
 *
 * For index symbols: returns underlyingAlias (e.g. 'NIFTY 50' -> 'NIFTY').
 * For option symbols: strips suffix and matches underlyingAlias
 *   (e.g. 'NIFTY26APR24000CE' -> 'NIFTY').
 * Fallback: returns uppercased input.
 *
 * Used in ChartComponent to route option chart symbols to the correct signal bucket.
 */
export function getSignalIndex(symbol: string): string {
  if (!symbol) return symbol;
  const upper = symbol.toUpperCase();

  // Fast path: known alias (index name)
  const viaAlias = getUnderlyingAlias(upper);
  if (viaAlias !== upper) return viaAlias;

  // Option tradingsymbol: prefix-match against underlyingAliases (longest first)
  const aliases = Object.values(SYMBOL_REGISTRY)
    .map(e => e.underlyingAlias)
    .sort((a, b) => b.length - a.length);

  for (const alias of aliases) {
    if (upper.startsWith(alias)) return alias;
  }

  return upper;
}
