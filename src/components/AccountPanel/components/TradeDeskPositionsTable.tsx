import React, { memo, useCallback, useMemo, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import styles from '../AccountPanel.module.css';
import { BaseTable } from '../../shared';
import type { ColumnDefinition } from '../../shared';
import type { TradeDeskPosition } from '../../../hooks/useTradeDeskData';

interface PositionRow extends TradeDeskPosition {
  tradeDeskPnl?: number;
}

export interface TradeDeskPositionsTableProps {
  positions: TradeDeskPosition[];
  currentSymbolKey?: string;
  onRowClick?: (symbol: string, exchange?: string) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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

const TradeDeskPositionsTable: React.FC<TradeDeskPositionsTableProps> = ({
  positions,
  currentSymbolKey = '',
  onRowClick,
  searchTerm,
  showFilters,
}) => {
  const [showCurrentSymbolOnly, setShowCurrentSymbolOnly] = useState(false);
  const [strategyFilter, setStrategyFilter] = useState('ALL');

  const strategyOptions = useMemo(
    () => ['ALL', ...new Set(positions.map((position) => String(position.strategy || 'MANUAL')).filter(Boolean))],
    [positions],
  );

  const filteredPositions = useMemo(() => {
    return positions
      .map((position) => {
        const entry = toNumber(position.entry_price);
        const current = toNumber(position.current_price);
        const quantity = toNumber(position.quantity);
        const side = String(position.side || 'BUY').toUpperCase();
        const multiplier = side === 'SELL' ? -1 : 1;
        const tradeDeskPnl = (current - entry) * quantity * multiplier;
        return { ...position, tradeDeskPnl };
      })
      .filter((position) => {
        const symbolText = `${position.index_name || ''} ${position.symbol || ''}`.toLowerCase();
        const matchesSearch = !searchTerm || symbolText.includes(searchTerm.toLowerCase());
        const matchesStrategy = strategyFilter === 'ALL' || String(position.strategy || 'MANUAL') === strategyFilter;
        const positionKey = normalizeKey(String(position.index_name || position.symbol || ''));
        const matchesCurrentSymbol = !showCurrentSymbolOnly || !currentSymbolKey || positionKey === currentSymbolKey;
        return matchesSearch && matchesStrategy && matchesCurrentSymbol;
      })
      .sort((a, b) => (b.opened_at || '').localeCompare(a.opened_at || ''));
  }, [positions, searchTerm, strategyFilter, showCurrentSymbolOnly, currentSymbolKey]);

  const columns: ColumnDefinition<PositionRow>[] = useMemo(
    () => [
      {
        key: 'strategy',
        title: 'Strategy',
        width: '10%',
        render: (row) => <span className={styles.symbolCell}>{String(row.strategy || 'MANUAL')}</span>,
      },
      {
        key: 'index_name',
        title: 'Index',
        width: '12%',
        render: (row) => String(row.index_name || '--'),
      },
      {
        key: 'symbol',
        title: 'Symbol',
        width: '18%',
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
        width: '8%',
        align: 'right',
        render: (row) => toNumber(row.quantity).toLocaleString('en-IN'),
      },
      {
        key: 'entry_price',
        title: 'Avg',
        width: '10%',
        align: 'right',
        render: (row) => toNumber(row.entry_price).toFixed(2),
      },
      {
        key: 'current_price',
        title: 'LTP',
        width: '10%',
        align: 'right',
        render: (row) => toNumber(row.current_price).toFixed(2),
      },
      {
        key: 'tradeDeskPnl',
        title: 'Live P&L',
        width: '11%',
        align: 'right',
        render: (row) => (
          <span className={toNumber(row.tradeDeskPnl) >= 0 ? styles.positive : styles.negative}>
            {toNumber(row.tradeDeskPnl).toFixed(2)}
          </span>
        ),
      },
      {
        key: 'mode',
        title: 'Mode',
        width: '8%',
        render: (row) => String(row.mode || (row.paper ? 'PAPER' : '--')),
      },
      {
        key: 'opened_at',
        title: 'Opened',
        width: '12%',
        render: (row) => <span className={styles.timeCell}>{String(row.opened_at || '--')}</span>,
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (row: PositionRow, _event: MouseEvent<HTMLTableRowElement>) => {
      if (onRowClick && row.symbol) {
        onRowClick(String(row.symbol), row.exchange ? String(row.exchange) : undefined);
      }
    },
    [onRowClick],
  );

  const rowClassName = useCallback(
    (row: PositionRow) => {
      const rowKey = normalizeKey(String(row.index_name || row.symbol || ''));
      return currentSymbolKey && rowKey === currentSymbolKey ? styles.tradeDeskHighlightedRow : '';
    },
    [currentSymbolKey],
  );

  return (
    <div className={styles.tableContainer}>
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
        data={filteredPositions as unknown as Record<string, unknown>[]}
        keyField="position_id"
        onRowClick={handleRowClick as any}
        rowClassName={rowClassName as any}
        emptyState={
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📌</span>
            <p>No live positions in the system.</p>
          </div>
        }
      />
    </div>
  );
};

export default memo(TradeDeskPositionsTable);
