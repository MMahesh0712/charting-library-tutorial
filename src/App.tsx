import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import Layout from './components/Layout/Layout';
import Topbar, { type SignalStrategyFilter } from './components/Topbar/Topbar';
import DrawingToolbar from './components/Toolbar/DrawingToolbar';
import DrawingPropertiesPanel from './components/Toolbar/DrawingPropertiesPanel';
import ChartComponent from './components/Chart/ChartComponent';
// html2canvas is lazy loaded in useToolHandlers.ts when screenshot is taken
import { getTickerPrice, subscribeToMultiTicker, checkAuth, closeAllWebSockets, forceCloseAllWebSockets, saveUserPreferences, modifyOrder, cancelOrder, getKlines } from './services/openalgo';
import { globalAlertMonitor } from './services/globalAlertMonitor';

import BottomBar from './components/BottomBar/BottomBar';
import ChartGrid from './components/Chart/ChartGrid';
import RightToolbar from './components/Toolbar/RightToolbar';
import ApiKeyDialog from './components/ApiKeyDialog/ApiKeyDialog';
import MobileNav from './components/MobileNav/MobileNav';

// Lazy load heavy modal components for better initial load performance
import { initTimeService, destroyTimeService } from './services/timeService';
import { getJSON, setJSON, getString, set, getBoolean, setBoolean, STORAGE_KEYS } from './services/storageService'; // TSK-CS-023
import logger from './utils/logger';
import { useIsMobile, useCommandPalette, useGlobalShortcuts } from './hooks';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useCloudWorkspaceSync } from './hooks/useCloudWorkspaceSync';
import { useOILines } from './hooks/useOILines';
import { useIndicatorHandlers } from './hooks/useIndicatorHandlers';
import { useIntervalHandlers } from './hooks/useIntervalHandlers';
import { useSymbolHandlers } from './hooks/useSymbolHandlers';
import { useLayoutHandlers } from './hooks/useLayoutHandlers';
import { useAlertHandlers } from './hooks/useAlertHandlers';
import { useToolHandlers } from './hooks/useToolHandlers';
import { useUIHandlers } from './hooks/useUIHandlers';
import { useIndicatorAlertHandlers } from './hooks/useIndicatorAlertHandlers';
import { useANNScanner } from './hooks/useANNScanner';
import { useToastManager } from './hooks/useToastManager';
import { useTheme } from './context/ThemeContext';
import { useUI } from './context/UIContext';
import { useAlert } from './context/AlertContext';
import { useUser } from './context/UserContext';
import { useWatchlist } from './context/WatchlistContext';
import { OrderProvider } from './context/OrderContext';
import { indicatorConfigs } from './components/IndicatorSettings/indicatorConfigs';
import { useChart } from './hooks/useChart';
import { useWatchlistFeed } from './hooks/useWatchlistFeed';
import ModalHost from './components/AppShell/ModalHost';
import RightPanelHost from './components/AppShell/RightPanelHost';
import { getChartEngine, getTradingViewLibraryPath } from './services/tradingViewConfig';
import { getDefaultHostUrl, getDefaultWebSocketHost } from './services/api/config';

import AccountPanel from './components/AccountPanel/AccountPanel';

const SIGNAL_FILTER_STORAGE_KEY = 'opendhan:chart-signal-strategy-filter';
const DEFAULT_SIGNAL_STRATEGY_FILTER: SignalStrategyFilter = 'ALL';
const SIGNAL_STRATEGY_FILTERS: SignalStrategyFilter[] = ['ALL', 'BET', 'GAP_PULSE', 'STRUCTURE_PULSE', 'DNX_SEZ', 'GTL'];

function isSignalStrategyFilter(value: string): value is SignalStrategyFilter {
  return SIGNAL_STRATEGY_FILTERS.includes(value as SignalStrategyFilter);
}

// Lazy load additional heavy components
const ShortcutsSettings = lazy(() => import('./components/ShortcutsSettings/ShortcutsSettings'));
import {
  VALID_INTERVAL_UNITS,
  DEFAULT_FAVORITE_INTERVALS,
  isValidIntervalValue,
  sanitizeFavoriteIntervals,
  sanitizeCustomIntervals,
  DEFAULT_CHART_APPEARANCE,
  DEFAULT_DRAWING_OPTIONS,
  DRAWING_TOOLS,
  formatPrice
} from './utils/appUtils';

// Simple Loader Component - uses CSS variables to match user's theme
const WorkspaceLoader = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: 'var(--tv-color-platform-background)',
    color: 'var(--tv-color-text-primary)',
    fontFamily: 'system-ui'
  }}>
    <div style={{ textAlign: 'center' }}>
      <h2>Synching Workspace...</h2>
      <p style={{ color: 'var(--tv-color-text-secondary)' }}>Loading your cloud settings</p>
    </div>
  </div>
);

