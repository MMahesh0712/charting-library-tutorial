import { useEffect, useRef, useCallback, RefObject, useState } from 'react';
import { getKlines, getHistoricalKlines, subscribeToTicker } from '../../../services/openalgo';
import { combineMultiLegOHLC } from '../../../services/optionChain';
import { getAccurateISTTimestamp, getAccurateUTCTimestamp, syncTimeWithAPI, shouldResync } from '../../../services/timeService';
import { subscribeToNetworkRecovery } from '../../../services/connectionStatus';
import { intervalToSeconds } from '../../../utils/timeframes';
import { logger } from '../../../utils/logger';
import { transformData } from '../utils/seriesFactories';
import { addFutureWhitespacePoints } from '../utils/chartHelpers';
import {
    DEFAULT_CANDLE_WINDOW,
    PREFETCH_THRESHOLD,
    IST_OFFSET_SECONDS,
} from '../utils/chartConfig';

export interface StrategyLeg {
    id: string;
    symbol: string;
    direction: 'buy' | 'sell';
    quantity?: number;
}

export interface StrategyConfig {
    legs: StrategyLeg[];
    exchange?: string;
}

export interface UseChartDataOptions {
    chartRef: RefObject<any>;
    mainSeriesRef: RefObject<any>;
    chartTypeRef: RefObject<string>;
    dataRef: RefObject<any[]>;
    symbol: string;
    exchange: string;
    interval: string;
    strategyConfig?: StrategyConfig | null;
    isReplayModeRef?: RefObject<boolean>;
    priceScaleTimerRef?: RefObject<any>;
    updateIndicators?: (data: any[], indicators: any[]) => void;
    updateAxisLabel?: () => void;
    updateOhlcFromLatest?: () => void;
    applyDefaultCandlePosition?: (dataLength: number, window: number) => void;
    indicatorsRef?: RefObject<any[]>;
    onDataLoaded?: (data: any[], intervalSeconds: number) => void;
}

export interface UseChartDataReturn {
    wsRef: RefObject<any>;
    strategyWsRefs: RefObject<Record<string, any>>;
    strategyDataRef: RefObject<Record<string, any[]>>;
    strategyLatestRef: RefObject<Record<string, number>>;
    isLoadingOlderDataRef: RefObject<boolean>;
    hasMoreHistoricalDataRef: RefObject<boolean>;
    oldestLoadedTimeRef: RefObject<number | null>;
    abortControllerRef: RefObject<AbortController | null>;
    symbolRef: RefObject<string>;
    exchangeRef: RefObject<string>;
    intervalRef: RefObject<string>;
    loadOlderData: () => Promise<void>;
    handleVisibleTimeRangeChange: (logicalRange: any) => void;
}

/**
 * Custom hook for chart data fetching, WebSocket subscription, and scroll-back loading
 */
