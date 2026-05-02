# TradingView Advanced Chart Status

## Current Situation

TradingView documentation links are available.

Actual Advanced Chart library access has not yet been received.

That means migration work can continue only up to the integration shell and datafeed preparation stage.

## Work Completed

### Foundation

- Added `ChartHost.tsx` to switch between legacy and TradingView chart engines.
- Added `TradingViewChart.tsx` as the TradingView widget host.
- Added `tradingViewConfig.ts` for engine selection and library path control.
- Added `tradingViewDatafeed.ts` with:
  - `onReady`
  - `searchSymbols`
  - `resolveSymbol`
  - `getBars`
  - `subscribeBars`
  - `unsubscribeBars`

### App Wiring

- Added app-level chart engine state.
- Added app-level TradingView library path state.
- Added settings controls for:
  - chart engine
  - TradingView library path

### Validation

- Local app tested on `http://127.0.0.1:7100/`
- TradingView engine switch verified
- Reload persistence verified
- Watchlist symbol sync into TradingView host verified
- Fallback UI for missing TradingView files verified
- Type-check passed
- VPS build now emits `/chart-studio/...` asset paths
- app navigation now opens `/chart-studio` instead of `localhost:7100`

## Work Pending

### Blocker

Actual TradingView Advanced Chart library files are still missing.

Without those files, the real TradingView widget cannot load.

### Next steps after access arrives

1. Place official TradingView files under:
   - `public/charting_library/`
2. Verify real widget rendering on local machine.
3. Verify real widget rendering on VPS.
4. Harden symbol/timeframe/theme sync.
5. Validate historical and live datafeed behavior.
6. Migrate chart overlays:
   - trade markers
   - SL/Target lines
   - alert visuals
7. Continue broker-grade parity work.

## Expected Library Structure

- `public/charting_library/charting_library.standalone.js`
- `public/charting_library/charting_library/`
- `public/charting_library/bundles/`
- `public/charting_library/static/`

## Important Constraint

No trading logic should be changed during this migration unless explicitly requested.

The current work is limited to chart engine integration, UI wiring, datafeed connectivity, and deployment safety.