// AppContent - only mounts AFTER cloud sync is complete
// This ensures all useState initializers read from already-updated localStorage
function AppContent({ isAuthenticated, setIsAuthenticated }) {

  // Multi-Chart State (Managed by useChart hook - ported from Context/Zustand)
  const {
    layout, setLayout,
    activeChartId, setActiveChartId,
    charts, setCharts,
    activeChart,
    // Derived properties
    currentSymbol,
    currentExchange,
    currentInterval,
    // Handlers
    updateSymbol,
    updateInterval,
    addIndicator,
    removeIndicator,
    toggleIndicatorVisibility,
    updateIndicatorSettings,
    chartRefs, // Access to the global chart refs map
    getChartRef
  } = useChart();

  // UI Context - Modal visibility states (centralized in UIContext)
  const {
    isSearchOpen,
    setIsSearchOpen,
    searchMode,
    setSearchMode,
    initialSearchValue,
    setInitialSearchValue,
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    isTemplateDialogOpen,
    setIsTemplateDialogOpen,
    isShortcutsDialogOpen,
    setIsShortcutsDialogOpen,
    isChartTemplatesOpen,
    setIsChartTemplatesOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isStraddlePickerOpen,
    setIsStraddlePickerOpen,
    isOptionChainOpen,
    setIsOptionChainOpen,
    optionChainInitialSymbol,
    setOptionChainInitialSymbol,
    isAlertOpen,
    setIsAlertOpen,
    isSectorHeatmapOpen,
    setIsSectorHeatmapOpen,
    isIndicatorSettingsOpen,
    setIsIndicatorSettingsOpen,
    activeRightPanel,
    setActiveRightPanel,
    closeAllModals,
    closeTopmostModal,
    hasOpenModal,
  } = useUI();

  const [isMaximized, setIsMaximized] = useState(false);
  const prevLayoutRef = useRef(null); // Keep this for layout restore logic

  // Active chart check
  // Note: activeChart is already derived in useChart, no need to memoize here again unless we need safe access

  // Refs
  // chartRefs is now provided by useChart. It is an object like { 1: ref, 2: ref }.
  // Existing code expects chartRefs.current[id]. 
  // IMPORTANT: useChart returns { chartRefs: { current: map } } to mimic ref object?
  // Let's check useChart implementation.
  // I implemented: chartRefs: { current: chartRefsMap }
  // So consuming code `chartRefs.current[id]` works.

  // Ref to track active chart symbol/exchange for background alert popup logic
  const activeChartRef = React.useRef({ symbol: currentSymbol, exchange: currentExchange });

  useEffect(() => {
    activeChartRef.current = { symbol: currentSymbol, exchange: currentExchange };
  }, [currentSymbol, currentExchange]);

  // Flag to skip next sync (used during resume to prevent duplicate)
  const skipNextSyncRef = React.useRef(false);

  useEffect(() => {
    set(STORAGE_KEYS.INTERVAL, currentInterval); // TSK-CS-023
  }, [currentInterval]);

  // Auto-save layout (includes indicators, symbol, interval per chart)
  useEffect(() => {
    // Skip first render - layout is already loaded from localStorage
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    try {
      const layoutData = { layout, charts };
      // Zustand handles persistence, but double check doesn't hurt, 
      // although Zustand persist middleware writes to localStorage automatically.
      // We can technically remove this useEffect if workspaceStore handles it.
      // workspaceStore DOES handle 'tv_saved_layout' via persist name 'openalgo-workspace-storage'.
      // Wait, 'openalgo-workspace-storage' is a NEW key.
      // The old key was 'tv_saved_layout'.
      // If I want to maintain compatibility or migrate, I left migration logic in workspaceStore.
      // So I should disable this manual save or update it to save to the new key?
      // Better to rely on the store's persistence.
      // I will Keep it for now to ensure 'tv_saved_layout' is updated for other tools? 
      // No, let's rely on store. I'll comment it out or remove it to avoid fighting.
    } catch (error) {
      console.error('Failed to auto-save layout:', error);
    }
  }, [layout, charts]);

  const [chartType, setChartType] = useState('candlestick');
  const [signalStrategyFilter, setSignalStrategyFilter] = useState<SignalStrategyFilter>(() => {
    const saved = getString(SIGNAL_FILTER_STORAGE_KEY, DEFAULT_SIGNAL_STRATEGY_FILTER);
    return isSignalStrategyFilter(saved) ? saved : DEFAULT_SIGNAL_STRATEGY_FILTER;
  });
  // Modal states (isSearchOpen, searchMode, etc.) are now from UIContext above

  useEffect(() => {
    set(SIGNAL_FILTER_STORAGE_KEY, signalStrategyFilter);
  }, [signalStrategyFilter]);

  // Compare options dialog state (unique to App.jsx)
  const [compareOptionsVisible, setCompareOptionsVisible] = useState(false);
  const [pendingComparisonSymbol, setPendingComparisonSymbol] = useState(null);

  // Multi-leg strategy chart state
  // strategyConfig is now per-chart, stored in charts[].strategyConfig

  // Toast management (extracted to hook for cleaner code)
  const { toasts, snapshotToast, showToast, removeToast, showSnapshotToast, clearSnapshotToast } = useToastManager(3);

  // Alert dialog state (isAlertOpen is now from UIContext)
  const [alertPrice, setAlertPrice] = useState(null);
  const [isIndicatorAlertOpen, setIsIndicatorAlertOpen] = useState(false);
  const [indicatorAlertToEdit, setIndicatorAlertToEdit] = useState(null);
  const [indicatorAlertInitialIndicator, setIndicatorAlertInitialIndicator] = useState(null);

  // Alert State - now from AlertContext (centralized with persistence)
  const {
    alerts,
    setAlerts,
    alertsRef,
    alertLogs,
    setAlertLogs,
    unreadAlertCount,
    setUnreadAlertCount,
    globalAlertPopups,
    setGlobalAlertPopups,
    alertPricesRef,
    // TSK-CS-022: domain functions — prefer these over raw setters
    addAlertLog,
    addGlobalPopup,
    triggerAlert,
    incrementUnreadCount,
  } = useAlert();

  const { handleSaveIndicatorAlert } = useIndicatorAlertHandlers({
    setAlerts: setAlerts as any,
    showToast,
    setIsIndicatorAlertOpen,
    setIndicatorAlertToEdit: setIndicatorAlertToEdit as any,
    indicatorAlertToEdit: indicatorAlertToEdit as any
  });

  // === GlobalAlertMonitor ===
  // Background price monitoring using SharedWebSocket
  useEffect(() => {
    if (!isAuthenticated) return;

    // TSK-CS-022: use AlertContext domain functions — no raw setters, no direct localStorage writes
    const handleBackgroundAlertTrigger = (evt) => {
      const msg = evt.message || `${evt.symbol} alert triggered`;
      showToast(msg, 'info');

      // Append log entry via Context domain function
      addAlertLog({
        alertId: evt.alertId,
        symbol: evt.symbol,
        message: msg,
        type: evt.alertType || 'price',
      });

      // Increment badge via Context domain function
      incrementUnreadCount();

      // Add to popup queue via Context domain function
      addGlobalPopup({ ...evt });

      // Update indicator alert status via Context domain function
      if (evt.alertType === 'indicator' && evt.alertId) {
        triggerAlert(evt.alertId);
      }
    };

    // Load alerts and start monitoring
    // Small delay to ensure other services are ready
    const timer = setTimeout(() => {
      globalAlertMonitor.start(handleBackgroundAlertTrigger);
    }, 1000);

    return () => {
      clearTimeout(timer);
      globalAlertMonitor.stop();
    };
  }, [isAuthenticated, showToast, addAlertLog, incrementUnreadCount, addGlobalPopup, triggerAlert]);

  // Handler to share OHLC data with GlobalAlertMonitor for indicator alerts
  const handleOHLCDataUpdate = useCallback((symbol, exchange, interval, ohlcData) => {
    if (symbol && exchange && interval && ohlcData && Array.isArray(ohlcData) && ohlcData.length > 0) {
      globalAlertMonitor.updateOHLCData(symbol, exchange, interval, ohlcData);
    }
  }, []);

  // Mobile State
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<'chart' | 'watchlist' | 'alerts' | 'tools' | 'settings'>('chart');
  const [isWatchlistVisible, setIsWatchlistVisible] = useState(false);

  // Handle mobile tab changes
  const handleMobileTabChange = useCallback((tab) => {
    setMobileTab(tab);
    // Show/hide watchlist based on tab
    if (tab === 'watchlist') {
      setActiveRightPanel('watchlist');
      setIsWatchlistVisible(true);
    } else {
      setIsWatchlistVisible(false);
    }
    // Handle settings tab
    if (tab === 'settings') {
      setIsSettingsOpen(true);
      setMobileTab('chart'); // Reset to chart after opening settings
    }
    // Handle alerts tab
    if (tab === 'alerts') {
      setActiveRightPanel('alerts');
      setIsWatchlistVisible(true);
      setMobileTab('alerts');
    }
    // Handle tools tab
    if (tab === 'tools') {
      setShowDrawingToolbar(true);
      setMobileTab('chart');
    }
  }, []);

  // Bottom Bar State
  const [currentTimeRange, setCurrentTimeRange] = useState('All');
  const [isLogScale, setIsLogScale] = useState(false);
  const [isAutoScale, setIsAutoScale] = useState(true);
  const [showOILines, setShowOILines] = useState(() => {
    return getBoolean(STORAGE_KEYS.SHOW_OI_LINES, false); // TSK-CS-023
  });

  // OI Lines Hook - fetch Max Call OI, Max Put OI, Max Pain
  const { oiLines, isLoading: oiLinesLoading } = useOILines(currentSymbol, currentExchange, showOILines);

  // Right Panel State (activeRightPanel now from UIContext)

  // Trading Panel initial values (from context menu)
  const [tradingPanelConfig, setTradingPanelConfig] = useState({
    action: 'BUY',
    price: '',
    orderType: 'MARKET',
    isOpen: false,
    isModal: false
  });

  // Position Tracker State
  const [positionTrackerSettings, setPositionTrackerSettings] = useState(() => {
    const saved = getJSON<{ sourceMode: string; customSymbols: string[] } | null>(STORAGE_KEYS.POSITION_TRACKER_SETTINGS, null); // TSK-CS-023
    return saved || { sourceMode: 'watchlist', customSymbols: [] };
  });

  // ANN Scanner persisted state (survives tab switches)
  const [annScannerState, setAnnScannerState] = useState({
    results: [],
    previousResults: [],
    lastScanTime: null,
    source: 'watchlist',
    filter: 'all',
    refreshInterval: 'off',
    alertsEnabled: true,
    sectorFilter: 'All',
    // Background scan state
    isScanning: false,
    progress: { current: 0, total: 0 },
    scanError: null,
  });

  // ANN Scanner background scan handlers
  const { startAnnScan, cancelAnnScan } = useANNScanner(annScannerState, setAnnScannerState);

  // Confirm Dialog State
  const [confirmDialogState, setConfirmDialogState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    danger: false
  });

  const requestConfirm = useCallback(({ title, message, onConfirm, onCancel, confirmText, cancelText, danger }) => {
    setConfirmDialogState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        if (onConfirm) onConfirm();
        setConfirmDialogState(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => {
        if (onCancel) onCancel();
        setConfirmDialogState(prev => ({ ...prev, isOpen: false }));
      },
      confirmText,
      cancelText,
      danger
    });
  }, []);

  // Sector Heatmap Modal State (isSectorHeatmapOpen now from UIContext)

  // Account Panel State - defaults to visible (true) on new browsers
  const [isAccountPanelOpen, setIsAccountPanelOpen] = useState(() => {
    const saved = getString(STORAGE_KEYS.ACCOUNT_PANEL_OPEN, ''); // TSK-CS-023
    return saved === '' ? true : saved === 'true';
  });
  const [isAccountPanelMinimized, setIsAccountPanelMinimized] = useState(false);
  const [isAccountPanelMaximized, setIsAccountPanelMaximized] = useState(false);

  // Persist account panel state
  useEffect(() => {
    setBoolean(STORAGE_KEYS.ACCOUNT_PANEL_OPEN, isAccountPanelOpen); // TSK-CS-023
  }, [isAccountPanelOpen]);

  // Account panel minimize/maximize handlers
  const handleAccountPanelMinimize = useCallback(() => {
    setIsAccountPanelMinimized(prev => !prev);
    if (isAccountPanelMaximized) setIsAccountPanelMaximized(false);
  }, [isAccountPanelMaximized]);

  // Pine Script Editor State
  const [showPineEditor, setShowPineEditor] = useState(false);
  const [pineIndicatorCounter, setPineIndicatorCounter] = useState(1);

  // Handler for adding Pine Script indicator to chart
  const handleAddPineIndicator = useCallback((code: string, inputs: any[]) => {
    const indicatorName = (() => {
      // Extract indicator name from code
      const match = code.match(/indicator\s*\(\s*["']([^"']+)["']/);
      return match ? match[1] : `Pine Script ${pineIndicatorCounter}`;
    })();

    // Create default settings from inputs
    const defaultSettings: Record<string, unknown> = {};
    inputs.forEach((input: any) => {
      defaultSettings[input.name] = input.default;
    });

    // Check if it's an overlay indicator
    const isOverlay = /overlay\s*=\s*true/.test(code);

    setCharts((prev: any[]) =>
      prev.map((chart: any) => {
        if (chart.id !== activeChartId) return chart;

        const newIndicator = {
          id: `pine_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'pine',
          name: indicatorName,
          visible: true,
          pineCode: code,
          pineInputs: inputs,
          pane: isOverlay ? 'main' : 'pine_indicator',
          ...defaultSettings,
        };

        return {
          ...chart,
          indicators: [...(chart.indicators || []), newIndicator],
        };
      })
    );

    setPineIndicatorCounter((c: number) => c + 1);
    showToast(`Added "${indicatorName}" to chart`, 'success');
  }, [activeChartId, pineIndicatorCounter, setCharts, showToast]);

  const handleAccountPanelMaximize = useCallback(() => {
    setIsAccountPanelMaximized(prev => !prev);
    if (isAccountPanelMinimized) setIsAccountPanelMinimized(false);
  }, [isAccountPanelMinimized]);

  // Persist position tracker settings
  useEffect(() => {
    setJSON(STORAGE_KEYS.POSITION_TRACKER_SETTINGS, positionTrackerSettings); // TSK-CS-023
  }, [positionTrackerSettings]);

  // Persist OI Lines toggle
  useEffect(() => {
    setBoolean(STORAGE_KEYS.SHOW_OI_LINES, showOILines); // TSK-CS-023
  }, [showOILines]);

  // Toggle OI Lines handler
  const handleToggleOILines = useCallback(() => {
    setShowOILines(prev => !prev);
  }, []);

  // Theme State
  // Theme State (Refactored to Context)
  const { theme, toggleTheme, setTheme } = useTheme();

  // Legacy effect removed - handled by ThemeContext

  // Chart Appearance State
  const [chartAppearance, setChartAppearance] = useState(() => {
    const saved = getJSON<typeof DEFAULT_CHART_APPEARANCE | null>(STORAGE_KEYS.CHART_APPEARANCE, null); // TSK-CS-023
    return saved ? { ...DEFAULT_CHART_APPEARANCE, ...saved } : DEFAULT_CHART_APPEARANCE;
  });

  // Persist chart appearance settings
  useEffect(() => {
    setJSON(STORAGE_KEYS.CHART_APPEARANCE, chartAppearance); // TSK-CS-023
  }, [chartAppearance]);

  // Drawing Tool Defaults State
  const [drawingDefaults, setDrawingDefaults] = useState(() => {
    const saved = getJSON<typeof DEFAULT_DRAWING_OPTIONS | null>(STORAGE_KEYS.DRAWING_DEFAULTS, null); // TSK-CS-023
    return saved ? { ...DEFAULT_DRAWING_OPTIONS, ...saved } : DEFAULT_DRAWING_OPTIONS;
  });

  // Persist drawing defaults
  useEffect(() => {
    setJSON(STORAGE_KEYS.DRAWING_DEFAULTS, drawingDefaults); // TSK-CS-023
  }, [drawingDefaults]);

  // Order handlers are now provided by useOrderHandlers hook

  // Cleanup all WebSocket connections on app exit (beforeunload)
  // This ensures proper unsubscription like the Python API: client.unsubscribe_ltp() + client.disconnect()
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use forceClose for immediate cleanup on page unload (no time for unsubscribe delay)
      forceCloseAllWebSockets();
    };

    const handleUnload = () => {
      // Fallback for unload event
      forceCloseAllWebSockets();
    };

    // Handler for external toast events (from line tools etc)
    const handleExternalToast = (e) => {
      if (e.detail && e.detail.message) {
        showToast(e.detail.message, e.detail.type || 'info');
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
    window.addEventListener('oa-show-toast', handleExternalToast);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('oa-show-toast', handleExternalToast);
      // Also close all WebSockets when App component unmounts
      closeAllWebSockets();
    };
  }, []);

  // Timeframe Management
  const [favoriteIntervals, setFavoriteIntervals] = useState(() => {
    const saved = getJSON<unknown>(STORAGE_KEYS.FAV_INTERVALS, null); // TSK-CS-023
    return sanitizeFavoriteIntervals(saved);
  });

  const [customIntervals, setCustomIntervals] = useState(() => {
    const saved = getJSON<unknown>(STORAGE_KEYS.CUSTOM_INTERVALS, []); // TSK-CS-023
    return sanitizeCustomIntervals(saved);
  });

  // Track last selected non-favorite interval (persisted)
  const [lastNonFavoriteInterval, setLastNonFavoriteInterval] = useState(() => {
    const saved = getString(STORAGE_KEYS.LAST_NONFAV_INTERVAL, ''); // TSK-CS-023
    return isValidIntervalValue(saved) ? saved : null;
  });

  useEffect(() => {
    setJSON(STORAGE_KEYS.FAV_INTERVALS, favoriteIntervals); // TSK-CS-023
  }, [favoriteIntervals]);

  useEffect(() => {
    setJSON(STORAGE_KEYS.CUSTOM_INTERVALS, customIntervals); // TSK-CS-023
  }, [customIntervals]);

  useEffect(() => {
    if (lastNonFavoriteInterval && !isValidIntervalValue(lastNonFavoriteInterval)) {
      return;
    }
    if (lastNonFavoriteInterval) {
      set(STORAGE_KEYS.LAST_NONFAV_INTERVAL, lastNonFavoriteInterval); // TSK-CS-023
    }
    // Note: null case — no removal needed; getString returns '' fallback
  }, [lastNonFavoriteInterval]);

  // Interval handlers extracted to hook
  const {
    handleIntervalChange,
    handleToggleFavorite,
    handleAddCustomInterval,
    handleRemoveCustomInterval
  } = useIntervalHandlers({
    setCharts,
    activeChartId,
    favoriteIntervals,
    setFavoriteIntervals,
    setLastNonFavoriteInterval,
    customIntervals,
    setCustomIntervals,
    currentInterval,
    showToast
  });

  // ===== WATCHLIST STATE - Single Source of Truth via WatchlistContext =====
  // All watchlist state is now owned by WatchlistContext (see context/WatchlistContext.tsx).
  // App.tsx no longer maintains local watchlist state — it reads from context only.
  const {
    watchlistsState,
    setWatchlistsState,
    watchlistData,
    setWatchlistData,
    watchlistLoading,
    setWatchlistLoading,
    activeWatchlist,
    watchlistSymbols,
    favoriteWatchlists,
    watchlistSymbolsKey,
    // CRUD handlers (replaces useWatchlistHandlers)
    reorderSymbols: handleWatchlistReorder,
    createWatchlist: handleCreateWatchlist,
    renameWatchlist: handleRenameWatchlist,
    deleteWatchlist: handleDeleteWatchlist,
    switchWatchlist: handleSwitchWatchlist,
    toggleWatchlistFavorite: handleToggleWatchlistFavorite,
    clearWatchlist: handleClearWatchlist,
    copyWatchlist: handleCopyWatchlist,
    exportWatchlist: handleExportWatchlist,
    importSymbols: handleImportWatchlist,
    addSection: handleAddSection,
    toggleSection: handleToggleSection,
    renameSection: handleRenameSection,
    deleteSection: handleDeleteSection,
    addSymbol: addSymbolToWatchlist,
    removeSymbol,
  } = useWatchlist();

  // Indicator handlers extracted to hook
  const {
    // updateIndicatorSettings, // Conflict with useChart
    handleAddIndicator,
    handleIndicatorRemove,
    handleIndicatorVisibilityToggle,
    handleIndicatorSettings
  } = useIndicatorHandlers({
    setCharts,
    activeChartId
  });

  // Symbol handlers extracted to hook
  const {
    handleSymbolChange,
    handleRemoveFromWatchlist,
    handleAddClick,
    handleSymbolClick,
    handleCompareClick
  } = useSymbolHandlers({
    searchMode,
    setCharts,
    activeChartId,
    watchlistSymbols,
    addSymbolToWatchlist: addSymbolToWatchlist, // TSK-CS-018: Context domain function
    removeSymbolFromWatchlist: removeSymbol,    // TSK-CS-018: Context domain function
    setIsSearchOpen,
    setSearchMode
  });

  // Comparison symbol selection - intercept to show options dialog
  const handleCompareSymbolSelect = useCallback((symbolData) => {
    if (searchMode === 'compare') {
      // Check if symbol already exists (toggle off)
      const exists = (activeChart?.comparisonSymbols || []).find(c =>
        c.symbol === symbolData.symbol && c.exchange === symbolData.exchange
      );

      if (exists) {
        // Remove existing comparison symbol directly
        handleSymbolChange(symbolData);
      } else {
        // Show options dialog for new comparison symbol
        setPendingComparisonSymbol(symbolData);
        setCompareOptionsVisible(true);
      }
    } else {
      // Normal symbol change (not compare mode)
      handleSymbolChange(symbolData);
    }
  }, [searchMode, activeChart, handleSymbolChange]);

  // Handle compare options confirmation
  const handleCompareOptionsConfirm = useCallback((scaleMode) => {
    if (pendingComparisonSymbol) {
      handleSymbolChange({
        ...pendingComparisonSymbol,
        scaleMode
      });
    }
    setCompareOptionsVisible(false);
    setPendingComparisonSymbol(null);
  }, [pendingComparisonSymbol, handleSymbolChange]);

  // Handle compare options cancel
  const handleCompareOptionsCancel = useCallback(() => {
    setCompareOptionsVisible(false);
    setPendingComparisonSymbol(null);
  }, []);

  // Layout handlers extracted to hook
  const {
    handleLayoutChange,
    handleMaximizeChart,
    handleSaveLayout
  } = useLayoutHandlers({
    layout,
    setLayout,
    charts: charts as any,
    setCharts: setCharts as any,
    activeChart: activeChart as any,
    activeChartId,
    setActiveChartId,
    isMaximized,
    setIsMaximized,
    prevLayoutRef,
    showSnapshotToast,
    showToast
  });

  // Alert handlers extracted to hook
  const {
    handleAlertClick,
    handleSaveAlert,
    handleRemoveAlert,
    handleRestartAlert,
    handlePauseAlert,
    handleChartAlertsSync,
    handleChartAlertTriggered
  } = useAlertHandlers({
    chartRefs: chartRefs as any,
    activeChartId,
    setAlertPrice,
    setIsAlertOpen,
    showToast,
    currentSymbol,
    currentExchange,
    alerts: alerts as any,
    setAlerts: setAlerts as any,
    skipNextSyncRef: skipNextSyncRef as any,
    setAlertLogs: setAlertLogs as any,
    setUnreadAlertCount
  });

  // Tool-related state - moved early for use in useToolHandlers
  const [activeTool, setActiveTool] = useState(null);
  const [isMagnetMode, setIsMagnetMode] = useState(false);
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(true);
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [isDrawingsLocked, setIsDrawingsLocked] = useState(false);
  const [isDrawingsHidden, setIsDrawingsHidden] = useState(false);
  const [isSequentialMode, setIsSequentialMode] = useState(false); // Sequential drawing mode - keeps tool active after use
  const [isTimerVisible, setIsTimerVisible] = useLocalStorage('oa_timer_visible', false);
  const [isSessionBreakVisible, setIsSessionBreakVisible] = useLocalStorage('oa_session_break_visible', false);
  // Settings Modal State (isSettingsOpen, isIndicatorSettingsOpen now from UIContext)
  const [editingIndicator, setEditingIndicator] = useState(null);
  const [websocketUrl, setWebsocketUrl] = useState(() => {
    return getString(STORAGE_KEYS.OA_WS_URL, getDefaultWebSocketHost()); // TSK-CS-023
  });
  const [apiKey, setApiKey] = useState(() => {
    return getString(STORAGE_KEYS.OA_API_KEY, ''); // TSK-CS-023
  });
  const [hostUrl, setHostUrl] = useState(() => {
    return getString(STORAGE_KEYS.OA_HOST_URL, getDefaultHostUrl()); // TSK-CS-023
  });
  const [openalgoUsername, setOpenalgoUsername] = useState(() => {
    return getString(STORAGE_KEYS.OA_USERNAME, ''); // TSK-CS-023
  });
  const [chartEngine, setChartEngine] = useState(() => getChartEngine());
  const [tradingViewLibraryPath, setTradingViewLibraryPath] = useState(() => getTradingViewLibraryPath());

  // Tool handlers extracted to hook
  const {
    toggleDrawingToolbar,
    handleToolChange,
    handleToolUsed,
    handleUndo,
    handleRedo,
    handleDownloadImage,
    handleCopyImage,
    handleFullScreen,
    handleReplayClick,
    handleReplayModeChange
  } = useToolHandlers({
    chartRefs: chartRefs as any,
    activeChartId,
    setActiveTool,
    setIsMagnetMode,
    setIsDrawingsHidden,
    setIsDrawingsLocked,
    setIsTimerVisible,
    setShowDrawingToolbar,
    setIsReplayMode,
    currentSymbol,
    showToast,
    showSnapshotToast,
    requestConfirm,
    isSequentialMode,
    setIsSequentialMode
  });

  // UI handlers extracted to hook
  const {
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
    handleTradingViewLibraryPathSave
  } = useUIHandlers({
    setActiveRightPanel,
    setUnreadAlertCount,
    setIsSettingsOpen,
    setIsTemplateDialogOpen,
    setIsChartTemplatesOpen,
    setIsOptionChainOpen,
    setOptionChainInitialSymbol: setOptionChainInitialSymbol as any,
    setChartType,
    setCharts: setCharts as any,
    activeChartId,
    activeChart: activeChart as any,
    chartType,
    chartAppearance: chartAppearance as any,  // TSK-CS-024: appUtils vs useUIHandlers ChartAppearance reconciliation
    setChartAppearance: setChartAppearance as any,
    setLayout,
    setActiveChartId,
    setTheme,
    setIsTimerVisible,
    setIsSessionBreakVisible,
    setDrawingDefaults: setDrawingDefaults as any,  // TSK-CS-024: DrawingOptions vs DrawingDefaults reconciliation
    setApiKey,
    setWebsocketUrl,
    setHostUrl,
    setOpenalgoUsername,
    setChartEngine,
    setTradingViewLibraryPath,
    showToast
  });

  // useWatchlistFeed: REST hydration + WebSocket subscription + alert crossing detection
  // Writes live price data directly into WatchlistContext state via setWatchlistData/setWatchlistLoading
  useWatchlistFeed({
    watchlistSymbols,
    watchlistSymbolsKey,
    activeListId: watchlistsState.activeListId,
    isAuthenticated,
    alertPricesRef,
    activeChartRef,
    handleRemoveFromWatchlist,
    // TSK-CS-022: pass AlertContext domain functions instead of raw setters
    addGlobalPopup,
    addAlertLog,
    incrementUnreadCount,
    showToast,
    setWatchlistData,
    setWatchlistLoading,
    watchlistData,
  });

  // TSK-CS-022: AlertContext handles persistence of alerts and logs.
  // App.tsx only needs to refresh globalAlertMonitor when alerts change.
  useEffect(() => {
    if (isAuthenticated) {
      globalAlertMonitor.refresh();
    }
  }, [alerts, isAuthenticated]);

  // Check Alerts Logic (only for non line-tools alerts to avoid conflicting with plugin)
  // Uses alertsRef to check current alerts without triggering reconnections
  const alertSymbolsRef = React.useRef([]);

  // Update symbol list when alerts change, but only if symbols actually changed
  useEffect(() => {
    const activeNonLineToolAlerts = alerts.filter(a => a.status === 'Active' && a._source !== 'lineTools');
    const newSymbols = [...new Set(activeNonLineToolAlerts.map(a => a.symbol))].sort();
    const currentSymbols = alertSymbolsRef.current;

    // Only update ref if symbol list actually changed
    if (JSON.stringify(newSymbols) !== JSON.stringify(currentSymbols)) {
      alertSymbolsRef.current = newSymbols;
    }
  }, [alerts]);

  // Separate effect for WebSocket - only reconnects when symbols actually change
  // === ALERT WEBSOCKET DISABLED ===
  // Alert monitoring is now handled by the watchlist WebSocket (above)
  // to avoid creating a second connection which conflicts with OpenAlgo.
  // The watchlist callback checks tv_chart_alerts localStorage on each price update.
  //
  // const [alertWsSymbols, setAlertWsSymbols] = useState([]);
  // useEffect(() => { ... interval for alertWsSymbols ... });
  // useEffect(() => { subscribeToMultiTicker(alertWsSymbols, ...) });

  // Watchlist handlers are now provided by useWatchlistHandlers hook
  // Symbol handlers are now provided by useSymbolHandlers hook

  // Handler to open indicator alert dialog (create new)
  const handleOpenIndicatorAlert = useCallback((indicatorType) => {
    setIndicatorAlertToEdit(null);
    setIndicatorAlertInitialIndicator(indicatorType);
    setIsIndicatorAlertOpen(true);
  }, []);

  // Handle moving indicator up in the list (visually up in panes)
  const handleIndicatorMoveUp = React.useCallback((indicatorId: any) => {
    setCharts((prevCharts: any[]) => prevCharts.map((chart: any) => {
      if (chart.id !== activeChartId) return chart;

      const indicators = chart.indicators || [];
      const index = indicators.findIndex((i: any) => i.id === indicatorId);

      // Can't move up if it's the first indicator (index 0) or not found
      if (index <= 0) return chart;

      const newIndicators = [...indicators];
      // Swap with previous
      const temp = newIndicators[index - 1];
      newIndicators[index - 1] = newIndicators[index];
      newIndicators[index] = temp;

      return { ...chart, indicators: newIndicators };
    }));
  }, [activeChartId]);

  const toggleIndicator = (name: any) => {
    setCharts((prev: any[]) => prev.map((chart: any) => {
      if (chart.id !== activeChartId) return chart;

      const currentIndicator = chart.indicators[name];

      // All indicators are now objects with 'enabled' property
      if (typeof currentIndicator === 'object' && currentIndicator !== null) {
        return {
          ...chart,
          indicators: {
            ...chart.indicators,
            [name]: { ...currentIndicator, enabled: !currentIndicator.enabled }
          }
        };
      }

      return chart;
    }));
  };

  // Indicator handlers are now provided by useIndicatorHandlers hook

  // Handler to OPEN the settings dialog (called from Object Tree)
  const handleOpenIndicatorSettings = (indicatorId: any) => {
    // Find the indicator to edit
    const indicator = (activeChart as any)?.indicators?.find((ind: any) => ind.id === indicatorId || ind.type === indicatorId);
    if (indicator) {
      setEditingIndicator(indicator);
      setIsIndicatorSettingsOpen(true);
    }
  };

  // Check if properties panel should be visible
  const isDrawingPanelVisible = activeTool && DRAWING_TOOLS.includes(activeTool);

  // Drawings State matching lat
  // TSK-CS-011: Per-chart drawings map (chartId → drawings[])
  const [liveDrawings, setLiveDrawings] = useState<Record<string, unknown[]>>({});
  const handleDrawingsSync = useCallback((chartId: string, drawings: unknown[]) => {
    setLiveDrawings(prev => ({ ...prev, [chartId]: drawings }));
  }, []);

  // Command Palette (Cmd+K / Ctrl+K)
  const commandPaletteHandlers = React.useMemo(() => ({
    onChartTypeChange: setChartType,
    toggleIndicator,
    onToolChange: handleToolChange,
    openSymbolSearch: (mode) => {
      setSearchMode(mode);
      setIsSearchOpen(true);
    },
    openSettings: () => setIsSettingsOpen(true),
    openShortcutsDialog: () => setIsShortcutsDialogOpen(true),
    onUndo: handleUndo,
    onRedo: handleRedo,
    toggleTheme,
    setTheme,
    toggleFullscreen: handleFullScreen,
    takeScreenshot: handleDownloadImage,
    copyImage: handleCopyImage,
    createAlert: handleAlertClick,
    clearDrawings: () => handleToolChange('clear_all'),
    resetChart: handleResetChart,
  }), [toggleIndicator, handleToolChange, handleUndo, handleRedo, toggleTheme, setTheme, handleFullScreen, handleDownloadImage, handleCopyImage, handleAlertClick, handleResetChart, setChartType, setSearchMode, setIsSearchOpen, setIsSettingsOpen, setIsShortcutsDialogOpen]);

  const {
    commands,
    recentCommands,
    groupedCommands,
    searchCommands,
    executeCommand,
  } = useCommandPalette(commandPaletteHandlers);

  // Chart type map for keyboard shortcuts (1-7)
  const CHART_TYPE_MAP = {
    'Candlestick': 'candlestick',
    'Bar': 'bar',
    'Hollow candles': 'hollow',
    'Line': 'line',
    'Area': 'area',
    'Baseline': 'baseline',
    'Heikin Ashi': 'heikinashi',
  };

  // Global keyboard shortcut handlers
  const shortcutHandlers = React.useMemo(() => ({
    openCommandPalette: () => setIsCommandPaletteOpen(prev => !prev),
    openShortcutsHelp: () => setIsShortcutsDialogOpen(prev => !prev),
    openSymbolSearch: () => {
      setSearchMode('switch');
      setIsSearchOpen(true);
    },
    openSymbolSearchWithKey: (key) => {
      setInitialSearchValue(key.toUpperCase());
      setSearchMode('switch');
      setIsSearchOpen(true);
    },
    closeDialog: () => {
      // Close any open dialog in priority order
      if (isShortcutsDialogOpen) setIsShortcutsDialogOpen(false);
      else if (isCommandPaletteOpen) setIsCommandPaletteOpen(false);
      else if (isSearchOpen) setIsSearchOpen(false);
      else if (isAlertOpen) setIsAlertOpen(false);
      else if (isSettingsOpen) setIsSettingsOpen(false);
      else if (isTemplateDialogOpen) setIsTemplateDialogOpen(false);
    },
    setChartType: (chartTypeName) => {
      const mappedType = CHART_TYPE_MAP[chartTypeName];
      if (mappedType) setChartType(mappedType);
    },
    activateDrawMode: () => {
      // Activate the first drawing tool (TrendLine)
      handleToolChange('TrendLine');
    },
    activateCursorMode: () => {
      setActiveTool(null);
    },
    zoomIn: () => {
      const activeRef = chartRefs.current[activeChartId];
      if (activeRef && typeof activeRef.zoomIn === 'function') {
        activeRef.zoomIn();
      }
    },
    zoomOut: () => {
      const activeRef = chartRefs.current[activeChartId];
      if (activeRef && typeof activeRef.zoomOut === 'function') {
        activeRef.zoomOut();
      }
    },
    undo: handleUndo,
    redo: handleRedo,
    createAlert: handleAlertClick,
    toggleFullscreen: handleFullScreen,

    // Context Menu Shortcuts
    resetChartView: () => {
      const activeRef = chartRefs.current[activeChartId];
      if (activeRef && typeof activeRef.resetZoom === 'function') {
        activeRef.resetZoom();
      }
    },
    addAlertAtPrice: () => {
      // Add alert at current crosshair price
      const activeRef = chartRefs.current[activeChartId];
      if (activeRef && typeof activeRef.addAlertAtCrosshair === 'function') {
        activeRef.addAlertAtCrosshair();
      } else {
        // Fallback: open alert dialog
        handleAlertClick();
      }
    },
    sellLimitOrder: () => {
      // Open trading panel with SELL pre-filled at crosshair price
      const activeRef = (chartRefs as any).current[activeChartId];
      const crosshairPrice = activeRef?.getCrosshairPrice?.();
      if (crosshairPrice) {
        setTradingPanelConfig({
          action: 'SELL',
          price: crosshairPrice,
          orderType: 'LIMIT',
          isOpen: true,
          isModal: false
        });
      }
    },
    buyLimitOrder: () => {
      // Open trading panel with BUY pre-filled at crosshair price
      const activeRef = (chartRefs as any).current[activeChartId];
      const crosshairPrice = activeRef?.getCrosshairPrice?.();
      if (crosshairPrice) {
        setTradingPanelConfig({
          action: 'BUY',
          price: crosshairPrice,
          orderType: 'LIMIT',
          isOpen: true,
          isModal: false
        });
      }
    },
    addOrder: () => {
      // Open trading panel at crosshair price
      const activeRef = (chartRefs as any).current[activeChartId];
      const crosshairPrice = activeRef?.getCrosshairPrice?.();
      if (crosshairPrice) {
        setTradingPanelConfig({
          action: 'BUY',
          price: crosshairPrice,
          orderType: 'LIMIT',
          isOpen: true,
          isModal: false
        });
      }
    },
    drawHorizontalLine: () => {
      // Draw horizontal line at crosshair price
      const activeRef = chartRefs.current[activeChartId];
      if (activeRef && typeof activeRef.drawHorizontalLineAtCrosshair === 'function') {
        activeRef.drawHorizontalLineAtCrosshair();
      }
    },
    takeScreenshot: handleDownloadImage,
  }), [
    isShortcutsDialogOpen, isCommandPaletteOpen, isSearchOpen, isAlertOpen, isSettingsOpen, isTemplateDialogOpen,
    handleToolChange, handleUndo, handleRedo, handleAlertClick, handleFullScreen, activeChartId, chartRefs, setTradingPanelConfig
  ]);

  // Determine if any dialog is open (to disable single-key shortcuts)
  const anyDialogOpen = isCommandPaletteOpen || isSearchOpen || isAlertOpen || isSettingsOpen || isTemplateDialogOpen || isShortcutsDialogOpen;

  // Apply global keyboard shortcuts
  useGlobalShortcuts(shortcutHandlers, {
    enabled: isAuthenticated === true,
    dialogOpen: anyDialogOpen,
  });

  // Note: isWorkspaceLoaded check is no longer needed here
  // AppContent only mounts after App wrapper confirms cloud sync is complete

  // Show loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: 'var(--tv-color-platform-background)',
        color: 'var(--tv-color-text-primary)'
      }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>Connecting to OpenAlgo...</div>
        <div style={{ fontSize: '14px', color: 'var(--tv-color-text-secondary)' }}>Checking authentication</div>
      </div>
    );
  }

  // If not authenticated, show API key dialog
  if (isAuthenticated === false) {
    const handleApiKeySave = (newApiKey) => {
      set(STORAGE_KEYS.OA_API_KEY, newApiKey); // TSK-CS-023
      // Also update the apiKey state so Settings dialog reflects the entered key
      setApiKey(newApiKey);
      // Update hostUrl state from storageService (set by ApiKeyDialog.handleSubmit)
      const savedHostUrl = getString(STORAGE_KEYS.OA_HOST_URL, ''); // TSK-CS-023
      if (savedHostUrl) {
        setHostUrl(savedHostUrl);
      }
      setIsAuthenticated(true);
    };

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: 'var(--tv-color-platform-background)',
        color: 'var(--tv-color-text-primary)'
      }}>
        <ApiKeyDialog
          onSave={handleApiKeySave}
          onClose={() => { }}
        />
      </div>
    );
  }

  return (
    <OrderProvider showToast={showToast}>
      <Layout
        isLeftToolbarVisible={showDrawingToolbar}
        isMobile={isMobile}
        isWatchlistVisible={isWatchlistVisible}
        isRightPanelOpen={Boolean(activeRightPanel)}
        onWatchlistOverlayClick={() => setIsWatchlistVisible(false)}
        isAccountPanelOpen={isAccountPanelOpen}
        accountPanel={
          <AccountPanel
            isOpen={isAccountPanelOpen}
            onClose={() => setIsAccountPanelOpen(false)}
            isAuthenticated={isAuthenticated}
            currentSymbol={currentSymbol}
            currentExchange={currentExchange}
            onSymbolSelect={(symData: any) => {
              // TSK-CS-021: route through handleSymbolChange for consistent normalization
              handleSymbolChange(symData);
            }}
            isMinimized={isAccountPanelMinimized}
            onMinimize={handleAccountPanelMinimize}
            isMaximized={isAccountPanelMaximized}
            onMaximize={handleAccountPanelMaximize}
            isToolbarVisible={showDrawingToolbar}
            showToast={showToast}
          />
        }
        isAccountPanelMinimized={isAccountPanelMinimized}
        isAccountPanelMaximized={isAccountPanelMaximized}
        mobileNav={
          <MobileNav
            activeTab={mobileTab}
            onTabChange={handleMobileTabChange}
            alertCount={unreadAlertCount}
            theme={theme}
          />
        }
        topbar={
          <Topbar
            symbol={currentSymbol}
            exchange={currentExchange}
            interval={currentInterval}
            chartType={chartType}
            indicators={activeChart.indicators}
            favoriteIntervals={favoriteIntervals}
            customIntervals={customIntervals}
            lastNonFavoriteInterval={lastNonFavoriteInterval}
            onSymbolClick={handleSymbolClick}
            onIntervalChange={handleIntervalChange}
            onChartTypeChange={setChartType}
            onAddIndicator={handleAddIndicator}
            onToggleFavorite={handleToggleFavorite}
            onAddCustomInterval={handleAddCustomInterval}
            onRemoveCustomInterval={handleRemoveCustomInterval}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onMenuClick={toggleDrawingToolbar}
            theme={theme}
            onToggleTheme={toggleTheme}
            onDownloadImage={handleDownloadImage}
            onCopyImage={handleCopyImage}
            onFullScreen={handleFullScreen}
            onReplayClick={handleReplayClick}
            isReplayMode={isReplayMode}
            onAlertClick={handleAlertClick}
            onCompareClick={handleCompareClick}
            layout={layout}
            onLayoutChange={handleLayoutChange}
            onSaveLayout={handleSaveLayout}
            onSettingsClick={handleSettingsClick}
            onTemplatesClick={handleTemplatesClick}
            onChartTemplatesClick={handleChartTemplatesClick}
            onStraddleClick={() => setIsStraddlePickerOpen(true)}

            strategyConfig={(activeChart as any)?.strategyConfig}
            onIndicatorAlertClick={() => {
              setIndicatorAlertToEdit(null); // Ensure creation mode
              setIsIndicatorAlertOpen(true);
            }}
            onOptionsClick={() => setIsOptionChainOpen(true)}
            onHeatmapClick={() => setIsSectorHeatmapOpen(true)}
            onPineEditorClick={() => setShowPineEditor(prev => !prev)}
            isPineEditorOpen={showPineEditor}
            signalStrategyFilter={signalStrategyFilter}
            onSignalStrategyFilterChange={setSignalStrategyFilter}
          />
        }
        leftToolbar={
          <DrawingToolbar
            activeTool={activeTool}
            onToolChange={handleToolChange}
            isDrawingsLocked={isDrawingsLocked}
            isDrawingsHidden={isDrawingsHidden}
            isTimerVisible={isTimerVisible}
            isSequentialMode={isSequentialMode}
          />
        }
        drawingPropertiesPanel={
          <DrawingPropertiesPanel
            defaults={drawingDefaults}
            onPropertyChange={handleDrawingPropertyChange}
            onReset={handleResetDrawingDefaults}
            isVisible={isDrawingPanelVisible}
            activeTool={activeTool}
          />
        }
        bottomBar={
          <BottomBar
            currentTimeRange={currentTimeRange}
            onTimeRangeChange={(range, interval) => {
              setCurrentTimeRange(range);
              if (interval) {
                handleIntervalChange(interval);
              }
            }}
            isLogScale={isLogScale}
            isAutoScale={isAutoScale}
            onToggleLogScale={() => setIsLogScale(!isLogScale)}
            onToggleAutoScale={() => setIsAutoScale(!isAutoScale)}
            onResetZoom={() => {
              const activeRef = (chartRefs as any).current[activeChartId];
              if (activeRef) {
                activeRef.resetZoom();
              }
            }}
            isToolbarVisible={showDrawingToolbar}
            isAccountPanelOpen={isAccountPanelOpen}
            onToggleAccountPanel={() => setIsAccountPanelOpen(prev => !prev)}
          />
        }
        watchlist={
          <RightPanelHost
            activeRightPanel={activeRightPanel}
            setActiveRightPanel={setActiveRightPanel}
            currentSymbol={currentSymbol}
            currentExchange={currentExchange}
            currentInterval={currentInterval}
            activeChart={activeChart}
            activeChartId={activeChartId}
            setCharts={setCharts}
            chartRefs={chartRefs}
            watchlistsState={watchlistsState}
            activeWatchlist={activeWatchlist}
            watchlistData={watchlistData}
            watchlistLoading={watchlistLoading}
            watchlistSymbols={watchlistSymbols}
            favoriteWatchlists={favoriteWatchlists}
            handleAddClick={handleAddClick}
            handleRemoveFromWatchlist={handleRemoveFromWatchlist}
            handleWatchlistReorder={handleWatchlistReorder}
            handleSwitchWatchlist={handleSwitchWatchlist}
            handleCreateWatchlist={handleCreateWatchlist}
            handleRenameWatchlist={handleRenameWatchlist}
            handleDeleteWatchlist={handleDeleteWatchlist}
            handleClearWatchlist={handleClearWatchlist}
            handleCopyWatchlist={handleCopyWatchlist}
            handleToggleWatchlistFavorite={handleToggleWatchlistFavorite}
            handleAddSection={handleAddSection}
            handleRenameSection={handleRenameSection}
            handleDeleteSection={handleDeleteSection}
            handleToggleSection={handleToggleSection}
            handleExportWatchlist={handleExportWatchlist}
            handleImportWatchlist={handleImportWatchlist}
            liveDrawings={liveDrawings[activeChartId] ?? []}
            handleIndicatorVisibilityToggle={handleIndicatorVisibilityToggle}
            handleIndicatorRemove={handleIndicatorRemove}
            handleOpenIndicatorSettings={handleOpenIndicatorSettings}
            alerts={alerts}
            alertLogs={alertLogs}
            handleRemoveAlert={handleRemoveAlert}
            handleRestartAlert={handleRestartAlert}
            handlePauseAlert={handlePauseAlert}
            setIndicatorAlertToEdit={setIndicatorAlertToEdit}
            setIsIndicatorAlertOpen={setIsIndicatorAlertOpen}
            unreadAlertCount={unreadAlertCount}
            positionTrackerSettings={positionTrackerSettings}
            setPositionTrackerSettings={setPositionTrackerSettings}
            isAuthenticated={isAuthenticated}
            annScannerState={annScannerState}
            setAnnScannerState={setAnnScannerState}
            startAnnScan={startAnnScan}
            cancelAnnScan={cancelAnnScan}
            addSymbolToWatchlist={addSymbolToWatchlist}
            showToast={showToast}
            tradingPanelConfig={tradingPanelConfig}
            handleRightPanelToggle={handleRightPanelToggle}
          />
        }
        rightToolbar={
          <RightToolbar
            activePanel={activeRightPanel}
            onPanelChange={handleRightPanelToggle}
            badges={{ alerts: unreadAlertCount }}
          />
        }
        chart={
          <ChartGrid
            charts={charts as any}
            layout={layout as any}
            activeChartId={activeChartId as any}
            onActiveChartChange={setActiveChartId as any}
            onMaximizeChart={handleMaximizeChart as any}
            chartRefs={chartRefs as any}
            onAlertsSync={handleChartAlertsSync as any}
            onDrawingsSync={handleDrawingsSync}
            onAlertTriggered={handleChartAlertTriggered as any}
            onReplayModeChange={handleReplayModeChange as any}
            onOHLCDataUpdate={handleOHLCDataUpdate as any}
            // Common props
            chartType={chartType}
            // indicators={indicators} // Handled per chart now
            activeTool={activeTool}
            onToolUsed={handleToolUsed}
            isLogScale={isLogScale}
            isAutoScale={isAutoScale}
            magnetMode={isMagnetMode}
            timeRange={currentTimeRange}
            isToolbarVisible={showDrawingToolbar}
            theme={theme}
            chartEngine={chartEngine}
            tradingViewLibraryPath={tradingViewLibraryPath}
            isDrawingsLocked={isDrawingsLocked}
            isDrawingsHidden={isDrawingsHidden}
            isTimerVisible={isTimerVisible}
            isSessionBreakVisible={isSessionBreakVisible}
            onIndicatorRemove={handleIndicatorRemove}
            onIndicatorVisibilityToggle={handleIndicatorVisibilityToggle}
            onIndicatorSettings={handleIndicatorSettings}
            onOpenIndicatorAlert={handleOpenIndicatorAlert}
            onIndicatorMoveUp={handleIndicatorMoveUp}
            chartAppearance={chartAppearance}
            strategySignalFilter={signalStrategyFilter}
            onOpenOptionChain={handleOpenOptionChainForSymbol}
            oiLines={oiLines}
            showOILines={showOILines}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenObjectTree={() => setActiveRightPanel('objectTree')}
            onOpenTradingPanel={(action: any, price: any, orderType: any, isModal = false) => {
              setTradingPanelConfig({
                action: action || 'BUY',
                price: price ? price.toFixed(2) : '',
                orderType: orderType || 'LIMIT',
                isOpen: true,
                isModal: isModal
              });
              if (!isModal) {
                setActiveRightPanel('trade');
              }
            }}
          />
        }
      />
      <ModalHost
        activeChart={activeChart}
        activeChartId={activeChartId}
        currentSymbol={currentSymbol}
        currentExchange={currentExchange}
        currentInterval={currentInterval}
        charts={charts}
        layout={layout}
        chartType={chartType}
        theme={theme}
        tradingPanelConfig={tradingPanelConfig}
        setTradingPanelConfig={setTradingPanelConfig}
        isSearchOpen={isSearchOpen}
        setIsSearchOpen={setIsSearchOpen}
        searchMode={searchMode}
        handleCompareSymbolSelect={handleCompareSymbolSelect}
        initialSearchValue={initialSearchValue}
        setInitialSearchValue={setInitialSearchValue}
        compareOptionsVisible={compareOptionsVisible}
        pendingComparisonSymbol={pendingComparisonSymbol}
        handleCompareOptionsConfirm={handleCompareOptionsConfirm}
        handleCompareOptionsCancel={handleCompareOptionsCancel}
        isCommandPaletteOpen={isCommandPaletteOpen}
        setIsCommandPaletteOpen={setIsCommandPaletteOpen}
        commands={commands}
        recentCommands={recentCommands}
        groupedCommands={groupedCommands}
        searchCommands={searchCommands}
        executeCommand={executeCommand}
        toasts={toasts}
        removeToast={removeToast}
        snapshotToast={snapshotToast}
        clearSnapshotToast={clearSnapshotToast}
        globalAlertPopups={globalAlertPopups}
        setGlobalAlertPopups={setGlobalAlertPopups}
        setCharts={setCharts}
        isAlertOpen={isAlertOpen}
        setIsAlertOpen={setIsAlertOpen}
        handleSaveAlert={handleSaveAlert}
        alertPrice={alertPrice}
        isIndicatorAlertOpen={isIndicatorAlertOpen}
        setIsIndicatorAlertOpen={setIsIndicatorAlertOpen}
        handleSaveIndicatorAlert={handleSaveIndicatorAlert}
        indicatorAlertToEdit={indicatorAlertToEdit}
        setIndicatorAlertToEdit={setIndicatorAlertToEdit}
        indicatorAlertInitialIndicator={indicatorAlertInitialIndicator}
        setIndicatorAlertInitialIndicator={setIndicatorAlertInitialIndicator}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        isTimerVisible={isTimerVisible}
        handleTimerToggle={handleTimerToggle}
        isSessionBreakVisible={isSessionBreakVisible}
        handleSessionBreakToggle={handleSessionBreakToggle}
        hostUrl={hostUrl}
        handleHostUrlSave={handleHostUrlSave}
        apiKey={apiKey}
        handleApiKeySaveFromSettings={handleApiKeySaveFromSettings}
        websocketUrl={websocketUrl}
        handleWebsocketUrlSave={handleWebsocketUrlSave}
        openalgoUsername={openalgoUsername}
        handleUsernameSave={handleUsernameSave}
        chartEngine={chartEngine}
        handleChartEngineSave={handleChartEngineSave}
        tradingViewLibraryPath={tradingViewLibraryPath}
        handleTradingViewLibraryPathSave={handleTradingViewLibraryPathSave}
        chartAppearance={chartAppearance}
        handleChartAppearanceChange={handleChartAppearanceChange}
        handleResetChartAppearance={handleResetChartAppearance}
        isIndicatorSettingsOpen={isIndicatorSettingsOpen}
        setIsIndicatorSettingsOpen={setIsIndicatorSettingsOpen}
        editingIndicator={editingIndicator}
        setEditingIndicator={setEditingIndicator}
        handleIndicatorSettings={handleIndicatorSettings}
        isTemplateDialogOpen={isTemplateDialogOpen}
        setIsTemplateDialogOpen={setIsTemplateDialogOpen}
        handleLoadTemplate={handleLoadTemplate}
        showToast={showToast}
        isShortcutsDialogOpen={isShortcutsDialogOpen}
        setIsShortcutsDialogOpen={setIsShortcutsDialogOpen}
        isChartTemplatesOpen={isChartTemplatesOpen}
        setIsChartTemplatesOpen={setIsChartTemplatesOpen}
        getCurrentChartConfig={getCurrentChartConfig}
        handleLoadChartTemplate={handleLoadChartTemplate}
        isStraddlePickerOpen={isStraddlePickerOpen}
        setIsStraddlePickerOpen={setIsStraddlePickerOpen}
        isOptionChainOpen={isOptionChainOpen}
        setIsOptionChainOpen={setIsOptionChainOpen}
        optionChainInitialSymbol={optionChainInitialSymbol}
        setOptionChainInitialSymbol={setOptionChainInitialSymbol}
        handleOptionSelect={handleOptionSelect}
        isSectorHeatmapOpen={isSectorHeatmapOpen}
        setIsSectorHeatmapOpen={setIsSectorHeatmapOpen}
        watchlistData={watchlistData}
        setPositionTrackerSettings={setPositionTrackerSettings}
        confirmDialogState={confirmDialogState}
        showPineEditor={showPineEditor}
        setShowPineEditor={setShowPineEditor}
        handleAddPineIndicator={handleAddPineIndicator}
      />
    </OrderProvider>
  );
}

// AppWrapper - handles auth and cloud sync BEFORE mounting AppContent
// This ensures React state initializers see the cloud data in localStorage
function App() {
  const { isAuthenticated, setIsAuthenticated } = useUser();

  // Cloud Workspace Sync - blocks until cloud data is fetched or 5s timeout
  // Store is hydrated directly via setFromCloud, no remount needed
  const { isLoaded: isWorkspaceLoaded } = useCloudWorkspaceSync(isAuthenticated);

  // Show loader while checking auth or loading cloud data
  if (!isWorkspaceLoaded) {
    return <WorkspaceLoader />;
  }

  // Now mount AppContent - store is already hydrated with cloud data
  return <AppContent isAuthenticated={isAuthenticated} setIsAuthenticated={setIsAuthenticated} />;
}

export default App;