export function useChartData({
    chartRef,
    mainSeriesRef,
    chartTypeRef,
    dataRef,
    symbol,
    exchange,
    interval,
    strategyConfig,
    isReplayModeRef,
    priceScaleTimerRef,
    updateIndicators,
    updateAxisLabel,
    updateOhlcFromLatest,
    applyDefaultCandlePosition,
    indicatorsRef,
    onDataLoaded,
}: UseChartDataOptions): UseChartDataReturn {
    // WebSocket refs
    const wsRef = useRef<any>(null);
    const strategyWsRefs = useRef<Record<string, any>>({}); // Map: legId -> WebSocket
    const strategyDataRef = useRef<Record<string, any[]>>({}); // Map: legId -> data array
    const strategyLatestRef = useRef<Record<string, number>>({}); // Map: legId -> latest price

    // Historical data scroll loading refs
    const isLoadingOlderDataRef = useRef<boolean>(false);
    const hasMoreHistoricalDataRef = useRef<boolean>(true);
    const oldestLoadedTimeRef = useRef<number | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    // HIGH FIX RC-2: Request ID pattern to discard stale scroll-back responses
    const scrollBackRequestIdRef = useRef<number>(0);

    // Symbol refs for closures
    const symbolRef = useRef<string>(symbol);
    const exchangeRef = useRef<string>(exchange);
    const intervalRef = useRef<string>(interval);

    // Network recovery trigger - increments when network recovers to force data refetch
    const [networkRecoveryKey, setNetworkRecoveryKey] = useState(0);
    // TSK-CS-010 FIX: Track last-known candle time so gap-fill can use it
    const lastKnownCandleTimeRef = useRef<number | null>(null);

    // Keep refs in sync with props
    useEffect(() => { symbolRef.current = symbol; }, [symbol]);
    useEffect(() => { exchangeRef.current = exchange; }, [exchange]);
    useEffect(() => { intervalRef.current = interval; }, [interval]);

    // Subscribe to network recovery events
    useEffect(() => {
        const unsubscribe = subscribeToNetworkRecovery(() => {
            logger.debug('[useChartData] Network recovery detected, attempting gap-fill');
            setNetworkRecoveryKey(prev => prev + 1);
        });
        return unsubscribe;
    }, []);

    // TSK-CS-010 FIX: On network recovery, fetch only the missing candles since
    // the last known candle time (gap-fill), instead of triggering a full reload.
    // Falls back to full reload (networkRecoveryKey bump) if gap-fill fails or
    // the gap is too large (> 5 days worth of 1m candles).
    useEffect(() => {
        if (networkRecoveryKey === 0) return;  // skip initial mount

        const lastTime = lastKnownCandleTimeRef.current;
        if (!lastTime || !mainSeriesRef.current || !dataRef.current?.length) return;

        const nowSec = Math.floor(Date.now() / 1000);
        const gapSeconds = nowSec - lastTime;
        const intervalSec = intervalToSeconds(interval);
        const MAX_GAP_CANDLES = 5 * 6 * 60; // 5 days of 1m candles — beyond this, full reload

        if (gapSeconds > MAX_GAP_CANDLES * intervalSec) {
            logger.warn('[GapFill] Gap too large (' + gapSeconds + 's), falling back to full reload');
            return; // networkRecoveryKey already bumped → main effect will full-reload
        }

        const gapStart = new Date((lastTime - intervalSec) * 1000); // one interval back for overlap
        const gapEnd   = new Date(nowSec * 1000);
        const formatDate = (d: Date): string => d.toISOString().split('T')[0];

        logger.debug('[GapFill] Fetching gap:', formatDate(gapStart), '→', formatDate(gapEnd),
            '(~' + Math.round(gapSeconds / intervalSec) + ' candles)');

        const ac = new AbortController();

        getHistoricalKlines(symbolRef.current, exchangeRef.current, interval,
            formatDate(gapStart), formatDate(gapEnd), ac.signal)
            .then(gapCandles => {
                if (!gapCandles?.length) return;
                const existingLatest = lastKnownCandleTimeRef.current ?? 0;
                const newCandles = gapCandles.filter(c => c.time > existingLatest);
                if (!newCandles.length) return;

                logger.debug('[GapFill] Merging', newCandles.length, 'gap candles');

                const merged = [...dataRef.current, ...newCandles];
                merged.sort((a, b) => a.time - b.time);
                dataRef.current = merged;
                lastKnownCandleTimeRef.current = merged[merged.length - 1].time;

                const activeType = chartTypeRef.current;
                const transformed = transformData(merged, activeType || 'candlestick');
                const withFuture = addFutureWhitespacePoints(transformed, intervalSec);
                mainSeriesRef.current?.setData(withFuture);

                if (updateIndicators && indicatorsRef?.current) {
                    updateIndicators(merged, indicatorsRef.current);
                }
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    logger.warn('[GapFill] Failed, chart will rely on WebSocket ticks:', err);
                }
            });

        return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [networkRecoveryKey]);

    // Load older historical data when user scrolls back
    const loadOlderData = useCallback(async () => {
        if (isLoadingOlderDataRef.current || !hasMoreHistoricalDataRef.current) return;
        if (!oldestLoadedTimeRef.current || !mainSeriesRef.current || !dataRef.current) return;
        if (isReplayModeRef?.current) return;

        isLoadingOlderDataRef.current = true;

        // HIGH FIX RC-2: Generate unique request ID to detect stale responses
        const currentRequestId = ++scrollBackRequestIdRef.current;

        try {
            const oldestTime = oldestLoadedTimeRef.current;
            if (!oldestTime) return;

            // Use UTC timestamp directly; new Date() handles local browser time for formatting
            const oldestDate = new Date(oldestTime * 1000);

            const endDate = new Date(oldestDate);
            endDate.setDate(endDate.getDate() - 1);

            const startDate = new Date(endDate);
            const currentSymbol = symbolRef.current;
            const currentExchange = exchangeRef.current;
            const currentInterval = intervalRef.current;
            const currentIndicators = indicatorsRef?.current;

            if (currentInterval.includes('m') || currentInterval.includes('h')) {
                startDate.setDate(startDate.getDate() - 30);
            } else {
                startDate.setFullYear(startDate.getFullYear() - 1);
            }

            const formatDate = (d: Date): string => d.toISOString().split('T')[0];

            logger.debug('[ScrollBack] Loading older data:', {
                symbol: currentSymbol,
                exchange: currentExchange,
                interval: currentInterval,
                startDate: formatDate(startDate),
                endDate: formatDate(endDate)
            });

            // Create new controller first, then abort old one to prevent race condition
            const oldController = abortControllerRef.current;
            abortControllerRef.current = new AbortController();

            if (oldController) {
                oldController.abort();
            }

            const olderData = await getHistoricalKlines(
                currentSymbol,
                currentExchange,
                currentInterval,
                formatDate(startDate),
                formatDate(endDate),
                abortControllerRef.current.signal
            );

            // HIGH FIX RC-2: Check if this response is still valid (no newer request started)
            if (currentRequestId !== scrollBackRequestIdRef.current) {
                logger.debug('[ScrollBack] Discarding stale response, request', currentRequestId, 'superseded by', scrollBackRequestIdRef.current);
                return;
            }

            if (!olderData || olderData.length === 0) {
                logger.debug('[ScrollBack] No more historical data available');
                hasMoreHistoricalDataRef.current = false;
                return;
            }

            // Filter out any candles that might overlap
            const existingOldestTime = dataRef.current[0]?.time || 0;
            const filteredOlderData = olderData.filter((d: any) => d.time < existingOldestTime);

            if (filteredOlderData.length === 0) {
                logger.debug('[ScrollBack] All fetched data overlaps, no more available');
                hasMoreHistoricalDataRef.current = false;
                return;
            }

            logger.debug('[ScrollBack] Prepending', filteredOlderData.length, 'older candles');

            // Save current visible range
            const timeScale = chartRef.current.timeScale();
            let currentLogicalRange: any = null;
            try {
                currentLogicalRange = timeScale.getVisibleLogicalRange();
            } catch (e) {
                // Ignore
            }

            // Prepend older data
            const prependCount = filteredOlderData.length;
            const newData = [...filteredOlderData, ...dataRef.current];
            dataRef.current = newData;

            oldestLoadedTimeRef.current = newData[0].time;

            const activeType = chartTypeRef.current;
            const transformedData = transformData(newData, activeType || 'candlestick');
            mainSeriesRef.current.setData(transformedData);

            // Restore visible range shifted by prepended count
            if (currentLogicalRange) {
                try {
                    const newFrom = currentLogicalRange.from + prependCount;
                    const newTo = currentLogicalRange.to + prependCount;
                    timeScale.setVisibleLogicalRange({ from: newFrom, to: newTo });
                } catch (e) {
                    logger.warn('[ScrollBack] Failed to restore visible range:', e);
                }
            }

            // Update indicators
            if (updateIndicators && currentIndicators) {
                updateIndicators(newData, currentIndicators);
            }

        } catch (error: any) {
            if (error.name !== 'AbortError') {
                logger.error('[ScrollBack] Error loading older data:', error);
            }
        } finally {
            isLoadingOlderDataRef.current = false;
        }
    }, [chartRef, mainSeriesRef, chartTypeRef, dataRef, isReplayModeRef, indicatorsRef, updateIndicators]);

    // Handle visible time range change for scroll-back loading
    const handleVisibleTimeRangeChange = useCallback((logicalRange: any) => {
        if (!logicalRange) return;

        const fromIndex = Math.round(logicalRange.from);
        if (fromIndex <= PREFETCH_THRESHOLD && hasMoreHistoricalDataRef.current && !isLoadingOlderDataRef.current) {
            logger.debug('[ScrollBack] Prefetching older data (user is', fromIndex, 'candles from oldest)');
            loadOlderData();
        }
    }, [loadOlderData]);

    // Main data loading effect
    useEffect(() => {
        if (!chartRef.current) return;

        let cancelled = false;
        let indicatorFrame: number | null = null;
        const abortController = new AbortController();

        // MEDIUM FIX RC-8: Capture strategy config at effect start to detect changes during load
        const effectStrategyConfig = strategyConfig;

        // Close existing WebSocket
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        // Close all strategy WebSocket connections
        Object.values(strategyWsRefs.current).forEach(ws => {
            if (ws?.close) ws.close();
        });
        strategyWsRefs.current = {};

        // Reset scroll-back refs
        isLoadingOlderDataRef.current = false;
        hasMoreHistoricalDataRef.current = true;
        oldestLoadedTimeRef.current = null;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        const loadData = async () => {
            try {
                let data: any[];

                // Check if we're in strategy mode (multi-leg)
                if (strategyConfig && strategyConfig.legs?.length >= 2) {
                    const strategyExchange = strategyConfig.exchange || 'NFO';
                    const legDataPromises = strategyConfig.legs.map(leg =>
                        getKlines(leg.symbol, strategyExchange, interval, 1000, abortController.signal)
                    );
                    const legDataArrays = await Promise.all(legDataPromises);

                    if (cancelled) return;

                    strategyDataRef.current = {};
                    strategyConfig.legs.forEach((leg, i) => {
                        strategyDataRef.current[leg.id] = legDataArrays[i];
                    });

                    data = combineMultiLegOHLC(legDataArrays, strategyConfig.legs as any);
                    logger.debug('[Strategy] Combined data length:', data.length);
                } else {
                    data = await getKlines(symbol, exchange, interval, 1000, abortController.signal);
                }

                if (cancelled) return;

                logger.debug(`[useChartData] API Response for ${symbol}: ${data?.length || 0} candles`);

                if (Array.isArray(data) && data.length > 0 && mainSeriesRef.current) {
                    // MANDATORY FIX: Strictly sort candles by time ascending
                    data.sort((a, b) => a.time - b.time);

                    // Validate data format
                    const firstCandle = data[0];
                    if (!firstCandle.time || !firstCandle.open) {
                        logger.error('[useChartData] Invalid candle format detected:', firstCandle);
                        return;
                    }

                    dataRef.current = data;
                    oldestLoadedTimeRef.current = data[0].time;
                    lastKnownCandleTimeRef.current = data[data.length - 1].time; // TSK-CS-010

                    logger.debug(`[useChartData] Setting data for ${symbol}: First candle ${new Date(data[0].time * 1000).toISOString()}, Last candle ${new Date(data[data.length - 1].time * 1000).toISOString()}`);

                    const activeType = chartTypeRef.current;
                    const transformedData = transformData(data, activeType || 'candlestick');
                    const intervalSeconds = intervalToSeconds(interval);
                    const dataWithFuture = addFutureWhitespacePoints(transformedData, intervalSeconds);
                    mainSeriesRef.current.setData(dataWithFuture);

                    // Notify that data is loaded
                    if (onDataLoaded) {
                        onDataLoaded(data, intervalSeconds);
                    }

                    if (indicatorFrame) cancelAnimationFrame(indicatorFrame);
                    indicatorFrame = requestAnimationFrame(() => {
                        if (!cancelled && updateIndicators && indicatorsRef?.current) {
                            updateIndicators(data, indicatorsRef.current);
                        }
                    });

                    applyDefaultCandlePosition?.(transformedData.length, DEFAULT_CANDLE_WINDOW);

                    setTimeout(() => {
                        if (!cancelled) {
                            updateAxisLabel?.();
                        }
                    }, 50);

                    // Verify symbol/exchange/interval haven't changed before setting up WebSocket
                    // This prevents race condition where symbol changes during data load
                    // MEDIUM FIX RC-8: Fix tautology bug - compare against captured config
                    const symbolsMatch = effectStrategyConfig ?
                        (effectStrategyConfig === strategyConfig) : // Strategy mode: check if config is still the same
                        (symbolRef.current === symbol && exchangeRef.current === exchange && intervalRef.current === interval);

                    if (!symbolsMatch) {
                        logger.warn('[useChartData] Symbol changed during data load, skipping WebSocket setup');
                        return;
                    }

                    // Set up WebSocket subscriptions
                    if (strategyConfig && strategyConfig.legs?.length >= 2) {
                        setupStrategyWebSockets(strategyConfig, cancelled);
                    } else {
                        setupRegularWebSocket(cancelled);
                    }
                } else {
                    // TSK-CS-010 FIX: Do NOT call setData([]) here — it causes a blank flash.
                    // Keep existing chart data visible until the new symbol's data arrives.
                    dataRef.current = [];
                }
            } catch (error: any) {
                if (error.name === 'AbortError') return;
                logger.error('Error loading chart data:', error);
            }
        };

        // Setup strategy mode WebSockets
        const setupStrategyWebSockets = (config: StrategyConfig, cancelled: boolean) => {
            const strategyExchange = config.exchange || 'NFO';

            const handleStrategyTick = (legConfig: StrategyLeg) => (ticker: any) => {
                if (cancelled || !ticker) return;

                const closePrice = Number(ticker.close);
                if (!Number.isFinite(closePrice) || closePrice <= 0) return;

                // Create atomic snapshot to prevent race conditions
                const snapshot = { ...strategyLatestRef.current };
                snapshot[legConfig.id] = closePrice;

                // Check if all legs have ticks using the snapshot
                const allLegsHaveTicks = config.legs.every(
                    leg => snapshot[leg.id] != null
                );

                if (!allLegsHaveTicks) {
                    // Partial update - commit snapshot and return
                    strategyLatestRef.current = snapshot;
                    return;
                }

                // Calculate using the consistent snapshot
                const combinedClose = config.legs.reduce((sum, leg) => {
                    const price = snapshot[leg.id];
                    const multiplier = leg.direction === 'buy' ? 1 : -1;
                    const qty = leg.quantity || 1;
                    return sum + (multiplier * qty * price);
                }, 0);

                // Commit the snapshot atomically
                strategyLatestRef.current = snapshot;
                updateCandleWithTick(combinedClose, cancelled);
            };

            config.legs.forEach(leg => {
                strategyWsRefs.current[leg.id] = subscribeToTicker(
                    leg.symbol,
                    strategyExchange,
                    interval,
                    handleStrategyTick(leg)
                );
            });
        };

        // Setup regular WebSocket
        const setupRegularWebSocket = (cancelled: boolean) => {
            wsRef.current = subscribeToTicker(symbol, exchange, interval, (ticker: any) => {
                if (cancelled || !ticker) return;

                const closePrice = Number(ticker.close);
                const tickVolume = Number(ticker.volume) || 0;
                if (!Number.isFinite(closePrice) || closePrice <= 0) {
                    logger.warn('Received invalid close price:', ticker);
                    return;
                }

                updateCandleWithTick(closePrice, cancelled, tickVolume);
            });
        };

        // Update candle with tick data
        const updateCandleWithTick = (closePrice: number, cancelled: boolean, tickVolume: number = 0) => {
            const originalData = dataRef.current;
            if (!originalData || originalData.length === 0) return;

            // HIGH FIX RC-3: Create snapshot to prevent mutation race with loadOlderData
            const originalLength = originalData.length;
            const currentData = [...originalData];

            const intervalSeconds = intervalToSeconds(interval);
            if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return;

            const lastIndex = currentData.length - 1;
            const lastCandleTime = currentData[lastIndex].time;

            if (shouldResync()) syncTimeWithAPI();
            const currentUTCTime = getAccurateUTCTimestamp();
            const currentCandleTime = Math.floor(currentUTCTime / intervalSeconds) * intervalSeconds;
            const needNewCandle = currentCandleTime > lastCandleTime;

            let candle: any;
            if (needNewCandle) {
                // TSK-CS-010 FIX: Fill any gap between last historical candle and first live tick.
                // If the WS reconnected after a gap (e.g. 3 missed 1m candles), insert flat
                // bridge candles so the chart doesn't show a visual hole.
                const prevClose = currentData[lastIndex].close;
                let fillTime = lastCandleTime + intervalSeconds;
                while (fillTime < currentCandleTime) {
                    currentData.push({
                        time: fillTime,
                        open: prevClose,
                        high: prevClose,
                        low: prevClose,
                        close: prevClose,
                        volume: 0,
                    });
                    fillTime += intervalSeconds;
                }
                candle = {
                    time: currentCandleTime,
                    open: closePrice,
                    high: closePrice,
                    low: closePrice,
                    close: closePrice,
                    volume: tickVolume,
                };
                currentData.push(candle);
            } else {
                const existingCandle = currentData[lastIndex];
                candle = {
                    time: lastCandleTime,
                    open: existingCandle.open,
                    high: Math.max(existingCandle.high, closePrice),
                    low: Math.min(existingCandle.low, closePrice),
                    close: closePrice,
                    volume: tickVolume,
                };
                currentData[lastIndex] = candle;
            }

            // HIGH FIX RC-3: Verify no concurrent prepend before committing
            // If loadOlderData prepended, the length will have changed
            if (dataRef.current.length === originalLength) {
                dataRef.current = currentData;
                // TSK-CS-010: keep lastKnownCandleTimeRef current so gap-fill is accurate
                lastKnownCandleTimeRef.current = currentData[currentData.length - 1].time;
            } else {
                // Concurrent modification detected, discard this update
                logger.debug('[WebSocket] Discarding tick update due to concurrent data modification');
                return;
            }
            const currentChartType = chartTypeRef.current;
            const transformedCandle = transformData([candle], currentChartType || 'candlestick')[0];

            if (transformedCandle && mainSeriesRef.current && !isReplayModeRef?.current) {
                try {
                    const transformedFullData = transformData(currentData, currentChartType || 'candlestick');
                    const dataWithFuture = addFutureWhitespacePoints(transformedFullData, intervalSeconds);
                    mainSeriesRef.current.setData(dataWithFuture);
                } catch (setDataErr) {
                    logger.warn('[WebSocket] Failed to update chart:', setDataErr);
                }

                updateAxisLabel?.();
                updateOhlcFromLatest?.();

                if (priceScaleTimerRef?.current) {
                    priceScaleTimerRef.current.updateCandleData(candle.open, candle.close);
                }
            }
        };

        loadData();

        return () => {
            cancelled = true;
            if (indicatorFrame) cancelAnimationFrame(indicatorFrame);
            abortController.abort();
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            Object.values(strategyWsRefs.current).forEach(ws => {
                if (ws) ws.close();
            });
            strategyWsRefs.current = {};
            strategyLatestRef.current = {};
            strategyDataRef.current = {};
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, exchange, interval, strategyConfig, networkRecoveryKey]);

    return {
        // Refs
        wsRef,
        strategyWsRefs,
        strategyDataRef,
        strategyLatestRef,
        isLoadingOlderDataRef,
        hasMoreHistoricalDataRef,
        oldestLoadedTimeRef,
        abortControllerRef,
        symbolRef,
        exchangeRef,
        intervalRef,

        // Callbacks
        loadOlderData,
        handleVisibleTimeRangeChange,
    };
}

export default useChartData;
