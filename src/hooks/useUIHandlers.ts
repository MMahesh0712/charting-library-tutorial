/**
 * UI Handlers Hook
 * Manages UI state: panels, dialogs, toggles, and appearance settings
 */

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { set, STORAGE_KEYS } from '../services/storageService';
import type { ChartEngine } from '../services/tradingViewConfig';
import { normalizeTradingViewLibraryPath } from '../services/tradingViewConfig';
import { CHART_COLORS } from '../utils/colorUtils';

// ==================== TYPES ====================

/** Chart colors structure */
interface ChartColorsType {
  UP: { primary: string };
  DOWN: { primary: string };
}

/** Chart appearance settings */
export interface ChartAppearance {
  wickUpColor: string;
  wickDownColor: string;
  borderUpColor: string;
  borderDownColor: string;
  upColor: string;
  downColor: string;
  lineColor: string;
  areaTopColor: string;
  areaBottomColor: string;
  baselineTopFillColor1: string;
  baselineTopFillColor2: string;
  baselineBottomFillColor1: string;
  baselineBottomFillColor2: string;
  baselineTopLineColor: string;
  baselineBottomLineColor: string;
  rangeUpColor: string;
  rangeDownColor: string;
}

/** Drawing options */
export interface DrawingDefaults {
  lineColor: string;
  lineWidth: number;
  lineStyle: number;
  fillColor: string;
  showLabel: boolean;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  [key: string]: unknown;
}

/** Indicator settings */
export interface IndicatorSettings {
  id: string;
  type: string;
  visible: boolean;
  [key: string]: unknown;
}

/** Chart configuration */
export interface ChartConfig {
  id: number;
  symbol: string;
  exchange: string;
  interval: string;
  indicators: IndicatorSettings[];
  comparisonSymbols: unknown[];
  [key: string]: unknown;
}

/** Template indicator config */
interface TemplateIndicatorConfig {
  sma?: boolean | undefined;
  ema?: boolean | undefined;
  rsi?: { enabled: boolean; period: number; color: string } | undefined;
  macd?: { enabled: boolean; fast: number; slow: number; signal: number; macdColor: string; signalColor: string } | undefined;
  bollingerBands?: { enabled: boolean; period: number; stdDev: number } | undefined;
  volume?: { enabled: boolean; colorUp: string; colorDown: string } | undefined;
  atr?: { enabled: boolean; period: number; color: string } | undefined;
  stochastic?: { enabled: boolean; kPeriod: number; dPeriod: number; smooth: number; kColor: string; dColor: string } | undefined;
  vwap?: { enabled: boolean; color: string } | undefined;
  supertrend?: { enabled: boolean; period: number; multiplier: number } | undefined;
  tpo?: { enabled: boolean; blockSize: string; tickSize: string } | undefined;
  firstCandle?: { enabled: boolean; highlightColor: string; highLineColor: string; lowLineColor: string } | undefined;
  priceActionRange?: { enabled: boolean; supportColor: string; resistanceColor: string } | undefined;
  [key: string]: unknown;
}

/** Chart template */
export interface ChartTemplate {
  name: string;
  chartType?: string | undefined;
  indicators?: IndicatorSettings[] | undefined;
  appearance?: Partial<ChartAppearance> | undefined;
}

/** Layout template */
export interface LayoutTemplate {
  name: string;
  layout?: string | undefined;
  chartType?: string | undefined;
  charts?: Array<{
    symbol?: string | undefined;
    exchange?: string | undefined;
    interval?: string | undefined;
    indicators?: TemplateIndicatorConfig | undefined;
    comparisonSymbols?: unknown[] | undefined;
  }> | undefined;
  appearance?: {
    chartAppearance?: Partial<ChartAppearance> | undefined;
    theme?: string | undefined;
  } | undefined;
}

/** Option chain symbol */
export interface OptionChainSymbol {
  symbol: string;
  exchange: string;
}

