/**
 * ModalHost
 * Renders all modal/overlay/toast components for the app.
 * Receives all required state and handlers as props from AppContent.
 * No state ownership here — purely presentational.
 */

import React, { Suspense, lazy } from 'react';
import OrderEntryModal from '../OrderEntryModal/OrderEntryModal';
import SymbolSearch from '../SymbolSearch/SymbolSearch';
import CompareOptionsDialog from '../Chart/CompareOptionsDialog';
import AlertDialog from '../Alert/AlertDialog';
import IndicatorAlertDialog from '../IndicatorAlert/IndicatorAlertDialog';
import Toast from '../Toast/Toast';
import SnapshotToast from '../Toast/SnapshotToast';
import GlobalAlertPopup from '../GlobalAlertPopup/GlobalAlertPopup';
import LayoutTemplateDialog from '../LayoutTemplates/LayoutTemplateDialog';
import { ConfirmDialog } from '../shared';

const SettingsPopup = lazy(() => import('../Settings/SettingsPopup'));
const CommandPalette = lazy(() => import('../CommandPalette/CommandPalette'));
const ShortcutsDialog = lazy(() => import('../ShortcutsDialog/ShortcutsDialog'));
const OptionChainPicker = lazy(() => import('../OptionChainPicker/OptionChainPicker'));
const OptionChainModal = lazy(() => import('../OptionChainModal/OptionChainModal'));
const SectorHeatmapModal = lazy(() => import('../SectorHeatmap/SectorHeatmapModal'));
const ChartTemplatesDialog = lazy(() => import('../ChartTemplates/ChartTemplatesDialog'));
const IndicatorSettingsDialog = lazy(() => import('../IndicatorSettings/IndicatorSettingsDialog'));
const PineScriptEditor = lazy(() => import('../PineEditor/PineScriptEditor'));

export interface ModalHostProps {
  // Active chart data (read-only, for passing to modals)
  activeChart: any;
  activeChartId: number;
  currentSymbol: string;
  currentExchange: string;
  currentInterval: string;
  charts: any[];
  layout: any;
  chartType: any;
  theme: any;

  // Trading panel / order entry
  tradingPanelConfig: {
    isOpen: boolean;
    isModal: boolean;
    action: string;
    price: string;
    orderType: string;
  };
  setTradingPanelConfig: any;

  // Symbol search
  isSearchOpen: boolean;
  setIsSearchOpen: any;
  searchMode: string;
  handleCompareSymbolSelect: any;
  initialSearchValue: string;
  setInitialSearchValue: any;

  // Compare options dialog
  compareOptionsVisible: boolean;
  pendingComparisonSymbol: { symbol: string; exchange: string } | null;
  handleCompareOptionsConfirm: any;
  handleCompareOptionsCancel: any;

  // Command palette
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: any;
  commands: any[];
  recentCommands: any[];
  groupedCommands: any;
  searchCommands: (q: string) => any[];
  executeCommand: (cmd: any) => void;

  // Toasts
  toasts: any[];
  removeToast: any;
  snapshotToast: string | null;
  clearSnapshotToast: any;

  // Global alert popup
  globalAlertPopups: any[];
  setGlobalAlertPopups: any;
  setCharts: any;

  // Alert dialog
  isAlertOpen: boolean;
  setIsAlertOpen: any;
  handleSaveAlert: any;
  alertPrice: number | null;

  // Indicator alert dialog
  isIndicatorAlertOpen: boolean;
  setIsIndicatorAlertOpen: any;
  handleSaveIndicatorAlert: any;
  indicatorAlertToEdit: any;
  setIndicatorAlertToEdit: any;
  indicatorAlertInitialIndicator: any;
  setIndicatorAlertInitialIndicator: any;

  // Settings popup
  isSettingsOpen: boolean;
  setIsSettingsOpen: any;
  isTimerVisible: boolean;
  handleTimerToggle: any;
  isSessionBreakVisible: boolean;
  handleSessionBreakToggle: any;
  hostUrl: string;
  handleHostUrlSave: any;
  apiKey: string;
  handleApiKeySaveFromSettings: any;
  websocketUrl: string;
  handleWebsocketUrlSave: any;
  openalgoUsername: string;
  handleUsernameSave: any;
  chartAppearance: any;
  handleChartAppearanceChange: any;
  handleResetChartAppearance: any;

  // Indicator settings dialog
  isIndicatorSettingsOpen: boolean;
  setIsIndicatorSettingsOpen: any;
  editingIndicator: any;
  setEditingIndicator: any;
  handleIndicatorSettings: any;

  // Layout template dialog
  isTemplateDialogOpen: boolean;
  setIsTemplateDialogOpen: any;
  handleLoadTemplate: any;
  showToast: any;

