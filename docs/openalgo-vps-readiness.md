# Current Chart VPS Readiness

## Goal

Keep the existing OpenAlgo/Data Hub based chart usable on a VPS without changing trading logic.

## Root Cause Identified

The chart was vulnerable to VPS deployment issues because several defaults assumed `localhost` or `127.0.0.1`.

That is safe only when the browser and data services run on the same machine.

On a VPS, the browser runs on the viewer's machine, so a hardcoded loopback target can fail in two ways:

- the browser tries to call its own local machine instead of the VPS
- WebSocket connections try to reach the wrong host

## Safe Changes Applied

### 1. VPS-safe API defaults

Updated:

- `src/services/api/config.ts`

Behavior now:

- local development still defaults to `127.0.0.1:8000`
- remote VPS access now defaults to the current page origin
- loopback API targets are automatically routed through app-origin paths like `/api/v1`
- loopback WebSocket targets are automatically routed through app-origin `/ws`

This means a remote browser no longer tries to hit its own localhost if the stored config is still loopback based.

### 2. VPS-safe UI defaults

Updated:

- `src/components/ApiKeyDialog/ApiKeyDialog.tsx`
- `src/components/Settings/SettingsPopup.tsx`
- `src/components/Settings/sections/OpenAlgoSection.tsx`
- `src/App.tsx`

Behavior now:

- host and WebSocket defaults follow the current environment
- on VPS, the settings UI now suggests the page origin instead of old localhost values

### 3. Configurable local proxy targets

Updated:

- `vite.config.ts`

New optional environment variables:

- `VITE_DATA_HUB_HTTP_TARGET`
- `VITE_DATA_HUB_WS_TARGET`

This keeps local and VPS dev setups flexible without touching app code.

## VPS Deployment Recommendation

### Best setup

Serve chart studio and data-hub behind the same VPS host whenever possible.

Recommended public paths:

- app UI: `http(s)://<your-host>/chart-studio/`
- Chart Studio API bridge: `http(s)://<your-host>/chart-studio/api/...`
- Chart Studio WebSocket bridge: `ws(s)://<your-host>/chart-studio/ws`

### Why same-origin is preferred

- avoids browser CORS issues
- avoids browser-to-localhost mistakes
- keeps REST and WebSocket URLs stable
- makes support easier

## What Still Needs Infra Validation

These are not code blockers, but should be checked during VPS rollout:

1. Reverse proxy routes `/chart-studio/` to the Chart Studio preview/static server on port `7100`.
2. Reverse proxy routes `/chart-studio/api/` to data-hub on port `8000`.
3. Reverse proxy supports WebSocket upgrade on `/chart-studio/ws`.
4. Chart Studio is built with VPS mode so assets resolve under `/chart-studio/assets/...`.
5. Data-hub itself is healthy on the VPS.

## Verification Steps

1. Open `https://app.opendhan.in/chart-studio/`.
2. Confirm the chart loads historical candles.
3. Confirm the bottom status turns live when WebSocket is connected.
4. Confirm watchlist prices update in real time.
5. Confirm option chain and account panels still fetch correctly.

## Build and Serve Commands

Chart Studio VPS build:

- `npm run build:vps`

Chart Studio VPS serve:

- `npm run preview:vps`

## Non-Goals

No trading logic was changed.
No execution flow was changed.
No strategy code was touched.
