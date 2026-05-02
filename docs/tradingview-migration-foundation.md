# TradingView Migration Foundation

## Objective

Replace the current lightweight/OpenAlgo chart renderer with TradingView Advanced Charts while preserving the useful app shell and backend data pipeline.

## Phase 1 Decisions

### Keep

- `data-hub` REST and WebSocket feeds
- Existing symbol search, quotes, depth, options, alerts, and account services
- Watchlist, account panel, trading panel, layout shell, storage, and cloud sync concepts

### Replace

- The chart rendering engine
- Historical/live candle binding to the chart engine
- Chart-side drawings and chart persistence integration
- Trade marker and overlay rendering on the chart

### Remove Later

- `lightweight-charts` specific renderer code
- Legacy chart primitives and line tool stack that only apply to the old renderer
- Old chart-specific overlays after TradingView parity is reached

## Phase 2 Foundation Added

- `ChartHost.tsx`
  - Switchable chart host that decides between legacy and TradingView engine.
- `TradingViewChart.tsx`
  - Loads TradingView library assets and acts as the widget integration host.
- `tradingViewConfig.ts`
  - Central config for chart engine selection and `library_path`.

## VPS and Port 7100 Precautions

### Recommended Setup

- Serve the app and TradingView library files from the same VPS origin whenever possible.
- Default `library_path` should remain `/charting_library/`.
- Put TradingView files under `public/charting_library/` so the app can serve them from the same host and port.

### Expected Asset Layout

- `public/charting_library/charting_library.standalone.js`
- `public/charting_library/charting_library/`
- `public/charting_library/bundles/`
- `public/charting_library/static/`

If the main script is missing, the app now shows an in-chart diagnostic card with:

- the active symbol and interval
- the resolved `library_path`
- the exact script URL it tried to load
- the expected asset folders
- deployment notes for same-origin hosting

### Why the old VPS chart likely failed

Most likely causes:

- Static asset origin mismatch
- WebSocket/proxy host mismatch
- App not bound to `0.0.0.0`
- CORS or save/load endpoint restrictions
- Blank chart due to missing hosted library assets

### Production rule

Do not rely on TradingView demo save/load services for production deployments. Use our own backend persistence.

## Next Phase

Implement the TradingView Datafeed API:

- `onReady`
- `searchSymbols`
- `resolveSymbol`
- `getBars`
- `subscribeBars`
- `unsubscribeBars`
