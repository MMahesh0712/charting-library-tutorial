/**
 * Workspace Store
 * Manages chart layout, active chart, and indicators using Zustand
 */

import { create } from 'zustand';
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware';
import logger from '@/utils/logger';
import { getJSON, STORAGE_KEYS } from '../services/storageService';
import { normalizeSymbolExchange } from '../utils/symbolNormalization';
import type { ChartConfig, Indicator, LayoutType } from '@/types/domain';
import type { IChartApi } from 'lightweight-charts';

/** Workspace state */
interface WorkspaceState {
  layout: LayoutType;
  activeChartId: number;
  charts: ChartConfig[];
  chartRefs: Record<number, IChartApi | null>;
}

/** Workspace actions */
interface WorkspaceActions {
  setLayout: (layout: LayoutType) => void;
  setActiveChartId: (idOrFn: number | ((prev: number) => number)) => void;
  setCharts: (chartsOrFn: ChartConfig[] | ((prev: ChartConfig[]) => ChartConfig[])) => void;
  addChart: (newChart: ChartConfig) => void;
  removeChart: (id: number) => void;
  updateChart: (id: number, updates: Partial<ChartConfig>) => void;
  updateIndicator: (
    chartId: number,
    indicatorId: string,
    settings: Partial<Indicator>
  ) => void;
  addIndicator: (chartId: number, indicator: Indicator) => void;
  removeIndicator: (chartId: number, indicatorId: string) => void;
  setChartRef: (id: number, ref: IChartApi | null) => void;
  getChartRef: (id: number) => IChartApi | null | undefined;
  setFromCloud: (cloudLayoutData: unknown) => void;
}

/** Combined store type */
type WorkspaceStore = WorkspaceState & WorkspaceActions;

/** Migration function for old indicator format */
function migrateIndicators(indicators: unknown): Indicator[] {
  if (Array.isArray(indicators)) return indicators as Indicator[];

  const migrated: Indicator[] = [];
  const timestamp = Date.now();
  let counter = 0;

  Object.entries((indicators as Record<string, unknown>) || {}).forEach(
    ([type, config]) => {
      if (config === false) return;

      const base: Indicator = {
        id: `${type}_${timestamp}_${counter++}`,
        type: type as Indicator['type'],
        visible: true,
      };

      if (config === true) {
        if (type === 'sma') Object.assign(base, { period: 20, color: '#2196F3' });
        if (type === 'ema') Object.assign(base, { period: 20, color: '#FF9800' });
        migrated.push(base);
      } else if (typeof config === 'object' && config !== null) {
        const configObj = config as Record<string, unknown>;
        if (configObj['enabled'] === false) return;
        const { enabled: _, ...settings } = configObj;
        Object.assign(base, settings);
        if (settings['hidden']) {
          base.visible = false;
        }
        migrated.push(base);
      }
    }
  );
  return migrated;
}

