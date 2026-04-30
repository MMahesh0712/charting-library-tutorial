/**
 * symbolNormalization.test.ts
 * Unit tests for the canonical symbol / exchange normalization utility.
 * TSK-CS-032
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSymbol,
  normalizeSymbolExchange,
  isSameSymbol,
  buildSymbolKey,
  getCanonicalExchange,
  getUnderlyingAlias,
  getSymbolInfo,
  listCanonicalSymbols,
} from './symbolNormalization';

// ── normalizeSymbol ──────────────────────────────────────────────────────────

describe('normalizeSymbol', () => {
  it('resolves common NIFTY aliases to canonical form', () => {
    expect(normalizeSymbol('NIFTY')).toBe('NIFTY 50');
    expect(normalizeSymbol('NIFTY 50')).toBe('NIFTY 50');
    expect(normalizeSymbol('NSE:NIFTY')).toBe('NIFTY 50');
    expect(normalizeSymbol('NSE:NIFTY 50')).toBe('NIFTY 50');
  });

  it('resolves BANKNIFTY aliases to NIFTY BANK', () => {
    expect(normalizeSymbol('BANKNIFTY')).toBe('NIFTY BANK');
    expect(normalizeSymbol('NIFTYBANK')).toBe('NIFTY BANK');
    expect(normalizeSymbol('NSE:BANKNIFTY')).toBe('NIFTY BANK');
  });

  it('resolves FINNIFTY aliases to NIFTY FIN SERVICE', () => {
    expect(normalizeSymbol('FINNIFTY')).toBe('NIFTY FIN SERVICE');
    expect(normalizeSymbol('NIFTYFIN')).toBe('NIFTY FIN SERVICE');
  });

  it('resolves MIDCPNIFTY aliases to NIFTY MID SELECT', () => {
    expect(normalizeSymbol('MIDCPNIFTY')).toBe('NIFTY MID SELECT');
  });

  it('resolves SENSEX / BSE aliases', () => {
    expect(normalizeSymbol('BSE SENSEX')).toBe('SENSEX');
    expect(normalizeSymbol('BSE:SENSEX')).toBe('SENSEX');
  });

  it('resolves MCX CRUDEOIL aliases', () => {
    expect(normalizeSymbol('CRUDE OIL')).toBe('CRUDEOIL');
    expect(normalizeSymbol('MCX:CRUDEOIL')).toBe('CRUDEOIL');
  });

  it('resolves NATURALGAS aliases', () => {
    expect(normalizeSymbol('NATURAL GAS')).toBe('NATURALGAS');
    expect(normalizeSymbol('NATGAS')).toBe('NATURALGAS');
  });

  it('is case-insensitive', () => {
    expect(normalizeSymbol('banknifty')).toBe('NIFTY BANK');
    expect(normalizeSymbol('nifty')).toBe('NIFTY 50');
    expect(normalizeSymbol('Nifty')).toBe('NIFTY 50');
  });

  it('passes through unknown symbols unchanged', () => {
    expect(normalizeSymbol('INFY')).toBe('INFY');
    expect(normalizeSymbol('RELIANCE')).toBe('RELIANCE');
    expect(normalizeSymbol('TCS')).toBe('TCS');
  });

  it('handles empty string safely', () => {
    expect(normalizeSymbol('')).toBe('');
  });
});

// ── getCanonicalExchange ─────────────────────────────────────────────────────

describe('getCanonicalExchange', () => {
  it('returns NSE for NIFTY symbols', () => {
    expect(getCanonicalExchange('NIFTY 50')).toBe('NSE');
    expect(getCanonicalExchange('NIFTY BANK')).toBe('NSE');
    expect(getCanonicalExchange('BANKNIFTY', 'NSE')).toBe('NSE');
  });

  it('returns BSE for SENSEX / BANKEX', () => {
    expect(getCanonicalExchange('SENSEX')).toBe('BSE');
    expect(getCanonicalExchange('BANKEX')).toBe('BSE');
  });

  it('returns MCX for commodity symbols', () => {
    expect(getCanonicalExchange('CRUDEOIL')).toBe('MCX');
    expect(getCanonicalExchange('NATURALGAS')).toBe('MCX');
  });

  it('returns provided fallback for unknown symbols', () => {
    expect(getCanonicalExchange('INFY', 'NSE')).toBe('NSE');
    expect(getCanonicalExchange('UNKNOWN', 'BSE')).toBe('BSE');
  });

  it('resolves alias before returning exchange', () => {
    // BANKNIFTY alias → NIFTY BANK → NSE
    expect(getCanonicalExchange('BANKNIFTY', 'NSE_INDEX')).toBe('NSE');
  });
});

// ── normalizeSymbolExchange ──────────────────────────────────────────────────

describe('normalizeSymbolExchange', () => {
  it('normalizes both symbol and exchange together', () => {
    expect(normalizeSymbolExchange('BANKNIFTY', 'NSE')).toEqual({
      symbol: 'NIFTY BANK',
      exchange: 'NSE',
    });
  });

  it('overrides a wrong exchange if registry knows the correct one', () => {
    // SENSEX is BSE — even if caller passes NSE
    expect(normalizeSymbolExchange('SENSEX', 'NSE')).toEqual({
      symbol: 'SENSEX',
      exchange: 'BSE',
    });
  });

  it('uses fallback exchange for unknown symbols', () => {
    const result = normalizeSymbolExchange('INFY', 'NSE');
    expect(result).toEqual({ symbol: 'INFY', exchange: 'NSE' });
  });

  it('handles NSE_INDEX → NSE correction via alias resolution', () => {
    // 'NIFTY' alias resolves to 'NIFTY 50', registry exchange is 'NSE'
    const result = normalizeSymbolExchange('NIFTY', 'NSE_INDEX');
    expect(result.symbol).toBe('NIFTY 50');
    expect(result.exchange).toBe('NSE');
  });
});

// ── isSameSymbol ─────────────────────────────────────────────────────────────

describe('isSameSymbol', () => {
  it('returns true for aliases of the same canonical symbol', () => {
    expect(isSameSymbol('NIFTY', 'NIFTY 50')).toBe(true);
    expect(isSameSymbol('BANKNIFTY', 'NIFTY BANK')).toBe(true);
    expect(isSameSymbol('FINNIFTY', 'NIFTY FIN SERVICE')).toBe(true);
    expect(isSameSymbol('CRUDE OIL', 'CRUDEOIL')).toBe(true);
  });

  it('returns true for identical canonical symbols', () => {
    expect(isSameSymbol('NIFTY 50', 'NIFTY 50')).toBe(true);
    expect(isSameSymbol('INFY', 'INFY')).toBe(true);
  });

  it('returns false for different symbols', () => {
    expect(isSameSymbol('NIFTY 50', 'NIFTY BANK')).toBe(false);
    expect(isSameSymbol('INFY', 'RELIANCE')).toBe(false);
  });

  it('is case-insensitive via normalizeSymbol', () => {
    expect(isSameSymbol('banknifty', 'NIFTY BANK')).toBe(true);
    expect(isSameSymbol('nifty', 'NIFTY 50')).toBe(true);
  });
});

// ── buildSymbolKey ───────────────────────────────────────────────────────────

describe('buildSymbolKey', () => {
  it('produces a stable key regardless of alias', () => {
    expect(buildSymbolKey('NIFTY', 'NSE_INDEX')).toBe('NIFTY 50:NSE');
    expect(buildSymbolKey('NIFTY 50', 'NSE')).toBe('NIFTY 50:NSE');
    expect(buildSymbolKey('BANKNIFTY', 'NSE')).toBe('NIFTY BANK:NSE');
  });

  it('uses correct exchange from registry even if wrong one is passed', () => {
    expect(buildSymbolKey('SENSEX', 'NSE')).toBe('SENSEX:BSE');
    expect(buildSymbolKey('CRUDEOIL', 'NSE')).toBe('CRUDEOIL:MCX');
  });

  it('passes through unknown symbols with provided exchange', () => {
    expect(buildSymbolKey('INFY', 'NSE')).toBe('INFY:NSE');
  });
});

// ── getUnderlyingAlias ───────────────────────────────────────────────────────

describe('getUnderlyingAlias', () => {
  it('returns correct underlying alias for index symbols', () => {
    expect(getUnderlyingAlias('NIFTY 50')).toBe('NIFTY');
    expect(getUnderlyingAlias('NIFTY BANK')).toBe('BANKNIFTY');
    expect(getUnderlyingAlias('NIFTY FIN SERVICE')).toBe('FINNIFTY');
    expect(getUnderlyingAlias('NIFTY MID SELECT')).toBe('MIDCPNIFTY');
  });

  it('resolves alias before looking up underlying', () => {
    expect(getUnderlyingAlias('BANKNIFTY')).toBe('BANKNIFTY');
    expect(getUnderlyingAlias('FINNIFTY')).toBe('FINNIFTY');
  });

  it('returns the symbol itself for unknown symbols', () => {
    expect(getUnderlyingAlias('INFY')).toBe('INFY');
  });
});

// ── getSymbolInfo ────────────────────────────────────────────────────────────

describe('getSymbolInfo', () => {
  it('returns full registry entry for canonical symbols', () => {
    const info = getSymbolInfo('NIFTY 50');
    expect(info).toBeDefined();
    expect(info?.displayName).toBe('NIFTY 50');
    expect(info?.exchange).toBe('NSE');
    expect(info?.segment).toBe('INDICES');
    expect(info?.step).toBe(50);
  });

  it('resolves aliases before looking up info', () => {
    const info = getSymbolInfo('BANKNIFTY');
    expect(info?.displayName).toBe('NIFTY BANK');
    expect(info?.exchange).toBe('NSE');
    expect(info?.step).toBe(100);
  });

  it('returns undefined for unknown symbols', () => {
    expect(getSymbolInfo('INFY')).toBeUndefined();
    expect(getSymbolInfo('UNKNOWN_XYZ')).toBeUndefined();
  });

  it('returns correct segment for MCX symbols', () => {
    const info = getSymbolInfo('CRUDEOIL');
    expect(info?.segment).toBe('MCX');
    expect(info?.exchange).toBe('MCX');
  });
});

// ── listCanonicalSymbols ─────────────────────────────────────────────────────

describe('listCanonicalSymbols', () => {
  it('includes all 8 registered underlyings', () => {
    const symbols = listCanonicalSymbols();
    expect(symbols).toContain('NIFTY 50');
    expect(symbols).toContain('NIFTY BANK');
    expect(symbols).toContain('NIFTY FIN SERVICE');
    expect(symbols).toContain('NIFTY MID SELECT');
    expect(symbols).toContain('SENSEX');
    expect(symbols).toContain('BANKEX');
    expect(symbols).toContain('CRUDEOIL');
    expect(symbols).toContain('NATURALGAS');
  });

  it('returns an array', () => {
    expect(Array.isArray(listCanonicalSymbols())).toBe(true);
  });
});
