/**
 * Symbol Search Constants
 * Filter tabs and default symbols
 */

export interface FilterTab {
    id: string;
    label: string;
    exchange: string | null;
    instrumenttype: string | null;
}

export interface PopularSymbol {
    symbol: string;
    exchange: string;
    instrumenttype: string;
    name: string;
}

// Filter tabs with their corresponding API parameters
export const FILTER_TABS: FilterTab[] = [
    { id: 'all', label: 'All', exchange: null, instrumenttype: null },
    { id: 'stocks', label: 'Stocks', exchange: 'NSE', instrumenttype: 'EQ' },
    { id: 'futures', label: 'Futures', exchange: null, instrumenttype: 'Futures' },
    { id: 'options', label: 'Options', exchange: null, instrumenttype: 'Options' },
    { id: 'indices', label: 'Indices', exchange: null, instrumenttype: 'Indices' },
    { id: 'mcx', label: 'MCX', exchange: 'MCX', instrumenttype: null },
];

// Default popular symbols shown on initial load (exact Zerodha CSV tradingsymbols)
export const DEFAULT_POPULAR_SYMBOLS: PopularSymbol[] = [
    // 8 Trading Indices
    { symbol: 'NIFTY 50', exchange: 'NSE', instrumenttype: 'INDEX', name: 'Nifty 50 Index' },
    { symbol: 'NIFTY BANK', exchange: 'NSE', instrumenttype: 'INDEX', name: 'Nifty Bank Index' },
    { symbol: 'NIFTY FIN SERVICE', exchange: 'NSE', instrumenttype: 'INDEX', name: 'Nifty Financial Services' },
    { symbol: 'NIFTY MID SELECT', exchange: 'NSE', instrumenttype: 'INDEX', name: 'Nifty MidCap Select' },
    { symbol: 'SENSEX', exchange: 'BSE', instrumenttype: 'INDEX', name: 'BSE Sensex' },
    { symbol: 'BANKEX', exchange: 'BSE', instrumenttype: 'INDEX', name: 'BSE Bankex' },
    // Top Stocks
    { symbol: 'RELIANCE', exchange: 'NSE', instrumenttype: 'EQ', name: 'Reliance Industries Ltd' },
    { symbol: 'TCS', exchange: 'NSE', instrumenttype: 'EQ', name: 'Tata Consultancy Services' },
    { symbol: 'INFY', exchange: 'NSE', instrumenttype: 'EQ', name: 'Infosys Ltd' },
    { symbol: 'HDFCBANK', exchange: 'NSE', instrumenttype: 'EQ', name: 'HDFC Bank Ltd' },
];

// Search debounce delay in milliseconds
export const SEARCH_DEBOUNCE_MS = 300;

// Minimum characters before search triggers
export const MIN_SEARCH_LENGTH = 2;

// Maximum results to display
export const MAX_RESULTS = 50;

export default {
    FILTER_TABS,
    DEFAULT_POPULAR_SYMBOLS,
    SEARCH_DEBOUNCE_MS,
    MIN_SEARCH_LENGTH,
    MAX_RESULTS,
};
