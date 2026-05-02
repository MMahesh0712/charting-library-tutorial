/**
 * API Configuration Service
 * URL configuration and utilities for OpenAlgo API
 */

import { getString, STORAGE_KEYS } from '../storageService';
import logger from '@/utils/logger';

const DEFAULT_HOST = 'http://127.0.0.1:8000';
const DEFAULT_WS_HOST = '127.0.0.1:8000';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const APP_BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL || '/');

function normalizeBasePath(value: string): string {
  if (!value || value === '/') return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function buildAppScopedPath(relativePath: string): string {
  const clean = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  if (APP_BASE_PATH === '/') {
    return `/${clean}`;
  }
  return `${APP_BASE_PATH}${clean}`;
}

const APP_SCOPED_API_BASE = buildAppScopedPath('api/v1');
const APP_SCOPED_WS_PATH = buildAppScopedPath('ws');

const isBrowser = (): boolean => typeof window !== 'undefined';

const isLoopbackHostname = (hostname: string): boolean =>
  LOOPBACK_HOSTS.has(hostname.toLowerCase());

const getPageHostname = (): string => {
  if (!isBrowser()) return '';
  return window.location.hostname.toLowerCase();
};

const extractHostname = (value: string): string => {
  try {
    if (
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('ws://') ||
      value.startsWith('wss://')
    ) {
      return new URL(value).hostname.toLowerCase();
    }
  } catch {
    // Fall back to manual parsing below.
  }

  return value.split('/')[0].split(':')[0].toLowerCase();
};

const isLoopbackTarget = (value: string): boolean => {
  if (!value) return false;
  return isLoopbackHostname(extractHostname(value));
};

const normalizeOrigin = (value: string): string => {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
};

export const getDefaultHostUrl = (): string => {
  if (isBrowser() && !isLoopbackHostname(getPageHostname())) {
    return window.location.origin;
  }
  return DEFAULT_HOST;
};

export const getDefaultWebSocketHost = (): string => {
  if (isBrowser() && !isLoopbackHostname(getPageHostname())) {
    return window.location.host;
  }
  return DEFAULT_WS_HOST;
};

export const getHostUrl = (): string => {
  return getString(STORAGE_KEYS.OA_HOST_URL, getDefaultHostUrl());
};

/**
 * When the configured host is loopback or matches the current site,
 * prefer app-scoped proxy paths. This keeps VPS deployment under /chart-studio working
 * without interfering with terminal APIs mounted at the domain root.
 */
export const shouldUseProxy = (): boolean => {
  const hostUrl = getHostUrl();
  if (isLoopbackTarget(hostUrl)) return true;
  if (isBrowser()) {
    return normalizeOrigin(hostUrl) === window.location.origin;
  }
  return false;
};

export const getApiBase = (): string => {
  if (shouldUseProxy()) {
    return APP_SCOPED_API_BASE;
  }
  return `${getHostUrl()}/api/v1`;
};

export const getLoginUrl = (): string => {
  if (shouldUseProxy()) {
    return '/';
  }
  return `${getHostUrl()}/auth/login`;
};

export const getWebSocketUrl = (): string => {
  const wsHost = getString(STORAGE_KEYS.OA_WS_URL, getDefaultWebSocketHost());

  if (shouldUseProxy() && isBrowser()) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}${APP_SCOPED_WS_PATH}`;
  }

  if (wsHost.startsWith('wss://') || wsHost.startsWith('ws://')) {
    return wsHost;
  }

  const isSecure =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  const protocol = isSecure ? 'wss' : 'ws';
  return `${protocol}://${wsHost}`;
};

export const checkAuth = async (): Promise<boolean> => {
  try {
    const apiKey = getString(STORAGE_KEYS.OA_API_KEY, '');
    if (!apiKey || apiKey.trim() === '') {
      try {
        localStorage.setItem(STORAGE_KEYS.OA_API_KEY, 'pratham-dhan-direct');
        logger.info('[ApiConfig] Auto-set placeholder API key for Pratham Dhan Data Hub');
      } catch (e) {
        logger.warn('[ApiConfig] Could not set API key in localStorage:', e);
      }
    }

    return true;
  } catch (error) {
    logger.error('[ApiConfig] Auth check failed:', error);
    return true;
  }
};

export const getApiKey = (): string => {
  return getString(STORAGE_KEYS.OA_API_KEY, 'pratham-dhan-direct');
};

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

export { APP_BASE_PATH, APP_SCOPED_API_BASE, APP_SCOPED_WS_PATH, DEFAULT_HOST, DEFAULT_WS_HOST };