  // Shortcuts dialog
  isShortcutsDialogOpen: boolean;
  setIsShortcutsDialogOpen: any;

  // Chart templates dialog
  isChartTemplatesOpen: boolean;
  setIsChartTemplatesOpen: any;
  getCurrentChartConfig: any;
  handleLoadChartTemplate: any;

  // Option chain picker
  isStraddlePickerOpen: boolean;
  setIsStraddlePickerOpen: any;

  // Option chain modal
  isOptionChainOpen: boolean;
  setIsOptionChainOpen: any;
  optionChainInitialSymbol: any;
  setOptionChainInitialSymbol: any;
  handleOptionSelect: any;

  // Sector heatmap
  isSectorHeatmapOpen: boolean;
  setIsSectorHeatmapOpen: any;
  watchlistData: any;
  setPositionTrackerSettings: any;

  // Confirm dialog
  confirmDialogState: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  };

  // Pine editor
  showPineEditor: any;
  setShowPineEditor: any;
  handleAddPineIndicator: any;
}

const ModalHost: React.FC<ModalHostProps> = ({
  activeChart,
  activeChartId,
  currentSymbol,
  currentExchange,
  currentInterval,
  charts,
  layout,
  chartType,
  theme,
  tradingPanelConfig,
  setTradingPanelConfig,
  isSearchOpen,
  setIsSearchOpen,
  searchMode,
  handleCompareSymbolSelect,
  initialSearchValue,
  setInitialSearchValue,
  compareOptionsVisible,
  pendingComparisonSymbol,
  handleCompareOptionsConfirm,
  handleCompareOptionsCancel,
  isCommandPaletteOpen,
  setIsCommandPaletteOpen,
  commands,
  recentCommands,
  groupedCommands,
  searchCommands,
  executeCommand,
  toasts,
  removeToast,
  snapshotToast,
  clearSnapshotToast,
  globalAlertPopups,
  setGlobalAlertPopups,
  setCharts,
  isAlertOpen,
  setIsAlertOpen,
  handleSaveAlert,
  alertPrice,
  isIndicatorAlertOpen,
  setIsIndicatorAlertOpen,
  handleSaveIndicatorAlert,
  indicatorAlertToEdit,
  setIndicatorAlertToEdit,
  indicatorAlertInitialIndicator,
  setIndicatorAlertInitialIndicator,
  isSettingsOpen,
  setIsSettingsOpen,
  isTimerVisible,
  handleTimerToggle,
  isSessionBreakVisible,
  handleSessionBreakToggle,
  hostUrl,
  handleHostUrlSave,
  apiKey,
  handleApiKeySaveFromSettings,
  websocketUrl,
  handleWebsocketUrlSave,
  openalgoUsername,
  handleUsernameSave,
  chartAppearance,
  handleChartAppearanceChange,
  handleResetChartAppearance,
  isIndicatorSettingsOpen,
  setIsIndicatorSettingsOpen,
  editingIndicator,
  setEditingIndicator,
  handleIndicatorSettings,
  isTemplateDialogOpen,
  setIsTemplateDialogOpen,
  handleLoadTemplate,
  showToast,
  isShortcutsDialogOpen,
  setIsShortcutsDialogOpen,
  isChartTemplatesOpen,
  setIsChartTemplatesOpen,
  getCurrentChartConfig,
  handleLoadChartTemplate,
  isStraddlePickerOpen,
  setIsStraddlePickerOpen,
  isOptionChainOpen,
  setIsOptionChainOpen,
  optionChainInitialSymbol,
  setOptionChainInitialSymbol,
  handleOptionSelect,
  isSectorHeatmapOpen,
  setIsSectorHeatmapOpen,
  watchlistData,
  setPositionTrackerSettings,
  confirmDialogState,
  showPineEditor,
  setShowPineEditor,
  handleAddPineIndicator,
}) => {
  const compareSymbolColor = (() => {
    const colors = ['#f57f17', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5'];
    const count = (activeChart?.comparisonSymbols || []).length;
    return colors[count % colors.length];
  })();

  return (
    <>
      {/* Order Entry Modal */}
      <OrderEntryModal
        isOpen={tradingPanelConfig.isOpen && tradingPanelConfig.isModal}
        onClose={() => setTradingPanelConfig((prev: any) => ({ ...prev, isOpen: false, isModal: false }))}
        symbol={(activeChart as any)?.symbol}
        exchange={(activeChart as any)?.exchange}
        showToast={showToast}
        initialAction={tradingPanelConfig.action as any}
        initialPrice={tradingPanelConfig.price}
        initialOrderType={tradingPanelConfig.orderType as any}
      />

      {/* Symbol Search */}
      <SymbolSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelect={handleCompareSymbolSelect}
        addedSymbols={searchMode === 'compare' ? (activeChart.comparisonSymbols || []) : []}
        isCompareMode={searchMode === 'compare'}
        initialValue={initialSearchValue}
        onInitialValueUsed={() => setInitialSearchValue('')}
      />

      {/* Compare Options Dialog */}
      <CompareOptionsDialog
        visible={compareOptionsVisible}
        symbol={pendingComparisonSymbol?.symbol}
        exchange={pendingComparisonSymbol?.exchange}
        symbolColor={compareSymbolColor}
        onConfirm={handleCompareOptionsConfirm}
        onCancel={handleCompareOptionsCancel}
      />

      {/* Command Palette */}
      <Suspense fallback={null}>
        {isCommandPaletteOpen && (
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
            commands={commands}
            recentCommands={recentCommands}
            groupedCommands={groupedCommands}
            searchCommands={searchCommands}
            executeCommand={executeCommand}
          />
        )}
      </Suspense>

      {/* Toast Queue */}
      <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            action={toast.action}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
      {snapshotToast && (
        <SnapshotToast
          message={snapshotToast}
          onClose={() => clearSnapshotToast()}
        />
      )}

      {/* Global Alert Popup */}
      <GlobalAlertPopup
        alerts={globalAlertPopups as any}
        onDismiss={(alertId: any) =>
          setGlobalAlertPopups((prev: any[]) => prev.filter((a: any) => a.id !== alertId))
        }
        onClick={(symbolData: any) => {
          setCharts((prev: any[]) =>
            prev.map((chart: any) =>
              chart.id === activeChartId
                ? { ...chart, symbol: symbolData.symbol, exchange: symbolData.exchange, strategyConfig: null }
                : chart
            )
          );
        }}
      />

      {/* Alert Dialog */}
      <AlertDialog
        isOpen={isAlertOpen}
        onClose={() => setIsAlertOpen(false)}
        onSave={handleSaveAlert as any}
        initialPrice={alertPrice as any}
        theme={theme}
      />

      {/* Indicator Alert Dialog */}
      <IndicatorAlertDialog
        isOpen={isIndicatorAlertOpen}
        onClose={() => {
          setIsIndicatorAlertOpen(false);
          setIndicatorAlertToEdit(null);
          setIndicatorAlertInitialIndicator(null);
        }}
        onSave={handleSaveIndicatorAlert as any}
        activeIndicators={(activeChart?.indicators || []) as any}
        symbol={indicatorAlertToEdit ? indicatorAlertToEdit.symbol : currentSymbol}
        exchange={indicatorAlertToEdit ? indicatorAlertToEdit.exchange : currentExchange}
        theme={theme}
        alertToEdit={indicatorAlertToEdit}
        initialIndicator={indicatorAlertInitialIndicator}
        currentInterval={currentInterval}
      />

      {/* Settings Popup */}
      <Suspense fallback={null}>
        {isSettingsOpen && (
          <SettingsPopup
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            theme={theme}
            isTimerVisible={isTimerVisible}
            onTimerToggle={handleTimerToggle}
            isSessionBreakVisible={isSessionBreakVisible}
            onSessionBreakToggle={handleSessionBreakToggle}
            hostUrl={hostUrl}
            onHostUrlSave={handleHostUrlSave}
            apiKey={apiKey}
            onApiKeySave={handleApiKeySaveFromSettings}
            websocketUrl={websocketUrl}
            onWebsocketUrlSave={handleWebsocketUrlSave}
            openalgoUsername={openalgoUsername}
            onUsernameSave={handleUsernameSave}
            chartAppearance={chartAppearance}
            onChartAppearanceChange={handleChartAppearanceChange}
            onResetChartAppearance={handleResetChartAppearance}
          />
        )}
      </Suspense>

      {/* Indicator Settings Dialog */}
      <Suspense fallback={null}>
        {isIndicatorSettingsOpen && editingIndicator && (
          <IndicatorSettingsDialog
            isOpen={isIndicatorSettingsOpen}
            onClose={() => {
              setIsIndicatorSettingsOpen(false);
              setEditingIndicator(null);
            }}
            indicatorType={editingIndicator.type}
            settings={editingIndicator}
            onSave={(newSettings: any) => {
              handleIndicatorSettings(editingIndicator.id, newSettings);
              setIsIndicatorSettingsOpen(false);
              setEditingIndicator(null);
            }}
            theme={theme}
            dynamicConfig={
              editingIndicator.type === 'pine' && editingIndicator.pineInputs
                ? {
                    name: editingIndicator.name || 'Pine Script',
                    fullName: editingIndicator.name || 'Pine Script Indicator',
                    pane: editingIndicator.pane || 'pine_indicator',
                    inputs: (editingIndicator.pineInputs || []).map((input: any) => ({
                      key: input.name,
                      label: input.title || input.name,
                      type:
                        input.type === 'int' || input.type === 'float'
                          ? 'number'
                          : input.type === 'bool'
                          ? 'boolean'
                          : input.type === 'color'
                          ? 'color'
                          : input.type === 'string' || input.type === 'source'
                          ? 'select'
                          : 'text',
                      default: input.default,
                      min: input.minval,
                      max: input.maxval,
                      step: input.step || (input.type === 'float' ? 0.1 : 1),
                      options:
                        input.options ||
                        (input.type === 'source'
                          ? ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4']
                          : undefined),
                    })),
                    style: [
                      { key: 'pineColor', label: 'Line Color', type: 'color', default: '#2962FF' },
                      { key: 'pineLineWidth', label: 'Line Width', type: 'number', min: 1, max: 5, default: 2 },
                    ],
                  }
                : undefined
            }
          />
        )}
      </Suspense>

      {/* Layout Template Dialog */}
      <LayoutTemplateDialog
        isOpen={isTemplateDialogOpen}
        onClose={() => setIsTemplateDialogOpen(false)}
        currentState={{
          layout,
          charts: charts as any,
          chartType,
          chartAppearance,
          theme,
        }}
        onLoadTemplate={handleLoadTemplate as any}
        showToast={showToast}
      />

      {/* Shortcuts Dialog */}
      <Suspense fallback={null}>
        {isShortcutsDialogOpen && (
          <ShortcutsDialog
            isOpen={isShortcutsDialogOpen}
            onClose={() => setIsShortcutsDialogOpen(false)}
          />
        )}
      </Suspense>

      {/* Chart Templates Dialog */}
      <Suspense fallback={null}>
        {isChartTemplatesOpen && (
          <ChartTemplatesDialog
            isOpen={isChartTemplatesOpen}
            onClose={() => setIsChartTemplatesOpen(false)}
            currentConfig={getCurrentChartConfig() as any}
            onLoadTemplate={handleLoadChartTemplate as any}
          />
        )}
      </Suspense>

      {/* Option Chain Picker */}
      <Suspense fallback={null}>
        {isStraddlePickerOpen && (
          <OptionChainPicker
            isOpen={isStraddlePickerOpen}
            onClose={() => setIsStraddlePickerOpen(false)}
            onSelect={(config: any) => {
              setCharts((prev: any) =>
                prev.map((chart: any) =>
                  chart.id === activeChartId ? { ...chart, strategyConfig: config } : chart
                )
              );
              setIsStraddlePickerOpen(false);
            }}
          />
        )}
      </Suspense>

      {/* Option Chain Modal */}
      <Suspense fallback={null}>
        {isOptionChainOpen && (
          <OptionChainModal
            isOpen={isOptionChainOpen}
            onClose={() => {
              setIsOptionChainOpen(false);
              setOptionChainInitialSymbol(null);
            }}
            onSelectOption={handleOptionSelect}
            initialSymbol={optionChainInitialSymbol as any}
          />
        )}
      </Suspense>

      {/* Sector Heatmap Modal */}
      <Suspense fallback={null}>
        {isSectorHeatmapOpen && (
          <SectorHeatmapModal
            isOpen={isSectorHeatmapOpen}
            onClose={() => setIsSectorHeatmapOpen(false)}
            watchlistData={watchlistData}
            onSectorSelect={(sector: any) => {
              setPositionTrackerSettings((prev: any) => ({ ...prev, sectorFilter: sector }));
              setIsSectorHeatmapOpen(false);
            }}
            onSymbolSelect={(symData: any) => {
              const symbol = typeof symData === 'string' ? symData : symData.symbol;
              const exchange = typeof symData === 'string' ? 'NSE' : (symData.exchange || 'NSE');
              setCharts((prev: any[]) =>
                prev.map((chart: any) =>
                  chart.id === activeChartId
                    ? { ...chart, symbol, exchange, strategyConfig: null }
                    : chart
                )
              );
              setIsSectorHeatmapOpen(false);
            }}
          />
        )}
      </Suspense>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialogState.isOpen}
        title={confirmDialogState.title}
        message={confirmDialogState.message}
        onConfirm={confirmDialogState.onConfirm}
        onCancel={confirmDialogState.onCancel}
        confirmText={confirmDialogState.confirmText}
        cancelText={confirmDialogState.cancelText}
        danger={confirmDialogState.danger}
      />

      {/* Pine Script Editor */}
      <Suspense fallback={null}>
        {showPineEditor && (
          <PineScriptEditor
            isOpen={showPineEditor}
            onClose={() => setShowPineEditor(false)}
            onAddToChart={handleAddPineIndicator}
          />
        )}
      </Suspense>
    </>
  );
};

export default ModalHost;
