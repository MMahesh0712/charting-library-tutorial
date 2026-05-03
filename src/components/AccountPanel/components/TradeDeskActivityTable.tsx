import React, { memo, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import styles from '../AccountPanel.module.css';
import { BaseTable } from '../../shared';
import type { ColumnDefinition } from '../../shared';

export interface TradeDeskActivityRow {
  id: string;
  timestamp: string;
  type: string;
  strategy: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  [key: string]: unknown;
}

export interface TradeDeskActivityTableProps {
  rows: TradeDeskActivityRow[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
}

const TradeDeskActivityTable: React.FC<TradeDeskActivityTableProps> = ({ rows, searchTerm, showFilters }) => {
  const [severityFilter, setSeverityFilter] = useState('ALL');

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => {
        const matchesSearch = !searchTerm || `${row.type} ${row.strategy} ${row.message}`.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSeverity = severityFilter === 'ALL' || row.severity.toUpperCase() === severityFilter;
        return matchesSearch && matchesSeverity;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [rows, searchTerm, severityFilter]);

  const columns: ColumnDefinition<TradeDeskActivityRow>[] = useMemo(
    () => [
      {
        key: 'timestamp',
        title: 'Time',
        width: '18%',
        render: (row) => <span className={styles.timeCell}>{row.timestamp}</span>,
      },
      {
        key: 'type',
        title: 'Type',
        width: '14%',
        render: (row) => <span className={styles.symbolCell}>{row.type}</span>,
      },
      {
        key: 'strategy',
        title: 'Strategy',
        width: '12%',
        render: (row) => row.strategy,
      },
      {
        key: 'message',
        title: 'Message',
        width: '42%',
        render: (row) => <span className={styles.tradeDeskMessage}>{row.message}</span>,
      },
      {
        key: 'severity',
        title: 'Severity',
        width: '14%',
        render: (row) => (
          <span
            className={`${styles.statusBadge} ${
              row.severity === 'critical'
                ? styles.tradeDeskCritical
                : row.severity === 'warning'
                  ? styles.tradeDeskWarning
                  : styles.tradeDeskInfo
            }`}
          >
            {row.severity.toUpperCase()}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className={styles.tableContainer}>
      {showFilters && (
        <div className={styles.tradeDeskFiltersPanel}>
          <div className={styles.tradeDeskFilterGroup}>
            <span className={styles.summaryLabel}>Severity</span>
            <select
              className={styles.tradeDeskSelect}
              value={severityFilter}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setSeverityFilter(event.target.value)}
            >
              <option value="ALL">ALL</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
        </div>
      )}

      <BaseTable
        columns={columns}
        data={filteredRows as unknown as Record<string, unknown>[]}
        keyField="id"
        emptyState={
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📡</span>
            <p>No activity events to show.</p>
          </div>
        }
      />
    </div>
  );
};

export default memo(TradeDeskActivityTable);
