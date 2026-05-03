import React, { memo, useCallback, useMemo, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { Filter, Search, X } from 'lucide-react';
import styles from '../AccountPanel.module.css';
import { BaseTable } from '../../shared';
import type { ColumnDefinition } from '../../shared';
import type { TradeDeskTrade } from '../../../hooks/useTradeDeskData';

interface TradeRow extends TradeDeskTrade {
  tradeDeskPnlValue?: number;
}

export interface TradeDeskTradesTableProps {
  trades: TradeDeskTrade[];
  currentSymbolKey?: string;
  onRowClick?: (symbol: string, exchange?: string) => void;
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

function extractPnl(trade: TradeDeskTrade): number {
  if (typeof trade.pnl === 'number') return trade.pnl;
  if (trade.pnl && typeof trade.pnl === 'object' && 'total' in trade.pnl) {
    return Number(trade.pnl.total || 0);
  }
  return 0;
}

const TradeDeskTradesTable: React.FC<TradeDeskTradesTableProps> = ({
  trades,
  currentSymbolKey = '',
  onRowClick,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showCurrentSymbolOnly, setShowCurrentSymbolOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const strategyOptions = useMemo(
    () => ['ALL', ...new Set(trades.map((trade) => String(trade.strategy || 'MANUAL')).filter(Boolean))],
    [trades],
  );

  const filteredTrades = useMemo(() => {
    return trades
      .map((trade) => ({ ...trade, tradeDeskPnlValue: extractPnl(trade) }))
      .filter((trade) => {
        const haystack = `${trade.index || ''} ${trade.symbol || ''}`.toLowerCase();
        const matchesSearch = !searchTerm || haystack.includes(searchTerm.toLowerCase());
        const matchesStrategy =
          strategyFilter === 'ALL' || String(trade.strategy || 'MANUAL') === strategyFilter;
        const tradeStatus = String(trade.status || (trade.closeTime ? 'CLOSED' : 'OPEN')).toUpperCase();
        const matchesStatus = statusFilter === 'ALL' || tradeStatus === statusFilter;
        const rowKey = normalizeKey(String(trade.index || trade.symbol || ''));
        const matchesCurrentSymbol = !showCurrentSymbolOnly || !currentSymbolKey || rowKey === currentSymbolKey;
        return matchesSearch && matchesStrategy && matchesStatus && matchesCurrentSymbol;
      })
      .sort((a, b) => String(b.openTime || b.closeTime || '').localeCompare(String(a.openTime || a.closeTime || '')));
  }, [trades, searchTerm, strategyFilter, statusFilter, showCurrentSymbolOnly, currentSymbolKey]);

  const columns: ColumnDefinition<TradeRow>[] = useMemo(
    () => [
      {
        key: 'openTime',
        title: 'Time',
        width: '12%',
        render: (row) => <span className={styles.timeCell}>{String(row.closeTime || row.openTime || '--')}</span>,
      },
      {
        key: 'strategy',
        title: 'Strategy',
        width: '10%',
        render: (row) => <span className={styles.symbolCell}>{String(row.strategy || 'MANUAL')}</span>,
      },
      {
        key: 'index',
        title: 'Index',
        width: '12%',
        render: (row) => String(row.index || '--'),
      },
      {
        key: 'symbol',
        title: 'Symbol',
        width: '16%',
        render: (row) => <span className={styles.symbolCell}>{String(row.symbol || '--')}</span>,
      },
      {
        key: 'side',
        title: 'Side',
        width: '7%',
        render: (row) => (
          <span className={String(row.side || '').toUpperCase() === 'BUY' ? styles.positive : styles.negative}>
            {String(row.side || '--')}
          </span>
        ),
      },
      {
        key: 'quantity',
        title: 'Qty',
        width: '7%',
        align: 'right',
        render: (row) => Number(row.quantity || 0).toLocaleString('en-IN'),
      },
      {
        key: 'entryPrice',
        title: 'Entry',
        width: '9%',
        align: 'right',
        render: (row) => Number(row.entryPrice || 0).toFixed(2),
      },
      {
        key: 'exitPrice',
        title: 'Exit/Now',
        width: '9%',
        align: 'right',
        render: (row) => Number(row.exitPrice ?? row.currentPrice ?? 0).toFixed(2),
      },
      {
        key: 'tradeDeskPnlValue',
        title: 'P&L',
        width: '8%',
        align: 'right',
        render: (row) => (
          <span className={Number(row.tradeDeskPnlValue || 0) >= 0 ? styles.positive : styles.negative}>
            {Number(row.tradeDeskPnlValue || 0).toFixed(2)}
          </span>
        ),
      },
      {
        key: 'status',
        title: 'Status',
        width: '10%',
        render: (row) => {
          const value = String(row.status || (row.closeTime ? 'CLOSED' : 'OPEN')).toUpperCase();
          return <span className={styles.statusBadge}>{value}</span>;
        },
      },
    ],
    [],
  );

  const hasActiveFilters =
    Boolean(searchTerm) || strategyFilter !== 'ALL' || statusFilter !== 'ALL' || showCurrentSymbolOnly;

  const handleRowClick = useCallback(
    (row: TradeRow, _event: MouseEvent<HTMLTableRowElement>) => {
      if (onRowClick && row.symbol) {
        onRowClick(String(row.symbol), row.exchange ? String(row.exchange) : undefined);
      }
    },
    [onRowClick],
  );

  const rowClassName = useCallback(
    (row: TradeRow) => {
      const rowKey = normalizeKey(String(row.index || row.symbol || ''));
      return currentSymbolKey && rowKey === currentSymbolKey ? styles.tradeDeskHighlightedRow : '';
    },
    [currentSymbolKey],
  );

  return (
    <div className={styles.tableContainer}>
      <div className={styles.tableControls}>
        <div className={styles.searchBar}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search today's trades..."
            value={searchTerm}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
            className={styles.searchInput}
          />
          {searchTerm && <X size={14} className={styles.clearIcon} onClick={() => setSearchTerm('')} />}
        </div>
        <button
          className={`${styles.filterBtn} ${hasActiveFilters ? styles.filterActive : ''}`}
          onClick={() => setShowFilters((previous) => !previous)}
          title="Toggle filters"
        >
          <Filter size={14} />
          <span>Filters</span>
        </button>
      </div>

      {showFilters && (
        <div className={styles.tradeDeskFiltersPanel}>
          <div className={styles.tradeDeskFilterGroup}>
            <span className={styles.summaryLabel}>Strategy</span>
            <select
              className={styles.tradeDeskSelect}
              value={strategyFilter}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setStrategyFilter(event.target.value)}
            >
              {strategyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.tradeDeskFilterGroup}>
            <span className={styles.summaryLabel}>Status</span>
            <select
              className={styles.tradeDeskSelect}
              value={statusFilter}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">ALL</option>
              <option value="OPEN">OPEN</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
          <label className={styles.tradeDeskCheckbox}>
            <input
              type="checkbox"
              checked={showCurrentSymbolOnly}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setShowCurrentSymbolOnly(event.target.checked)}
            />
            Current chart symbol only
          </label>
        </div>
      )}

      <BaseTable
        columns={columns}
        data={filteredTrades as unknown as Record<string, unknown>[]}
        keyField="tradeId"
        onRowClick={handleRowClick as any}
        rowClassName={rowClassName as any}
        emptyState={
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>🧾</span>
            <p>No trades available for today.</p>
          </div>
        }
      />
    </div>
  );
};

export default memo(TradeDeskTradesTable);
