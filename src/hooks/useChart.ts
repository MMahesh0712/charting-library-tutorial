/**
 * useChart Adapter Hook
 *
 * This hook replaces the old ChartContext. It provides the same API
 * but bridges to the new Zustand stores (workspaceStore and marketDataStore).
 */

import { useCallback, useMemo, type MutableRefObject } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { indicatorConfigs } from '../components/IndicatorSettings/indicatorConfigs';

// ==================== TYPES ====================

// Re-export types from the domain for convenience
export type { ChartConfig, Indicator, IndicatorConfig } from '@/types/domain/chart';
export type { Exchange } from '@/types/domain/trading';

/** Indicator config input definition */
interface IndicatorConfigInput {
  key: string;
  default?: unknown;
}

/** Indicator config style definition */
interface IndicatorConfigStyle {
  key: string;
  default?: unknown;
}

/** Indicator configuration from indicatorConfigs */
interface IndicatorConfigDef {
  inputs?: IndicatorConfigInput[] | undefined;
  style?: IndicatorConfigStyle[] | undefined;
}

/** Comparison symbol - extended chart data not in base ChartConfig */
export interface ComparisonSymbol {
  symbol: string;
  exchange: string;
  color: string;
  scaleMode?: string | undefined;
}

/** Strategy configuration - extended chart data not in base ChartConfig */
export interface StrategyConfig {
  [key: string]: unknown;
}

/** Extended chart config with comparison symbols and strategy */
export interface ExtendedChartConfig {
  id: number;
  symbol: string;
  exchange: string;
  interval: string;
  indicators: unknown[];
  comparisonSymbols?: ComparisonSymbol[] | undefined;
  strategyConfig?: StrategyConfig | null | undefined;
  [key: string]: unknown;
}

/** Chart reference */
export interface ChartRef {
  [key: string]: unknown;
}

/** Chart refs object */
export type ChartRefs = MutableRefObject<Record<number, ChartRef | null>>;

/** Hook return type */
export interface UseChartReturn {
  // State
  charts: ExtendedChartConfig[];
  setCharts: (charts: unknown[] | ((prev: unknown[]) => unknown[])) => void;
  activeChartId: number;
  setActiveChartId: (id: number) => void;
  layout: string;
  setLayout: (layout: string) => void;
  chartRefs: ChartRefs;

  // Derived
  activeChart: ExtendedChartConfig;
  currentSymbol: string;
  currentExchange: string;
  currentInterval: string;

  // Chart handlers
  updateSymbol: (symbol: string, exchange?: string) => void;
  updateInterval: (interval: string) => void;

  // Indicator handlers
  addIndicator: (type: string) => void;
  removeIndicator: (indicatorId: string) => void;
  toggleIndicatorVisibility: (indicatorId: string) => void;
  updateIndicatorSettings: (indicatorId: string, newSettings: Record<string, unknown>) => void;
  setIndicators: (newIndicators: unknown[]) => void;

  // Comparison symbols
  addComparisonSymbol: (symbol: string, exchange: string, color: string) => void;
  removeComparisonSymbol: (symbol: string, exchange: string) => void;

  // Strategy
  updateStrategyConfig: (config: StrategyConfig | null) => void;

  // Multi-chart
  addChart: () => number;
  removeChart: (chartId: number) => void;
  getChartRef: (id: number) => ChartRef | null | undefined;
}

// ==================== CONSTANTS ====================

// Module-level singleton for chart refs to ensure stability across renders/components
const globalChartRefs: ChartRefs = { current: {} };

const DEFAULT_CHART: ExtendedChartConfig = {
  id: 1,
  symbol: 'NIFTY 50',
  exchange: 'NSE',
  interval: '5m',
  indicators: [],
  comparisonSymbols: [],
  strategyConfig: null,
};

// ==================== HOOK ====================

/**
 * Custom hook providing chart context functionality via Zustand stores
 * @returns Chart state and handlers
 */
