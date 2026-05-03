import React, { memo, useCallback, useMemo, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import {
  Activity,
  BriefcaseBusiness,
  ClipboardList,
  Filter,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import styles from './AccountPanel.module.css';
import { cancelOrder, modifyOrder } from '../../services/openalgo';
import { useOrders } from '../../context/OrderContext';
import useTradeDeskData, { type TradeDeskSystemEvent, type TradeDeskTrade } from '../../hooks/useTradeDeskData';
import ModifyOrderModal from './components/ModifyOrderModal';
import CancelOrderModal from './components/CancelOrderModal';
import { OrdersTable, TradeDeskActivityTable, TradeDeskPositionsTable, TradeDeskTradesTable } from './components';
import { TABS } from './constants/accountConstants';
import type { TradeDeskActivityRow } from './components/TradeDeskActivityTable';

interface Order {
  symbol: string;
  exchange: string;
  action: string;
  pricetype: string;
  product: string;
  quantity: string | number;
  price: string | number;
  order_status: string;
  orderid?: string;
  trigger_price?: string | number;
  triggerprice?: string | number;
  lotSize?: number;
  strategy?: string;
  disclosed_quantity?: number;
  average_price?: string | number;
}

interface SymbolSelection {
  symbol: string;
  exchange: string;
}

export interface AccountPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onSymbolSelect?: (selection: SymbolSelection) => void;
  isMinimized?: boolean;
  onMinimize?: () => void;
  isMaximized?: boolean;
  onMaximize?: () => void;
  isToolbarVisible?: boolean;
  showToast?: (message: string, type?: string) => void;
  currentSymbol?: string;
  currentExchange?: string;
}

function normalizeKey(value: string | undefined | null): string {
  if (!value) return '';
  const normalized = value.toUpperCase().trim();
  switch (normalized) {
    case 'NIFTY 50':
    case 'NIFTY':
      return 'NIFTY';
    case 'NIFTY BANK':
    case 'BANKNIFTY':
      return 'BANKNIFTY';
    case 'NIFTY FIN SERVICE':
    case 'FINNIFTY':
      return 'FINNIFTY';
    case 'NIFTY MID SELECT':
    case 'MIDCPNIFTY':
      return 'MIDCPNIFTY';
    default:
      return normalized;
  }
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMetric(value: number): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildHealthLabel(apiHealth: Record<string, string> | undefined, redFlags: string[] | undefined): string {
  const healthValues = Object.values(apiHealth || {});
  if (redFlags && redFlags.length > 0) return 'ATTN';
  if (healthValues.some((value) => value === 'ERROR' || value === 'STALE')) return 'DEGRADED';
  if (healthValues.some((value) => value === 'PENDING')) return 'SYNCING';
  return 'LIVE';
}

function buildActivityRows(
  events: TradeDeskSystemEvent[],
  redFlags: string[] | undefined,
  trades: TradeDeskTrade[],
  apiHealth: Record<string, string> | undefined,
  lastAlgoAction: { strategy?: string; index?: string; action?: string; time?: string } | null | undefined,
): TradeDeskActivityRow[] {
  const rows: TradeDeskActivityRow[] = [];

  (redFlags || []).forEach((flag, index) => {
    rows.push({
      id: `flag-${index}`,
      timestamp: new Date().toISOString(),
      type: 'RED FLAG',
      strategy: '--',
      message: flag,
      severity: 'critical',
    });
  });

  Object.entries(apiHealth || {}).forEach(([key, value]) => {
    if (value && value !== 'OK' && value !== 'N/A') {
      rows.push({
        id: `health-${key}`,
        timestamp: new Date().toISOString(),
        type: 'API HEALTH',
        strategy: '--',
        message: `${key} status: ${value}`,
        severity: value === 'ERROR' ? 'critical' : 'warning',
      });
    }
  });

  if (lastAlgoAction?.time) {
    rows.push({
      id: 'last-algo-action',
      timestamp: String(lastAlgoAction.time),
      type: 'ALGO ACTION',
      strategy: String(lastAlgoAction.strategy || '--'),
      message: `${String(lastAlgoAction.action || 'ACTION')} on ${String(lastAlgoAction.index || '--')}`,
      severity: 'info',
    });
  }

  trades
    .filter((trade) => trade.closeReason)
    .slice(0, 8)
    .forEach((trade) => {
      rows.push({
        id: `trade-${trade.tradeId}`,
        timestamp: String(trade.closeTime || trade.openTime || new Date().toISOString()),
        type: 'TRADE EXIT',
        strategy: String(trade.strategy || '--'),
        message: `${String(trade.symbol || trade.index || '--')} closed via ${String(trade.closeReason)}`,
        severity: 'info',
      });
    });

  events.forEach((event, index) => {
    let message = '--';
    if (typeof event.details === 'string') {
      message = event.details;
    } else if (event.details && typeof event.details === 'object') {
      try {
        const entries = Object.entries(event.details as Record<string, unknown>)
          .slice(0, 3)
          .map(([key, value]) => `${key}: ${String(value)}`);
        message = entries.join(' | ') || '--';
      } catch {
        message = '--';
      }
    }

    rows.push({
      id: String(event.event_id || event.id || `event-${index}`),
      timestamp: String(event.timestamp || new Date().toISOString()),
      type: String(event.event_type || 'SYSTEM'),
      strategy: String(event.strategy || '--'),
      message,
      severity: /ERROR|FAIL|STOP|KILL/i.test(String(event.event_type || '')) ? 'warning' : 'info',
    });
  });

  return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 80);
}

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  'live-positions': 'Search symbol or index...',
  'today-trades': "Search today's trades...",
  orders: 'Search symbol...',
  activity: 'Search activity...',
};

