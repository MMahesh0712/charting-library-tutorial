import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  getTradingViewBuildNotes,
  getTradingViewExpectedAssets,
  getTradingViewLibraryPath,
  getTradingViewScriptUrl,
  normalizeTradingViewLibraryPath,
} from '../../services/tradingViewConfig';
import { createTradingViewDatafeed } from '../../services/tradingViewDatafeed';

interface TradingViewChartProps {
  symbol?: string;
  exchange?: string;
  interval?: string;
  theme?: string;
  chartId?: string;
  libraryPath?: string;
}

interface TradingViewWindow extends Window {
  TradingView?: {
    widget: new (options: Record<string, unknown>) => TradingViewWidgetInstance;
  };
}

interface TradingViewWidgetInstance {
  remove?: () => void;
  onChartReady?: (cb: () => void) => void;
}

const DEFAULT_STATUS =
  'TradingView integration foundation is ready. Library files and datafeed will be connected in the next phase.';
const TV_LOCALE = 'en';

function normalizeInterval(interval?: string): string {
  if (!interval) return '5';

  const map: Record<string, string> = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '10m': '10',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '60m': '60',
    '1d': '1D',
    D: '1D',
    W: '1W',
    M: '1M',
  };

  return map[interval] || interval;
}

async function ensureTradingViewScript(scriptUrl: string): Promise<void> {
  const win = window as TradingViewWindow;
  if (win.TradingView?.widget) return;

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-tradingview-library="advanced-charts"]'
  );

  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if ((window as TradingViewWindow).TradingView?.widget) {
        resolve();
        return;
      }

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load TradingView library script.')), {
        once: true,
      });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.dataset.tradingviewLibrary = 'advanced-charts';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load TradingView library script.'));
    document.head.appendChild(script);
  });
}

const TradingViewChart = forwardRef<any, TradingViewChartProps>(function TradingViewChart(
  {
    symbol = 'NIFTY',
    exchange = 'NSE_INDEX',
    interval = '5m',
    theme = 'dark',
    chartId,
    libraryPath: configuredLibraryPath,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetContainerId = `tv_chart_container_${chartId || 'default'}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const widgetRef = useRef<TradingViewWidgetInstance | null>(null);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [isReady, setIsReady] = useState(false);

  const libraryPath = normalizeTradingViewLibraryPath(configuredLibraryPath || getTradingViewLibraryPath());
  const scriptUrl = getTradingViewScriptUrl(libraryPath);
  const tvInterval = normalizeInterval(interval);
  const expectedAssets = getTradingViewExpectedAssets(libraryPath);
  const buildNotes = getTradingViewBuildNotes();

  useImperativeHandle(ref, () => ({
    engine: 'tradingview',
    isReady,
    remove: () => {
      widgetRef.current?.remove?.();
      widgetRef.current = null;
    },
  }), [isReady]);

  useEffect(() => {
    let isDisposed = false;

    async function init() {
      if (!containerRef.current) return;

      try {
        setStatus(`Loading TradingView assets from ${libraryPath}`);
        await ensureTradingViewScript(scriptUrl);

        const win = window as TradingViewWindow;
        if (!win.TradingView?.widget) {
          throw new Error('TradingView widget constructor is not available after script load.');
        }

        setStatus('TradingView assets loaded. Initializing widget...');

        if (isDisposed) return;

        widgetRef.current?.remove?.();
        widgetRef.current = new win.TradingView.widget({
          container: widgetContainerId,
          library_path: libraryPath,
          datafeed: createTradingViewDatafeed(),
          symbol,
          interval: tvInterval,
          locale: TV_LOCALE,
          timezone: 'Asia/Kolkata',
          autosize: true,
          theme: theme === 'light' ? 'light' : 'dark',
          disabled_features: [
            'use_localstorage_for_settings',
          ],
        });

        widgetRef.current.onChartReady?.(() => {
          if (isDisposed) return;
          setStatus('TradingView chart is ready.');
        });

        setIsReady(true);
      } catch (error) {
        setIsReady(false);
        setStatus((error as Error).message);
      }
    }

    init();

    return () => {
      isDisposed = true;
      widgetRef.current?.remove?.();
      widgetRef.current = null;
      setIsReady(false);
    };
  }, [libraryPath, scriptUrl, symbol, exchange, tvInterval, theme, chartId, widgetContainerId]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: theme === 'light' ? '#f5f7fb' : '#131722',
        color: theme === 'light' ? '#111827' : '#e5e7eb',
        overflow: 'hidden',
      }}
    >
      <div
        id={widgetContainerId}
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
      />
      {!isReady && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              maxWidth: '640px',
              borderRadius: '14px',
              border: `1px solid ${theme === 'light' ? '#dbe2ea' : '#2a2e39'}`,
              background: theme === 'light' ? '#ffffff' : '#191d28',
              boxShadow:
                theme === 'light'
                  ? '0 16px 40px rgba(15, 23, 42, 0.08)'
                  : '0 16px 40px rgba(0, 0, 0, 0.28)',
              padding: '24px 28px',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>
              TradingView Chart Loading
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.7, opacity: 0.9, marginBottom: '14px' }}>
              {status}
            </div>
            <div style={{ fontSize: '12px', lineHeight: 1.7, opacity: 0.8 }}>
              <div><strong>Symbol:</strong> {symbol}</div>
              <div><strong>Exchange:</strong> {exchange}</div>
              <div><strong>Interval:</strong> {tvInterval}</div>
              <div><strong>Library path:</strong> {libraryPath}</div>
              <div><strong>Script URL:</strong> {scriptUrl}</div>
            </div>
            <div style={{ marginTop: '16px', fontSize: '12px', lineHeight: 1.7, opacity: 0.82 }}>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>Expected Assets</div>
              {expectedAssets.map((asset) => (
                <div key={asset}>{asset}</div>
              ))}
            </div>
            <div style={{ marginTop: '16px', fontSize: '12px', lineHeight: 1.7, opacity: 0.78 }}>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>Deployment Notes</div>
              {buildNotes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default TradingViewChart;