/** Toast function type */
export type ShowToastFn = (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;

/** Right panel type */
export type RightPanelType =
  | 'alerts'
  | 'watchlist'
  | 'objectTree'
  | 'screener'
  | 'position_tracker'
  | 'ann_scanner'
  | 'dom'
  | 'trade'
  | null;

/** Hook parameters */
export interface UseUIHandlersParams {
  // Panel setters
  setActiveRightPanel: Dispatch<SetStateAction<RightPanelType>>;
  setUnreadAlertCount: Dispatch<SetStateAction<number>>;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setIsTemplateDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsChartTemplatesOpen: Dispatch<SetStateAction<boolean>>;
  setIsOptionChainOpen: Dispatch<SetStateAction<boolean>>;
  setOptionChainInitialSymbol: Dispatch<SetStateAction<OptionChainSymbol | null>>;
  // Chart settings
  setChartType: Dispatch<SetStateAction<string>>;
  setCharts: Dispatch<SetStateAction<ChartConfig[]>>;
  activeChartId: number;
  activeChart: ChartConfig | null;
  chartType: string;
  chartAppearance: ChartAppearance;
  setChartAppearance: Dispatch<SetStateAction<ChartAppearance>>;
  setLayout: Dispatch<SetStateAction<string>>;
  setActiveChartId: Dispatch<SetStateAction<number>>;
  setTheme: Dispatch<SetStateAction<string>>;
  // Timer/session
  setIsTimerVisible: Dispatch<SetStateAction<boolean>>;
  setIsSessionBreakVisible: Dispatch<SetStateAction<boolean>>;
  // Drawing
  setDrawingDefaults: Dispatch<SetStateAction<DrawingDefaults>>;
  // API settings
  setApiKey: Dispatch<SetStateAction<string>>;
  setWebsocketUrl: Dispatch<SetStateAction<string>>;
  setHostUrl: Dispatch<SetStateAction<string>>;
  setOpenalgoUsername: Dispatch<SetStateAction<string>>;
  setChartEngine: Dispatch<SetStateAction<ChartEngine>>;
  setTradingViewLibraryPath: Dispatch<SetStateAction<string>>;
  // Toast
  showToast: ShowToastFn;
}

/** Hook return type */
export interface UseUIHandlersReturn {
  handleRightPanelToggle: (panel: RightPanelType) => void;
  handleSettingsClick: () => void;
  handleTemplatesClick: () => void;
  handleChartTemplatesClick: () => void;
  handleLoadChartTemplate: (template: ChartTemplate | null) => void;
  getCurrentChartConfig: () => { chartType: string; indicators: IndicatorSettings[]; appearance: ChartAppearance };
  handleOptionChainClick: () => void;
  handleOptionSelect: (symbol: string, exchange: string) => void;
  handleOpenOptionChainForSymbol: (symbol: string, exchange: string) => void;
  handleLoadTemplate: (template: LayoutTemplate | null) => void;
  handleTimerToggle: () => void;
  handleSessionBreakToggle: () => void;
  handleChartAppearanceChange: (newAppearance: Partial<ChartAppearance>) => void;
  handleResetChartAppearance: () => void;
  handleDrawingPropertyChange: (property: string, value: unknown) => void;
  handleResetDrawingDefaults: () => void;
  handleResetChart: () => void;
  handleApiKeySaveFromSettings: (newApiKey: string) => void;
  handleWebsocketUrlSave: (newUrl: string) => void;
  handleHostUrlSave: (newUrl: string) => void;
  handleUsernameSave: (newUsername: string) => void;
  handleChartEngineSave: (newEngine: ChartEngine) => void;
  handleTradingViewLibraryPathSave: (newPath: string) => void;
}

// ==================== CONSTANTS ====================

const typedChartColors = CHART_COLORS as ChartColorsType;

/** Default chart appearance settings */
const DEFAULT_CHART_APPEARANCE: ChartAppearance = {
  wickUpColor: typedChartColors.UP.primary,
  wickDownColor: typedChartColors.DOWN.primary,
  borderUpColor: typedChartColors.UP.primary,
  borderDownColor: typedChartColors.DOWN.primary,
  upColor: typedChartColors.UP.primary,
  downColor: typedChartColors.DOWN.primary,
  lineColor: '#2962FF',
  areaTopColor: 'rgba(41, 98, 255, 0.3)',
  areaBottomColor: 'rgba(41, 98, 255, 0)',
  baselineTopFillColor1: 'rgba(38, 166, 154, 0.28)',
  baselineTopFillColor2: 'rgba(38, 166, 154, 0.05)',
  baselineBottomFillColor1: 'rgba(239, 83, 80, 0.05)',
  baselineBottomFillColor2: 'rgba(239, 83, 80, 0.28)',
  baselineTopLineColor: 'rgba(38, 166, 154, 1)',
  baselineBottomLineColor: 'rgba(239, 83, 80, 1)',
  rangeUpColor: typedChartColors.UP.primary,
  rangeDownColor: typedChartColors.DOWN.primary,
};

/** Default drawing options */
const DEFAULT_DRAWING_OPTIONS: DrawingDefaults = {
  lineColor: '#2962FF',
  lineWidth: 1,
  lineStyle: 0,
  fillColor: 'rgba(41, 98, 255, 0.2)',
  showLabel: true,
  fontSize: 12,
  fontFamily: 'Trebuchet MS',
  textColor: '#B2B5BE',
};

// ==================== HOOK ====================

/**
 * Custom hook for UI operations
 * @param params - Hook parameters
 * @returns UI handler functions
 */
export const useUIHandlers = ({
  // Panel setters
  setActiveRightPanel,
  setUnreadAlertCount,
  setIsSettingsOpen,
  setIsTemplateDialogOpen,
  setIsChartTemplatesOpen,
  setIsOptionChainOpen,
  setOptionChainInitialSymbol,
  // Chart settings
  setChartType,
  setCharts,
  activeChartId,
  activeChart,
  chartType,
  chartAppearance,
  setChartAppearance,
  setLayout,
  setActiveChartId,
  setTheme,
  // Timer/session
  setIsTimerVisible,
  setIsSessionBreakVisible,
  // Drawing
  setDrawingDefaults,
  // API settings
  setApiKey,
  setWebsocketUrl,
  setHostUrl,
  setOpenalgoUsername,
  setChartEngine,
  setTradingViewLibraryPath,
  // Toast
  showToast,
}: UseUIHandlersParams): UseUIHandlersReturn => {
  // Right panel toggle
  const handleRightPanelToggle = useCallback(
    (panel: RightPanelType) => {
      setActiveRightPanel(panel);
      if (panel === 'alerts') {
        setUnreadAlertCount(0);
      }
    },
    [setActiveRightPanel, setUnreadAlertCount]
  );

  // Settings dialog
  const handleSettingsClick = useCallback(() => {
    setIsSettingsOpen(true);
  }, [setIsSettingsOpen]);

  // Layout template dialog
  const handleTemplatesClick = useCallback(() => {
    setIsTemplateDialogOpen(true);
  }, [setIsTemplateDialogOpen]);

  // Chart templates dialog
  const handleChartTemplatesClick = useCallback(() => {
    setIsChartTemplatesOpen(true);
  }, [setIsChartTemplatesOpen]);

  // Load chart template (indicators)
  const handleLoadChartTemplate = useCallback(
    (template: ChartTemplate | null) => {
      if (!template) return;

      if (template.chartType) {
        setChartType(template.chartType);
      }

      if (template.indicators && Array.isArray(template.indicators)) {
        setCharts((prev) =>
          prev.map((chart) =>
            chart.id === activeChartId ? { ...chart, indicators: template.indicators! } : chart
          )
        );
      }

      if (template.appearance) {
        setChartAppearance((prev) => ({ ...prev, ...template.appearance } as ChartAppearance));
      }

      showToast(`Loaded template: ${template.name}`, 'success');
    },
    [activeChartId, setChartType, setCharts, setChartAppearance, showToast]
  );

  // Get current chart config for saving
  const getCurrentChartConfig = useCallback(() => {
    return {
      chartType,
      indicators: activeChart?.indicators || [],
      appearance: chartAppearance,
    };
  }, [chartType, activeChart, chartAppearance]);

  // Option chain dialog
  const handleOptionChainClick = useCallback(() => {
    setIsOptionChainOpen(true);
  }, [setIsOptionChainOpen]);

  // Option selection from option chain
  const handleOptionSelect = useCallback(
    (symbol: string, exchange: string) => {
      setCharts((prev) =>
        prev.map((chart) => (chart.id === activeChartId ? { ...chart, symbol, exchange } : chart))
      );
      setIsOptionChainOpen(false);
    },
    [activeChartId, setCharts, setIsOptionChainOpen]
  );

  // Open option chain for specific symbol
  const handleOpenOptionChainForSymbol = useCallback(
    (symbol: string, exchange: string) => {
      setOptionChainInitialSymbol({ symbol, exchange });
      setIsOptionChainOpen(true);
    },
    [setOptionChainInitialSymbol, setIsOptionChainOpen]
  );

  // Load layout template
  const handleLoadTemplate = useCallback(
    (template: LayoutTemplate | null) => {
      if (!template) return;

      if (template.layout) {
        setLayout(template.layout);
      }

      if (template.chartType) {
        setChartType(template.chartType);
      }

      if (template.charts && Array.isArray(template.charts)) {
        const defaultIndicators: TemplateIndicatorConfig = {
          sma: false,
          ema: false,
          rsi: { enabled: false, period: 14, color: '#7B1FA2' },
          macd: {
            enabled: false,
            fast: 12,
            slow: 26,
            signal: 9,
            macdColor: '#2962FF',
            signalColor: '#FF6D00',
          },
          bollingerBands: { enabled: false, period: 20, stdDev: 2 },
          volume: { enabled: false, colorUp: '#089981', colorDown: '#F23645' },
          atr: { enabled: false, period: 14, color: '#FF9800' },
          stochastic: {
            enabled: false,
            kPeriod: 14,
            dPeriod: 3,
            smooth: 3,
            kColor: '#2962FF',
            dColor: '#FF6D00',
          },
          vwap: { enabled: false, color: '#FF9800' },
          supertrend: { enabled: false, period: 10, multiplier: 3 },
          tpo: { enabled: false, blockSize: '30m', tickSize: 'auto' },
          firstCandle: {
            enabled: false,
            highlightColor: '#FFD700',
            highLineColor: '#ef5350',
            lowLineColor: '#26a69a',
          },
          priceActionRange: { enabled: false, supportColor: '#26a69a', resistanceColor: '#ef5350' },
        };

        const loadedCharts = template.charts.map((chart, index) => ({
          id: index + 1,
          symbol: chart.symbol || 'RELIANCE',
          exchange: chart.exchange || 'NSE',
          interval: chart.interval || '1d',
          indicators: { ...defaultIndicators, ...chart.indicators } as unknown as IndicatorSettings[],
          comparisonSymbols: chart.comparisonSymbols || [],
        }));

        setCharts(loadedCharts as ChartConfig[]);
        setActiveChartId(1);
      }

      if (template.appearance) {
        if (template.appearance.chartAppearance) {
          setChartAppearance((prev) => ({ ...prev, ...template.appearance!.chartAppearance } as ChartAppearance));
        }
        if (template.appearance.theme) {
          setTheme(template.appearance.theme);
        }
      }
    },
    [setLayout, setChartType, setCharts, setActiveChartId, setChartAppearance, setTheme]
  );

  // Timer toggle
  const handleTimerToggle = useCallback(() => {
    setIsTimerVisible((prev) => !prev);
  }, [setIsTimerVisible]);

  // Session break toggle
  const handleSessionBreakToggle = useCallback(() => {
    setIsSessionBreakVisible((prev) => !prev);
  }, [setIsSessionBreakVisible]);

  // Chart appearance change
  const handleChartAppearanceChange = useCallback(
    (newAppearance: Partial<ChartAppearance>) => {
      setChartAppearance((prev) => ({ ...prev, ...newAppearance } as ChartAppearance));
    },
    [setChartAppearance]
  );

  // Reset chart appearance
  const handleResetChartAppearance = useCallback(() => {
    setChartAppearance(DEFAULT_CHART_APPEARANCE);
  }, [setChartAppearance]);

  // Drawing property change
  const handleDrawingPropertyChange = useCallback(
    (property: string, value: unknown) => {
      setDrawingDefaults((prev) => ({ ...prev, [property]: value }));
    },
    [setDrawingDefaults]
  );

  // Reset drawing defaults
  const handleResetDrawingDefaults = useCallback(() => {
    setDrawingDefaults(DEFAULT_DRAWING_OPTIONS);
  }, [setDrawingDefaults]);

  // Reset all chart settings
  const handleResetChart = useCallback(() => {
    setChartAppearance(DEFAULT_CHART_APPEARANCE);
    setDrawingDefaults(DEFAULT_DRAWING_OPTIONS);
    showToast('Chart settings reset to default', 'success');
  }, [setChartAppearance, setDrawingDefaults, showToast]);

  // API key save
  const handleApiKeySaveFromSettings = useCallback(
    (newApiKey: string) => {
      setApiKey(newApiKey);
      set(STORAGE_KEYS.OA_API_KEY, newApiKey);
    },
    [setApiKey]
  );

  // WebSocket URL save
  const handleWebsocketUrlSave = useCallback(
    (newUrl: string) => {
      setWebsocketUrl(newUrl);
      set(STORAGE_KEYS.OA_WS_URL, newUrl);
    },
    [setWebsocketUrl]
  );

  // Host URL save
  const handleHostUrlSave = useCallback(
    (newUrl: string) => {
      setHostUrl(newUrl);
      set(STORAGE_KEYS.OA_HOST_URL, newUrl);
    },
    [setHostUrl]
  );

  // Username save
  const handleUsernameSave = useCallback(
    (newUsername: string) => {
      setOpenalgoUsername(newUsername);
      set(STORAGE_KEYS.OA_USERNAME, newUsername);
    },
    [setOpenalgoUsername]
  );

  const handleChartEngineSave = useCallback(
    (newEngine: ChartEngine) => {
      setChartEngine(newEngine);
      set(STORAGE_KEYS.CHART_ENGINE, newEngine);
    },
    [setChartEngine]
  );

  const handleTradingViewLibraryPathSave = useCallback(
    (newPath: string) => {
      const normalized = normalizeTradingViewLibraryPath(newPath);
      setTradingViewLibraryPath(normalized);
      set(STORAGE_KEYS.TV_LIBRARY_PATH, normalized);
    },
    [setTradingViewLibraryPath]
  );

  return {
    handleRightPanelToggle,
    handleSettingsClick,
    handleTemplatesClick,
    handleChartTemplatesClick,
    handleLoadChartTemplate,
    getCurrentChartConfig,
    handleOptionChainClick,
    handleOptionSelect,
    handleOpenOptionChainForSymbol,
    handleLoadTemplate,
    handleTimerToggle,
    handleSessionBreakToggle,
    handleChartAppearanceChange,
    handleResetChartAppearance,
    handleDrawingPropertyChange,
    handleResetDrawingDefaults,
    handleResetChart,
    handleApiKeySaveFromSettings,
    handleWebsocketUrlSave,
    handleHostUrlSave,
    handleUsernameSave,
    handleChartEngineSave,
    handleTradingViewLibraryPathSave,
  };
};

export default useUIHandlers;