const AccountPanel: React.FC<AccountPanelProps> = ({
  isOpen,
  onClose,
  isAuthenticated,
  onSymbolSelect,
  isMinimized = false,
  onMinimize,
  isMaximized = false,
  onMaximize,
  isToolbarVisible = true,
  showToast,
  currentSymbol = '',
  currentExchange = '',
}) => {
  const { orders = [], refresh: refreshTradingData } = useOrders();
  const [activeTab, setActiveTab] = useState('live-positions');
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
  const [selectedOrderForModify, setSelectedOrderForModify] = useState<Order | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedOrderForCancel, setSelectedOrderForCancel] = useState<Order | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [tradeDeskSearchByTab, setTradeDeskSearchByTab] = useState<Record<string, string>>({
    'live-positions': '',
    'today-trades': '',
    orders: '',
    activity: '',
  });
  const [tradeDeskFiltersByTab, setTradeDeskFiltersByTab] = useState<Record<string, boolean>>({
    'live-positions': false,
    'today-trades': false,
    orders: false,
    activity: false,
  });

  const { cockpit, positions, trades, events, isLoading, error, lastRefresh, refresh } = useTradeDeskData(
    isOpen,
    isAuthenticated,
    refreshNonce,
  );

  const currentSymbolKey = useMemo(() => normalizeKey(currentSymbol), [currentSymbol]);
  const activeSearchTerm = tradeDeskSearchByTab[activeTab] || '';
  const activeFiltersOpen = tradeDeskFiltersByTab[activeTab] || false;

  const handleRefresh = useCallback(async () => {
    await refreshTradingData();
    await refresh();
    setRefreshNonce((previous) => previous + 1);
  }, [refreshTradingData, refresh]);

  const handleRowClick = useCallback(
    (symbol: string, exchange?: string) => {
      if (!onSymbolSelect) return;
      onSymbolSelect({
        symbol,
        exchange: exchange || currentExchange || 'NSE',
      });
    },
    [onSymbolSelect, currentExchange],
  );

  const handleTradeDeskSearchChange = useCallback(
    (value: string) => {
      setTradeDeskSearchByTab((previous) => ({
        ...previous,
        [activeTab]: value,
      }));
    },
    [activeTab],
  );

  const handleTradeDeskSearchInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleTradeDeskSearchChange(event.target.value);
    },
    [handleTradeDeskSearchChange],
  );

  const clearTradeDeskSearch = useCallback(() => {
    handleTradeDeskSearchChange('');
  }, [handleTradeDeskSearchChange]);

  const handleTradeDeskFilterToggle = useCallback(() => {
    setTradeDeskFiltersByTab((previous) => ({
      ...previous,
      [activeTab]: !previous[activeTab],
    }));
  }, [activeTab]);

  const handleModifyOrder = useCallback((order: Order): void => {
    setSelectedOrderForModify(order);
    setIsModifyModalOpen(true);
  }, []);

  const handleModifyComplete = useCallback(
    async (modifyPayload: unknown): Promise<void> => {
      const result = await modifyOrder(modifyPayload as any);
      if (result.status !== 'success') {
        throw new Error(result.message || 'Failed to modify order');
      }
      showToast?.('Order modified successfully', 'success');
      setIsModifyModalOpen(false);
      setSelectedOrderForModify(null);
      await handleRefresh();
    },
    [handleRefresh, showToast],
  );

  const handleCancelOrder = useCallback((order: Order): void => {
    setSelectedOrderForCancel(order);
    setIsCancelModalOpen(true);
  }, []);

  const handleCancelConfirm = useCallback(async (): Promise<void> => {
    if (!selectedOrderForCancel) return;
    setIsCancelling(true);
    try {
      const result = await cancelOrder({ order: selectedOrderForCancel } as any);
      if (result.status !== 'success') {
        throw new Error(result.message || 'Failed to cancel order');
      }
      showToast?.('Order cancelled successfully', 'success');
      setIsCancelModalOpen(false);
      setSelectedOrderForCancel(null);
      await handleRefresh();
    } catch (caughtError) {
      showToast?.(caughtError instanceof Error ? caughtError.message : 'Failed to cancel order', 'error');
    } finally {
      setIsCancelling(false);
    }
  }, [handleRefresh, selectedOrderForCancel, showToast]);

  const summary = useMemo(() => {
    const strategyCounts = cockpit?.algoMonitor?.strategyAttribution?.counts || {};
    const livePnl = cockpit?.money?.unrealizedPnL ?? cockpit?.positions?.totalM2M ?? 0;
    const bookedPnl = cockpit?.money?.realizedPnL ?? 0;
    const totalTrades = cockpit?.stats?.totalTradesToday ?? cockpit?.tradesToday ?? trades.length;
    return {
      openTrades: cockpit?.positions?.openCount ?? positions.length,
      livePnl: toNumber(livePnl),
      bookedPnl: toNumber(bookedPnl),
      todayTrades: toNumber(totalTrades),
      strategiesActive: Object.values(strategyCounts).filter((count) => Number(count) > 0).length,
      dataHealth: buildHealthLabel(cockpit?.apiHealth, cockpit?.redFlags),
    };
  }, [cockpit, positions.length, trades.length]);

  const activityRows = useMemo(
    () => buildActivityRows(events, cockpit?.redFlags, trades, cockpit?.apiHealth, cockpit?.algoMonitor?.lastAlgoAction),
    [events, cockpit, trades],
  );

  const renderActiveTab = (): React.ReactNode => {
    switch (activeTab) {
      case 'live-positions':
        return (
          <TradeDeskPositionsTable
            positions={positions}
            currentSymbolKey={currentSymbolKey}
            onRowClick={handleRowClick}
            searchTerm={activeSearchTerm}
            onSearchTermChange={handleTradeDeskSearchChange}
            showFilters={activeFiltersOpen}
            onToggleFilters={handleTradeDeskFilterToggle}
          />
        );
      case 'today-trades':
        return (
          <TradeDeskTradesTable
            trades={trades}
            currentSymbolKey={currentSymbolKey}
            onRowClick={handleRowClick}
            searchTerm={activeSearchTerm}
            onSearchTermChange={handleTradeDeskSearchChange}
            showFilters={activeFiltersOpen}
            onToggleFilters={handleTradeDeskFilterToggle}
          />
        );
      case 'orders':
        return (
          <OrdersTable
            orders={orders as any}
            onRowClick={(symbol, exchange) => handleRowClick(symbol, exchange)}
            onCancelOrder={(order: any, _event: MouseEvent<HTMLButtonElement>) => handleCancelOrder(order as Order)}
            onModifyOrder={(order: any, _event: MouseEvent<HTMLButtonElement>) => handleModifyOrder(order as Order)}
            searchTerm={activeSearchTerm}
            onSearchTermChange={handleTradeDeskSearchChange}
            showFilters={activeFiltersOpen}
            onToggleFilters={handleTradeDeskFilterToggle}
          />
        );
      case 'activity':
        return (
          <TradeDeskActivityTable
            rows={activityRows}
            searchTerm={activeSearchTerm}
            onSearchTermChange={handleTradeDeskSearchChange}
            showFilters={activeFiltersOpen}
            onToggleFilters={handleTradeDeskFilterToggle}
          />
        );
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.accountPanel}>
      <div className={`${styles.header} ${!isToolbarVisible ? styles.noToolbar : ''}`}>
        <div className={styles.headerLeft}>
          <BriefcaseBusiness size={16} className={styles.headerIcon} />
          <span className={styles.title}>Trade Desk</span>
          {cockpit?.connection?.broker && <span className={styles.brokerBadge}>{cockpit.connection.broker}</span>}
        </div>

        <div className={styles.headerCenter}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Open Trades</span>
            <span className={styles.summaryValue}>{summary.openTrades}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Live P&amp;L</span>
            <span className={`${styles.summaryValue} ${summary.livePnl >= 0 ? styles.positive : styles.negative}`}>
              {formatMetric(summary.livePnl)}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Booked P&amp;L</span>
            <span className={`${styles.summaryValue} ${summary.bookedPnl >= 0 ? styles.positive : styles.negative}`}>
              {formatMetric(summary.bookedPnl)}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Today Trades</span>
            <span className={styles.summaryValue}>{summary.todayTrades}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Strategies Active</span>
            <span className={styles.summaryValue}>{summary.strategiesActive}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Data Health</span>
            <span
              className={`${styles.summaryValue} ${
                summary.dataHealth === 'LIVE'
                  ? styles.positive
                  : summary.dataHealth === 'ATTN'
                    ? styles.negative
                    : styles.warning
              }`}
            >
              {summary.dataHealth}
            </span>
          </div>
        </div>

        <div className={styles.headerRight}>
          <button className={styles.refreshBtn} onClick={handleRefresh} disabled={isLoading} title="Refresh Trade Desk">
            <RefreshCw size={14} className={isLoading ? styles.spinning : ''} />
          </button>
          {onMinimize && (
            <button className={styles.controlBtn} onClick={onMinimize} title={isMinimized ? 'Expand panel' : 'Minimize panel'}>
              <MinusIcon minimized={isMinimized} />
            </button>
          )}
          {onMaximize && (
            <button className={styles.controlBtn} onClick={onMaximize} title={isMaximized ? 'Restore size' : 'Maximize panel'}>
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
          <button className={styles.closeBtn} onClick={onClose} title="Close Trade Desk">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className={`${styles.tradeDeskTopRow} ${!isToolbarVisible ? styles.noToolbar : ''}`}>
        <div className={styles.tradeDeskTabsInline}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.id === 'live-positions' && summary.openTrades > 0 && <span className={styles.tabBadge}>{summary.openTrades}</span>}
              {tab.id === 'orders' && Number(cockpit?.orders?.pending || 0) > 0 && (
                <span className={styles.tabBadge}>{cockpit?.orders?.pending}</span>
              )}
              {tab.id === 'activity' && (cockpit?.redFlags?.length || 0) > 0 && (
                <span className={styles.tabBadge}>{cockpit?.redFlags?.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.tradeDeskInlineControls}>
          <div className={styles.searchBar}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              placeholder={SEARCH_PLACEHOLDERS[activeTab] || 'Search...'}
              value={activeSearchTerm}
              onChange={handleTradeDeskSearchInput}
              className={styles.searchInput}
            />
            {activeSearchTerm && <X size={14} className={styles.clearIcon} onClick={clearTradeDeskSearch} />}
          </div>
          <button
            className={`${styles.filterBtn} ${(activeFiltersOpen || activeSearchTerm) ? styles.filterActive : ''}`}
            onClick={handleTradeDeskFilterToggle}
            title="Toggle filters"
          >
            <Filter size={14} />
            <span>Filters</span>
          </button>
        </div>

        <div className={styles.tradeDeskMetaInline}>
          <span>
            {cockpit?.connection?.accountName || 'Trading system'}
            {cockpit?.connection?.clientId ? ` • ${cockpit.connection.clientId}` : ''}
          </span>
          <span>
            Current chart: {currentSymbol || '--'}
            {currentExchange ? ` • ${currentExchange}` : ''}
          </span>
          <span>Last refresh: {lastRefresh ? lastRefresh.toLocaleTimeString('en-IN', { hour12: false }) : '--:--:--'}</span>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className={`${styles.content} ${!isToolbarVisible ? styles.noToolbar : ''}`}>
            {error && (
              <div className={styles.tradeDeskErrorBanner}>
                <ShieldAlert size={14} />
                <span>{error}</span>
              </div>
            )}
            {renderActiveTab()}
          </div>

          <div className={`${styles.footer} ${!isToolbarVisible ? styles.noToolbar : ''}`}>
            <div className={styles.tradeDeskFooterStats}>
              <span>Orders: {cockpit?.orders?.total ?? orders.length}</span>
              <span>Rejected: {cockpit?.orders?.rejected ?? 0}</span>
              <span>Kill Switch: {cockpit?.risk?.killSwitch ? 'ON' : 'OFF'}</span>
              <span>Session: {cockpit?.connection?.session || '--'}</span>
            </div>
          </div>
        </>
      )}

      <ModifyOrderModal
        isOpen={isModifyModalOpen}
        order={selectedOrderForModify}
        onClose={() => {
          setIsModifyModalOpen(false);
          setSelectedOrderForModify(null);
        }}
        onModifyComplete={handleModifyComplete}
        showToast={showToast}
      />

      <CancelOrderModal
        isOpen={isCancelModalOpen}
        order={selectedOrderForCancel}
        onClose={() => {
          setIsCancelModalOpen(false);
          setSelectedOrderForCancel(null);
        }}
        onConfirm={handleCancelConfirm}
        isCancelling={isCancelling}
      />
    </div>
  );
};

const MinusIcon: React.FC<{ minimized: boolean }> = ({ minimized }) =>
  minimized ? <ClipboardList size={14} /> : <Activity size={14} />;

export default memo(AccountPanel);
