import { normalizeSymbolExchange } from '../../utils/symbolNormalization'; // TSK-CS-021
/**
 * RightPanelHost
 * Renders the active right panel based on activeRightPanel value.
 * Receives all required state and handlers as props from AppContent.
 * No state ownership here — purely presentational.
 */

import React, { Suspense, lazy, useMemo, useCallback } from 'react';
import Watchlist from '../Watchlist/Watchlist';
import ObjectTreePanel from '../ObjectTree/ObjectTreePanel';
import MarketScreenerPanel from '../MarketScreener/MarketScreenerPanel';
import AlertsPanel from '../Alerts/AlertsPanel';
import PositionTracker from '../PositionTracker/PositionTracker';
import TradingPanel from '../TradingPanel/TradingPanel';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary';
import PanelLoader from '../shared/PanelLoader';

const ANNScanner = lazy(() => import('../ANNScanner/ANNScanner'));
const DepthOfMarket = lazy(() => import('../DepthOfMarket/DepthOfMarket'));

export interface RightPanelHostProps {
  activeRightPanel: string;
  setActiveRightPanel: any;

  // Chart context
  currentSymbol: string;
  currentExchange: string;
  currentInterval: string;
  activeChart: any;
  activeChartId: number;
  setCharts: any;
  chartRefs: any;

  // Watchlist props
  watchlistsState: any;
  activeWatchlist: any;
  watchlistData: any[];
  watchlistLoading: boolean;
  watchlistSymbols: any[];
  favoriteWatchlists: any[];
  handleAddClick: any;
  handleRemoveFromWatchlist: any;
  handleWatchlistReorder: any;
  handleSwitchWatchlist: any;
  handleCreateWatchlist: any;
  handleRenameWatchlist: any;
  handleDeleteWatchlist: any;
  handleClearWatchlist: any;
  handleCopyWatchlist: any;
  handleToggleWatchlistFavorite: any;
  handleAddSection: any;
  handleRenameSection: any;
  handleDeleteSection: any;
  handleToggleSection: any;
  handleExportWatchlist: any;
  handleImportWatchlist: any;

  // Object tree props
  liveDrawings: any[];
  handleIndicatorVisibilityToggle: any;
  handleIndicatorRemove: any;
  handleOpenIndicatorSettings: any;

  // Alerts panel props
  alerts: any[];
  alertLogs: any[];
  handleRemoveAlert: any;
  handleRestartAlert: any;
  handlePauseAlert: any;
  setIndicatorAlertToEdit: any;
  setIsIndicatorAlertOpen: any;
  unreadAlertCount: number;

  // Position tracker props
  positionTrackerSettings: any;
  setPositionTrackerSettings: any;
  isAuthenticated: boolean;

  // ANN scanner props
  annScannerState: any;
  setAnnScannerState: any;
  startAnnScan: any;
  cancelAnnScan: any;
  addSymbolToWatchlist: any;
  showToast: any;

  // Trading panel props
  tradingPanelConfig: any;

  // Right toolbar
  handleRightPanelToggle: any;
}

