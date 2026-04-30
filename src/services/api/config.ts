/**
 * API Configuration Service
 * URL configuration and utilities for OpenAlgo API
 */

import { getString, STORAGE_KEYS } from '../storageService';
import logger from '@/utils/logger';

// Pratham Dhan Data Hub — serves all chart data at port 8000
const DEFAULT_HOST = 'http://127.0.0.1:8000';
// WebSocket served at same port as HTTP
const DEFAULT_WS_HOST = '127.0.0.1:8000';

/**
 * Get Host URL from localStorage settings or use default
 */
export const getHostUrl = (): string => {
  return getString(STORAGE_KEYS.OA_HOST_URL, DEFAULT_HOST);
};

/**
 * Check if we should use the Vite proxy (when using default localhost settings)
 * This avoids CORS issues during development
 */
export const shouldUseProxy = (): boolean => {
  const hostUrl = getHostUrl();
  const isDefaultHost =
    hostUrl === DEFAULT_HOST ||
    hostUrl === 'http://localhost:8000' ||
    hostUrl === 'http://127.0.0.1:8000' ||
    // Legacy OpenAlgo defaults
    hostUrl === 'http://localhost:5000' ||
    hostUrl === 'http://127.0.0.1:5000';
  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');
  return isDefaultHost && isLocalDev;
};

/**
 * Get API Base URL
 * Returns relative path for proxy when in dev mode with default host
 * Returns full URL when using custom host
 */
export const getApiBase = (): string => {
  if (shouldUseProxy()) {
    return '/api/v1';
  }
  return `${getHostUrl()}/api/v1`;
};

/**
 * Get Login URL
 */
export const getLoginUrl = (): string => {
  return `${getHostUrl()}/auth/login`;
};

/**
 * Get WebSocket URL from localStorage settings or use default
 * Auto-detects protocol (ws/wss) based on page protocol
 * Uses Vite proxy in development for localhost
 */
export const getWebSocketUrl = (): string => {
  const wsHost = getString(STORAGE_KEYS.OA_WS_URL, DEFAULT_WS_HOST);

  const isDefaultWsHost =
    wsHost === DEFAULT_WS_HOST ||
    wsHost === '127.0.0.1:8000' ||
    wsHost === 'localhost:8000' ||
    // Legacy OpenAlgo defaults
    wsHost === '127.0.0.1:8765' ||
    wsHost === 'localhost:8765';
  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  if (isDefaultWsHost && isLocalDev) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws`;
  }

  if (wsHost.startsWith('wss://') || wsHost.startsWith('ws://')) {
    return wsHost;
  }

  const isSecure =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  const protocol = isSecure ? 'wss' : 'ws';
  return `${protocol}://${wsHost}`;
};

/**
 * Check if user is authenticated.
 * Pratham Dhan Chart Studio uses data-hub (port 8000) directly — no OpenAlgo API key required.
 * We auto-inject a placeholder key so SharedWebSocket and other services don't bail early.
 */
export const checkAuth = async (): Promise<boolean> => {
  try {
    // Auto-inject a placeholder API key if none is set.
    // data-hub does not validate API keys — it accepts all requests.
    const apiKey = getString(STORAGE_KEYS.OA_API_KEY, '');
    if (!apiKey || apiKey.trim() === '') {
      // Set a placeholder key so all service calls proceed normally
      try {
        localStorage.setItem(STORAGE_KEYS.OA_API_KEY, 'pratham-dhan-direct');
        logger.info('[ApiConfig] Auto-set placeholder API key for Pratham Dhan Data Hub');
      } catch (e) {
        logger.warn('[ApiConfig] Could not set API key in localStorage:', e);
      }
    }
    // Always authenticated — Pratham Dhan uses direct Zerodha/data-hub integration
    return true;
  } catch (error) {
    logger.error('[ApiConfig] Auth check failed:', error);
    return true; // Still allow rendering even if localStorage check fails
  }
};

/**
 * Get API key from localStorage.
 * Returns placeholder key for Pratham Dhan's data-hub which doesn't validate keys.
 */
export const getApiKey = (): string => {
  return getString(STORAGE_KEYS.OA_API_KEY, 'pratham-dhan-direct');
};

/**
 * Convert chart interval to OpenAlgo API format
 */
export const convertInterval = (interval: string): string => {
  const mapping: Record<string, string> = {
    '1d': 'D',
    '1w': 'W',
    '1M': 'M',
    D: 'D',
    W: 'W',
    M: 'M',
  };
  return mapping[interval] ?? interval;
};

export { DEFAULT_HOST, DEFAULT_WS_HOST };