export const useChart = (): UseChartReturn => {
  const {
    charts,
    setCharts,
    activeChartId,
    setActiveChartId,
    layout,
    setLayout,
    updateChart,
    updateIndicator: storeUpdateIndicator,
    addIndicator: storeAddIndicator,
    removeIndicator: storeRemoveIndicator,
  } = useWorkspaceStore();

  // Cast charts to extended type for compatibility
  const extendedCharts = charts as unknown as ExtendedChartConfig[];

  // Helper to access refs securely
  const getChartRef = useCallback((id: number): ChartRef | null | undefined => {
    return globalChartRefs.current[id];
  }, []);

  // Derived: Active chart object
  const activeChart = useMemo(
    () => extendedCharts.find((c) => c.id === activeChartId) || extendedCharts[0] || DEFAULT_CHART,
    [extendedCharts, activeChartId]
  );

  // Derived: Current properties
  const currentSymbol = activeChart.symbol || 'NIFTY 50';
  const currentExchange = activeChart.exchange || 'NSE';
  const currentInterval = activeChart.interval || '1d';

  // ============ CHART HANDLERS ============

  const updateSymbol = useCallback(
    (symbol: string, exchange: string = 'NSE') => {
      updateChart(activeChartId, { symbol, exchange } as unknown as Parameters<typeof updateChart>[1]);
    },
    [activeChartId, updateChart]
  );

  const updateInterval = useCallback(
    (interval: string) => {
      updateChart(activeChartId, { interval } as unknown as Parameters<typeof updateChart>[1]);
    },
    [activeChartId, updateChart]
  );

  // ============ INDICATOR HANDLERS ============

  const addIndicator = useCallback(
    (type: string) => {
      const config = (indicatorConfigs as Record<string, IndicatorConfigDef>)[type];
      const defaultSettings: Record<string, unknown> = {};

      // Merge defaults from config inputs
      if (config && config.inputs) {
        config.inputs.forEach((input) => {
          if (input.default !== undefined) {
            defaultSettings[input.key] = input.default;
          }
        });
      }

      // Merge defaults from config styles
      if (config && config.style) {
        config.style.forEach((style) => {
          if (style.default !== undefined) {
            defaultSettings[style.key] = style.default;
          }
        });
      }

      // Fallback defaults
      if (!config) {
        if (type === 'sma') Object.assign(defaultSettings, { period: 20, color: '#2196F3' });
        if (type === 'ema') Object.assign(defaultSettings, { period: 20, color: '#FF9800' });
        if (type === 'tpo') Object.assign(defaultSettings, { blockSize: '30m', tickSize: 'auto' });
      }

      const timestamp = Date.now();
      const id = `${type}_${timestamp}_${Math.floor(Math.random() * 1000)}`;

      const newIndicator = {
        id,
        type,
        visible: true,
        ...defaultSettings,
      };

      storeAddIndicator(activeChartId, newIndicator as unknown as Parameters<typeof storeAddIndicator>[1]);
    },
    [activeChartId, storeAddIndicator]
  );

  const removeIndicator = useCallback(
    (indicatorId: string) => {
      storeRemoveIndicator(activeChartId, indicatorId);
    },
    [activeChartId, storeRemoveIndicator]
  );

  const toggleIndicatorVisibility = useCallback(
    (indicatorId: string) => {
      const chart = extendedCharts.find((c) => c.id === activeChartId);
      if (!chart) return;

      const indicator = (chart.indicators as Array<{ id: string; visible: boolean }>).find(
        (ind) => ind.id === indicatorId
      );
      if (indicator) {
        storeUpdateIndicator(
          activeChartId,
          indicatorId,
          { visible: !indicator.visible } as unknown as Parameters<typeof storeUpdateIndicator>[2]
        );
      }
    },
    [activeChartId, extendedCharts, storeUpdateIndicator]
  );

  const updateIndicatorSettings = useCallback(
    (indicatorId: string, newSettings: Record<string, unknown>) => {
      storeUpdateIndicator(
        activeChartId,
        indicatorId,
        newSettings as unknown as Parameters<typeof storeUpdateIndicator>[2]
      );
    },
    [activeChartId, storeUpdateIndicator]
  );

  const setIndicators = useCallback(
    (newIndicators: unknown[]) => {
      updateChart(activeChartId, { indicators: newIndicators } as unknown as Parameters<typeof updateChart>[1]);
    },
    [activeChartId, updateChart]
  );

  // ============ COMPARISON SYMBOLS ============

  const addComparisonSymbol = useCallback(
    (symbol: string, exchange: string, color: string) => {
      const chart = extendedCharts.find((c) => c.id === activeChartId);
      if (!chart) return;

      const current = chart.comparisonSymbols || [];
      const exists = current.find((c) => c.symbol === symbol && c.exchange === exchange);
      if (exists) return;

      const setChartsTyped = setCharts as unknown as (fn: (prev: ExtendedChartConfig[]) => ExtendedChartConfig[]) => void;
      setChartsTyped((prev) =>
        prev.map((c) =>
          c.id === activeChartId
            ? { ...c, comparisonSymbols: [...(c.comparisonSymbols || []), { symbol, exchange, color }] }
            : c
        )
      );
    },
    [activeChartId, extendedCharts, setCharts]
  );

  const removeComparisonSymbol = useCallback(
    (symbol: string, exchange: string) => {
      const chart = extendedCharts.find((c) => c.id === activeChartId);
      if (!chart) return;

      const current = chart.comparisonSymbols || [];
      const setChartsTyped = setCharts as unknown as (fn: (prev: ExtendedChartConfig[]) => ExtendedChartConfig[]) => void;
      setChartsTyped((prev) =>
        prev.map((c) =>
          c.id === activeChartId
            ? {
                ...c,
                comparisonSymbols: current.filter(
                  (comp) => !(comp.symbol === symbol && comp.exchange === exchange)
                ),
              }
            : c
        )
      );
    },
    [activeChartId, extendedCharts, setCharts]
  );

  // ============ STRATEGY CONFIG ============

  const updateStrategyConfig = useCallback(
    (config: StrategyConfig | null) => {
      const setChartsTyped = setCharts as unknown as (fn: (prev: ExtendedChartConfig[]) => ExtendedChartConfig[]) => void;
      setChartsTyped((prev) =>
        prev.map((c) =>
          c.id === activeChartId ? { ...c, strategyConfig: config } : c
        )
      );
    },
    [activeChartId, setCharts]
  );

  // ============ MULTI-CHART MANAGEMENT ============

  const addChart = useCallback((): number => {
    const newId = Math.max(...extendedCharts.map((c) => c.id)) + 1;
    const newChart = {
      id: newId,
      symbol: 'NIFTY 50',
      exchange: 'NSE',
      interval: '1d',
      indicators: [],
      comparisonSymbols: [],
      strategyConfig: null,
    };
    useWorkspaceStore.getState().addChart(newChart as unknown as Parameters<ReturnType<typeof useWorkspaceStore.getState>['addChart']>[0]);
    return newId;
  }, [extendedCharts]);

  const removeChart = useCallback(
    (chartId: number) => {
      if (extendedCharts.length <= 1) return;
      useWorkspaceStore.getState().removeChart(chartId);
    },
    [extendedCharts]
  );

  // Compatibility hook return
  return {
    // State
    charts: extendedCharts,
    setCharts: setCharts as (charts: unknown[] | ((prev: unknown[]) => unknown[])) => void,
    activeChartId,
    setActiveChartId,
    layout,
    setLayout: setLayout as (layout: string) => void,
    chartRefs: globalChartRefs,

    // Derived
    activeChart,
    currentSymbol,
    currentExchange,
    currentInterval,

    // Chart handlers
    updateSymbol,
    updateInterval,

    // Indicator handlers
    addIndicator,
    removeIndicator,
    toggleIndicatorVisibility,
    updateIndicatorSettings,
    setIndicators,

    // Comparison symbols
    addComparisonSymbol,
    removeComparisonSymbol,

    // Strategy
    updateStrategyConfig,

    // Multi-chart
    addChart,
    removeChart,
    getChartRef,
  };
};

export default useChart;