/** Load initial state from old storage if new storage is empty */
function loadInitialState(): WorkspaceState {
  const oldData = getJSON(STORAGE_KEYS.SAVED_LAYOUT, null) as {
    layout?: LayoutType;
    activeChartId?: number;
    charts?: ChartConfig[];
  } | null;

  if (oldData) {
    const migratedCharts = (oldData.charts || []).map((chart) => {
      // Normalize symbol/exchange to canonical form (removes NIFTY→'NIFTY 50', NSE_INDEX→'NSE' mismatches)
      const { symbol: normalizedSymbol, exchange: normalizedExchange } =
        normalizeSymbolExchange(chart.symbol || 'NIFTY 50', chart.exchange || 'NSE');
      return {
        ...chart,
        symbol: normalizedSymbol,
        exchange: normalizedExchange,
      };
    }).map((chart) => ({
      ...chart,
      indicators: migrateIndicators(chart.indicators || []).map((ind) => {
        if (ind.type === ('classic' as Indicator['type'])) {
          return { ...ind, type: 'pivotPoints' as const, pivotType: 'classic' };
        }
        return ind;
      }),
    })) as ChartConfig[];

    return {
      layout: (oldData.layout || '1') as LayoutType,
      activeChartId: migratedCharts[0]?.id || 1,
      charts:
        migratedCharts.length > 0
          ? migratedCharts
          : [
              {
                id: 1,
                symbol: 'NIFTY 50',
                exchange: 'NSE',
                interval: 'D',
                indicators: [],
              } as ChartConfig,
            ],
      chartRefs: {},
    };
  }

  return {
    layout: '1',
    activeChartId: 1,
    charts: [
      {
        id: 1,
        symbol: 'NIFTY 50',
        exchange: 'NSE',
        interval: 'D',
        indicators: [],
      } as ChartConfig,
    ],
    chartRefs: {},
  };
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...loadInitialState(),

        setLayout: (layout) => set({ layout }),

        setActiveChartId: (idOrFn) =>
          set((state) => ({
            activeChartId:
              typeof idOrFn === 'function' ? idOrFn(state.activeChartId) : idOrFn,
          })),

        setCharts: (chartsOrFn) =>
          set((state) => ({
            charts:
              typeof chartsOrFn === 'function'
                ? chartsOrFn(state.charts)
                : chartsOrFn,
          })),

        addChart: (newChart) =>
          set((state) => ({
            charts: [...state.charts, newChart],
            activeChartId: newChart.id,
          })),

        removeChart: (id) =>
          set((state) => {
            const newCharts = state.charts.filter((c) => c.id !== id);
            let newActiveId = state.activeChartId;
            if (state.activeChartId === id) {
              newActiveId = newCharts[0]?.id ?? 1;
            }
            return { charts: newCharts, activeChartId: newActiveId };
          }),

        updateChart: (id, updates) =>
          set((state) => ({
            charts: state.charts.map((c) =>
              c.id === id ? { ...c, ...updates } : c
            ),
          })),

        updateIndicator: (chartId, indicatorId, settings) =>
          set((state) => ({
            charts: state.charts.map((chart) => {
              if (chart.id !== chartId) return chart;
              return {
                ...chart,
                indicators: chart.indicators.map((ind) =>
                  ind.id === indicatorId ? { ...ind, ...settings } : ind
                ),
              };
            }),
          })),

        addIndicator: (chartId, indicator) =>
          set((state) => ({
            charts: state.charts.map((chart) => {
              if (chart.id !== chartId) return chart;
              return { ...chart, indicators: [...chart.indicators, indicator] };
            }),
          })),

        removeIndicator: (chartId, indicatorId) =>
          set((state) => ({
            charts: state.charts.map((chart) => {
              if (chart.id !== chartId) return chart;
              return {
                ...chart,
                indicators: chart.indicators.filter(
                  (ind) => ind.id !== indicatorId
                ),
              };
            }),
          })),

        setChartRef: (id, ref) =>
          set((state) => ({
            chartRefs: { ...state.chartRefs, [id]: ref },
          })),

        getChartRef: (id) => {
          return get().chartRefs[id];
        },

        setFromCloud: (cloudLayoutData) =>
          set((state) => {
            if (!cloudLayoutData) return state;

            let layoutData: {
              layout?: LayoutType;
              activeChartId?: number;
              charts?: ChartConfig[];
            };
            try {
              layoutData =
                typeof cloudLayoutData === 'string'
                  ? JSON.parse(cloudLayoutData)
                  : cloudLayoutData;
            } catch (e) {
              logger.error('[WorkspaceStore] Failed to parse cloud data:', e);
              return state;
            }

            if (!layoutData || typeof layoutData !== 'object') {
              return state;
            }

            const migratedCharts = (layoutData.charts || []).map((chart) => {
              // Normalize symbol/exchange to canonical form
              const { symbol: normalizedSymbol, exchange: normalizedExchange } =
                normalizeSymbolExchange(chart.symbol || 'NIFTY 50', chart.exchange || 'NSE');
              return {
                ...chart,
                symbol: normalizedSymbol,
                exchange: normalizedExchange,
                indicators: migrateIndicators(chart.indicators || []).map(
                  (ind) => {
                    if (ind.type === ('classic' as Indicator['type'])) {
                      return {
                        ...ind,
                        type: 'pivotPoints' as const,
                        pivotType: 'classic',
                      };
                    }
                    return ind;
                  }
                ),
              };
            }) as ChartConfig[];

            if (migratedCharts.length === 0) {
              return state;
            }

            logger.debug('[WorkspaceStore] Hydrating from cloud:', {
              layout: layoutData.layout,
              chartsCount: migratedCharts.length,
            });

            return {
              layout: layoutData.layout || state.layout,
              activeChartId:
                layoutData.activeChartId ||
                migratedCharts[0]?.id ||
                state.activeChartId,
              charts: migratedCharts,
            };
          }),
      }),
      {
        name: 'openalgo-workspace-storage',
        storage: createJSONStorage(() => localStorage),
        version: 1,
        migrate: (persistedState) => {
          const state = persistedState as WorkspaceState;
          // v0→v1: Normalize all symbol/exchange to canonical form
          // (fixes NIFTY→'NIFTY 50', NSE_INDEX→'NSE' mismatches from old storage)
          state.charts = (state.charts || []).map((chart) => {
            const { symbol: s, exchange: e } =
              normalizeSymbolExchange(chart.symbol || 'NIFTY 50', chart.exchange || 'NSE');
            return { ...chart, symbol: s, exchange: e };
          });
          return state;
        },
        partialize: (state) => ({
          charts: state.charts,
          layout: state.layout,
          activeChartId: state.activeChartId,
        }),
      }
    )
  )
);

/** Selectors */
export const selectActiveChart = (state: WorkspaceStore) =>
  state.charts.find((c) => c.id === state.activeChartId);

export const selectChartById = (id: number) => (state: WorkspaceStore) =>
  state.charts.find((c) => c.id === id);

export const selectLayout = (state: WorkspaceStore) => state.layout;

export default useWorkspaceStore;