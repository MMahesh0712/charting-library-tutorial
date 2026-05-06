import { getString, STORAGE_KEYS } from './storageService';

export type ChartEngine = 'legacy' | 'tradingview';

const DEFAULT_ENGINE: ChartEngine = 'tradingview';
const APP_BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL || '/');
const DEFAULT_LIBRARY_PATH = `${APP_BASE_PATH}charting_library/`;

function normalizeBasePath(value: string): string {
  if (!value || value === '/') return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function getChartEngine(): ChartEngine {
  const raw = getString(STORAGE_KEYS.CHART_ENGINE, DEFAULT_ENGINE).trim().toLowerCase();
  return raw === 'tradingview' ? 'tradingview' : 'legacy';
}

export function isTradingViewEnabled(): boolean {
  return getChartEngine() === 'tradingview';
}

export function getTradingViewLibraryPath(): string {
  const configured = getString(STORAGE_KEYS.TV_LIBRARY_PATH, DEFAULT_LIBRARY_PATH).trim();
  return normalizeTradingViewLibraryPath(configured);
}

export function normalizeTradingViewLibraryPath(configured?: string): string {
  if (!configured) return DEFAULT_LIBRARY_PATH;

  return configured.endsWith('/') ? configured : `${configured}/`;
}

export function getTradingViewScriptUrl(libraryPath = getTradingViewLibraryPath()): string {
  return `${normalizeTradingViewLibraryPath(libraryPath)}charting_library.standalone.js`;
}

export function getTradingViewBuildNotes(): string[] {
  return [
    'Host charting library assets on the same VPS origin when possible.',
    'If assets are cross-origin, configure library_path with an absolute URL and enable CORS.',
    'Do not use the TradingView demo save/load server in production; use your own backend.',
  ];
}

export function getTradingViewExpectedAssets(libraryPath = getTradingViewLibraryPath()): string[] {
  const normalized = normalizeTradingViewLibraryPath(libraryPath);
  return [
    `${normalized}charting_library.standalone.js`,
    `${normalized}bundles/`,
    `${normalized}sameorigin.html`,
  ];
}

export default {
  getChartEngine,
  isTradingViewEnabled,
  getTradingViewLibraryPath,
  getTradingViewScriptUrl,
  getTradingViewBuildNotes,
  getTradingViewExpectedAssets,
  normalizeTradingViewLibraryPath,
};