const RightPanelHost: React.FC<RightPanelHostProps> = ({
  activeRightPanel,
  setActiveRightPanel,
  currentSymbol,
  currentExchange,
  currentInterval,
  activeChart,
  activeChartId,
  setCharts,
  chartRefs,
  watchlistsState,
  activeWatchlist,
  watchlistData,
  watchlistLoading,
  watchlistSymbols,
  favoriteWatchlists,
  handleAddClick,
  handleRemoveFromWatchlist,
  handleWatchlistReorder,
  handleSwitchWatchlist,
  handleCreateWatchlist,
  handleRenameWatchlist,
  handleDeleteWatchlist,
  handleClearWatchlist,
  handleCopyWatchlist,
  handleToggleWatchlistFavorite,
  handleAddSection,
  handleRenameSection,
  handleDeleteSection,
  handleToggleSection,
  handleExportWatchlist,
  handleImportWatchlist,
  liveDrawings,
  handleIndicatorVisibilityToggle,
  handleIndicatorRemove,
  handleOpenIndicatorSettings,
  alerts,
  alertLogs,
  handleRemoveAlert,
  handleRestartAlert,
  handlePauseAlert,
  setIndicatorAlertToEdit,
  setIsIndicatorAlertOpen,
  unreadAlertCount,
  positionTrackerSettings,
  setPositionTrackerSettings,
  isAuthenticated,
  annScannerState,
  setAnnScannerState,
  startAnnScan,
  cancelAnnScan,
  addSymbolToWatchlist,
  showToast,
  tradingPanelConfig,
}) => {
  // useCallback — stable reference across renders (TSK-CS-029)
  const navigateToSymbol = useCallback((symData: any) => {
    const rawSymbol = typeof symData === 'string' ? symData : symData.symbol;
    const rawExchange = typeof symData === 'string' ? 'NSE' : (symData.exchange || 'NSE');
    // Normalize to canonical symbol/exchange before mutating chart state
    const { symbol, exchange } = normalizeSymbolExchange(rawSymbol, rawExchange);
    setCharts((prev: any[]) =>
      prev.map((chart: any) =>
        chart.id === activeChartId
          ? { ...chart, symbol, exchange, strategyConfig: null }
          : chart
      )
    );
  }, [activeChartId, setCharts]);

  // useMemo — avoid rebuilding Map on every render (TSK-CS-029)
  const watchlistItems = useMemo(() => {
    const symbols = (activeWatchlist?.symbols || []) as any[];
    const dataMap = new Map(watchlistData.map((item: any) => [`${item.symbol}-${item.exchange}`, item]));
    return symbols.map((item: any) => {
      if (typeof item === 'string' && item.startsWith('###')) return item;
      const symbolName = typeof item === 'string' ? item : item.symbol;
      const exchange = typeof item === 'string' ? 'NSE' : (item.exchange || 'NSE');
      const liveData = dataMap.get(`${symbolName}-${exchange}`);
      if (liveData) return { ...liveData, exchange };
      return item;
    });
  }, [activeWatchlist, watchlistData]);

  if (activeRightPanel === 'watchlist') {
    return (
      <Watchlist
        currentSymbol={currentSymbol}
        currentExchange={currentExchange}
        items={watchlistItems as any}
        isLoading={watchlistLoading}
        onSymbolSelect={navigateToSymbol}
        onAddClick={handleAddClick}
        onRemoveClick={handleRemoveFromWatchlist}
        onReorder={handleWatchlistReorder}
        watchlists={watchlistsState.lists as any}
        activeWatchlistId={watchlistsState.activeListId}
        onSwitchWatchlist={handleSwitchWatchlist}
        onCreateWatchlist={handleCreateWatchlist}
        onRenameWatchlist={handleRenameWatchlist}
        onDeleteWatchlist={handleDeleteWatchlist}
        onClearWatchlist={handleClearWatchlist}
        onCopyWatchlist={handleCopyWatchlist}
        favoriteWatchlists={favoriteWatchlists as any}
        onToggleFavorite={handleToggleWatchlistFavorite}
        onAddSection={handleAddSection}
        onRenameSection={handleRenameSection}
        onDeleteSection={handleDeleteSection}
        collapsedSections={(activeWatchlist as any)?.collapsedSections || []}
        onToggleSection={handleToggleSection}
        onExport={handleExportWatchlist}
        onImport={handleImportWatchlist}
      />
    );
  }

  if (activeRightPanel === 'objectTree') {
    return (
      <ObjectTreePanel
        indicators={(activeChart as any)?.indicators || []}
        drawings={liveDrawings}
        onIndicatorVisibilityToggle={handleIndicatorVisibilityToggle}
        onIndicatorRemove={handleIndicatorRemove}
        onIndicatorSettings={handleOpenIndicatorSettings}
        onDrawingVisibilityToggle={(idx: number) => {
          const activeRef = chartRefs.current[activeChartId];
          if (activeRef && typeof activeRef.toggleDrawingVisibility === 'function') {
            activeRef.toggleDrawingVisibility(idx);
          }
        }}
        onDrawingLockToggle={(idx: number) => {
          const activeRef = chartRefs.current[activeChartId];
          if (activeRef && typeof activeRef.toggleDrawingLock === 'function') {
            activeRef.toggleDrawingLock(idx);
          }
        }}
        onDrawingRemove={(idx: number) => {
          const activeRef = chartRefs.current[activeChartId];
          if (activeRef && typeof activeRef.removeDrawingByIndex === 'function') {
            activeRef.removeDrawingByIndex(idx);
          }
        }}
        symbol={currentSymbol}
        interval={currentInterval}
      />
    );
  }

  if (activeRightPanel === 'screener') {
    return (
      <MarketScreenerPanel
        items={watchlistData}
        currentSymbol={currentSymbol}
        currentExchange={currentExchange}
        onSymbolSelect={navigateToSymbol}
      />
    );
  }

  if (activeRightPanel === 'alerts') {
    return (
      <AlertsPanel
        alerts={alerts as any}
        logs={alertLogs as any}
        onRemoveAlert={handleRemoveAlert}
        onRestartAlert={handleRestartAlert}
        onPauseAlert={handlePauseAlert}
        onNavigate={(symbolData: any) => {
          const { symbol, exchange } = normalizeSymbolExchange(symbolData.symbol, symbolData.exchange || 'NSE');
          setCharts((prev: any[]) =>
            prev.map((chart: any) =>
              chart.id === activeChartId
                ? { ...chart, symbol, exchange, strategyConfig: null }
                : chart
            )
          );
        }}
        onEditAlert={(alert: any) => {
          const { symbol: normSymbol, exchange: normExchange } = normalizeSymbolExchange(
            alert.symbol,
            alert.exchange || 'NSE'
          );
          if (alert.type === 'indicator') {
            setIndicatorAlertToEdit(alert);
            setIsIndicatorAlertOpen(true);
            setCharts((prev: any[]) =>
              prev.map((chart: any) =>
                chart.id === activeChartId
                  ? { ...chart, symbol: normSymbol, exchange: normExchange, strategyConfig: null }
                  : chart
              )
            );
            return;
          }
          setCharts((prev: any[]) =>
            prev.map((chart: any) =>
              chart.id === activeChartId
                ? { ...chart, symbol: normSymbol, exchange: normExchange, strategyConfig: null }
                : chart
            )
          );
          setTimeout(() => {
            const activeRef = (chartRefs as any).current[activeChartId];
            if (activeRef && typeof activeRef.editAlertById === 'function' && alert.externalId) {
              activeRef.editAlertById(alert.externalId);
            }
          }, 500);
        }}
      />
    );
  }

  if (activeRightPanel === 'position_tracker') {
    return (
      <PositionTracker
        sourceMode={positionTrackerSettings.sourceMode}
        customSymbols={positionTrackerSettings.customSymbols}
        watchlistData={watchlistData}
        isLoading={watchlistLoading}
        onSourceModeChange={(mode: any) =>
          setPositionTrackerSettings((prev: any) => ({ ...prev, sourceMode: mode }))
        }
        onCustomSymbolsChange={(symbols: any) =>
          setPositionTrackerSettings((prev: any) => ({ ...prev, customSymbols: symbols }))
        }
        onSymbolSelect={navigateToSymbol}
        isAuthenticated={isAuthenticated}
      />
    );
  }

  if (activeRightPanel === 'ann_scanner') {
    return (
      <ErrorBoundary label="ANN Scanner">
      <Suspense fallback={<PanelLoader label="Loading Scanner..." />}>
        <ANNScanner
          watchlistSymbols={(watchlistSymbols as any[])
            .filter((s: any) => !(typeof s === 'string' && s.startsWith('###')))
            .map((s: any) =>
              typeof s === 'string'
                ? { symbol: s, exchange: 'NSE' }
                : { symbol: s.symbol, exchange: s.exchange || 'NSE' }
            )}
          onSymbolSelect={navigateToSymbol}
          isAuthenticated={isAuthenticated}
          onAddToWatchlist={(symbolData: any) => {
            addSymbolToWatchlist(symbolData.symbol, symbolData.exchange || 'NSE');
          }}
          showToast={showToast}
          persistedState={annScannerState as any}
          onStateChange={setAnnScannerState as any}
          onStartScan={startAnnScan}
          onCancelScan={cancelAnnScan}
        />
      </Suspense>
      </ErrorBoundary>
    );
  }

  if (activeRightPanel === 'dom') {
    return (
      <ErrorBoundary label="Depth of Market">
      <Suspense fallback={<PanelLoader label="Loading DOM..." />}>
        <DepthOfMarket
          symbol={currentSymbol}
          exchange={currentExchange}
          isOpen={true}
          onClose={() => setActiveRightPanel('watchlist')}
        />
      </Suspense>
      </ErrorBoundary>
    );
  }

  if (activeRightPanel === 'trade') {
    return (
      <TradingPanel
        symbol={currentSymbol}
        exchange={currentExchange}
        isOpen={true}
        onClose={() => setActiveRightPanel('watchlist')}
        showToast={showToast}
        initialAction={tradingPanelConfig.action as any}
        initialPrice={tradingPanelConfig.price}
        initialOrderType={tradingPanelConfig.orderType as any}
      />
    );
  }

  return null;
};

export default RightPanelHost;
