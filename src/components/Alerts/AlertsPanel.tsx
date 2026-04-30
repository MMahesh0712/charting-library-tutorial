import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Bell, Trash2, PlayCircle, PauseCircle, Edit2, TrendingUp } from 'lucide-react';
import styles from './AlertsPanel.module.css';
import classNames from 'classnames';
import { normalizeSymbolExchange } from '../../utils/symbolNormalization';

type AlertStatus = 'Active' | 'Triggered' | 'Paused';

interface AlertCondition {
    label?: string;
}

interface Alert {
    id: string;
    symbol: string;
    exchange?: string;
    status?: AlertStatus;
    condition?: AlertCondition | string;
    name?: string;
    type?: 'indicator' | 'price';
    created_at: string | number;
}

interface AlertLog {
    id: string;
    symbol: string;
    exchange?: string;
    time: string | number;
    message: string;
}

interface NavigateInfo {
    symbol: string;
    exchange: string;
}

export interface AlertsPanelProps {
    alerts: Alert[];
    logs: AlertLog[];
    onRemoveAlert: (id: string) => void;
    onRestartAlert: (id: string) => void;
    onPauseAlert: (id: string) => void;
    onNavigate?: (info: NavigateInfo) => void;
    onEditAlert?: (alert: Alert) => void;
}

// React.memo prevents re-render when parent re-renders but props unchanged (TSK-CS-029)
const AlertsPanel: React.FC<AlertsPanelProps> = React.memo(function AlertsPanel({
    alerts,
    logs,
    onRemoveAlert,
    onRestartAlert,
    onPauseAlert,
    onNavigate,
    onEditAlert
}) {
    const [activeTab, setActiveTab] = useState<'alerts' | 'log'>('alerts');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset focusedIndex when tab changes
    useEffect(() => {
        setFocusedIndex(-1);
    }, [activeTab]);

    // Keyboard navigation handler
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
        const items = activeTab === 'alerts' ? alerts : logs;
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex(prev => prev < 0 ? 0 : Math.min(prev + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex(prev => prev < 0 ? 0 : Math.max(prev - 1, 0));
        } else if (e.key === 'Delete' && focusedIndex >= 0 && activeTab === 'alerts') {
            e.preventDefault();
            onRemoveAlert(alerts[focusedIndex].id);
        } else if (e.key === ' ' && focusedIndex >= 0 && activeTab === 'alerts') {
            e.preventDefault();
            const alert = alerts[focusedIndex];
            if (alert.status === 'Active') onPauseAlert(alert.id);
            else onRestartAlert(alert.id);
        }
    }, [activeTab, alerts, logs, focusedIndex, onRemoveAlert, onPauseAlert, onRestartAlert]);

    // Handle click on alert row to navigate to that chart
    const handleAlertClick = useCallback((alert: Alert, e: MouseEvent<HTMLDivElement>): void => {
        // Don't navigate if clicking on action buttons
        if ((e.target as HTMLElement).closest('svg') || (e.target as HTMLElement).closest('button')) return;

        if (onNavigate && alert.symbol) {
            // Normalize before navigating — canonical routing
            const normalized = normalizeSymbolExchange(alert.symbol, alert.exchange || 'NSE');
            onNavigate({ symbol: normalized.symbol, exchange: normalized.exchange });
        }
    }, [onNavigate]);

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <span className={styles.title}>Alerts</span>
                <div className={styles.actions}>
                    {/* Add actions if needed */}
                </div>
            </div>

            <div className={styles.tabs}>
                <div
                    className={classNames(styles.tab, { [styles.activeTab]: activeTab === 'alerts' })}
                    onClick={() => setActiveTab('alerts')}
                >
                    Alerts
                </div>
                <div
                    className={classNames(styles.tab, { [styles.activeTab]: activeTab === 'log' })}
                    onClick={() => setActiveTab('log')}
                >
                    Log
                    {logs.length > 0 && <span className={styles.logCount}>{logs.length}</span>}
                </div>
            </div>

            <div className={styles.content}>
                {activeTab === 'alerts' ? (
                    <div
                        className={styles.list}
                        ref={listRef}
                        tabIndex={0}
                        onKeyDown={handleKeyDown}
                    >
                        {alerts.length === 0 ? (
                            <div className={styles.emptyState}>No active alerts</div>
                        ) : (
                            alerts.map((alert, index) => {
                                const status = alert.status || 'Active';
                                const statusKey = status.toLowerCase();
                                const isIndicatorAlert = alert.type === 'indicator';
                                const { symbol: displaySymbol } = normalizeSymbolExchange(alert.symbol, alert.exchange || 'NSE');
                                const AlertIcon = isIndicatorAlert ? TrendingUp : Bell;
                                const getConditionDescription = (): string => {
                                    if (isIndicatorAlert) {
                                        const condition = alert.condition as AlertCondition | undefined;
                                        return condition?.label || alert.name || 'Indicator Alert';
                                    }
                                    return (alert.condition as string) || 'Price Alert';
                                };
                                return (
                                    <div
                                        key={alert.id}
                                        className={classNames(styles.item, styles[statusKey], {
                                            [styles.focused]: index === focusedIndex,
                                            [styles.indicatorAlert]: isIndicatorAlert
                                        })}
                                        onClick={(e) => handleAlertClick(alert, e)}
                                        style={{ cursor: "pointer" }}
                                        title="Click to view chart"
                                    >
                                        <div className={styles.itemHeader}>
                                            <div className={styles.symbolGroup}>
                                                <AlertIcon size={14} className={styles.alertTypeIcon} />
                                                <span className={styles.symbol}>{displaySymbol}</span>
                                            </div>
                                            <span className={classNames(styles.status, styles[statusKey])}>
                                                {status}
                                            </span>
                                        </div>
                                        <div className={styles.condition}>
                                            {getConditionDescription()}
                                        </div>
                                        <div className={styles.itemFooter}>
                                            <span className={styles.time}>
                                                {new Date(alert.created_at).toLocaleDateString()} {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                            <div className={styles.itemActions}>
                                                {status === 'Active' && (
                                                    <span title="Pause Alert">
                                                        <PauseCircle
                                                            size={16}
                                                            className={styles.actionIcon}
                                                            onClick={() => onPauseAlert(alert.id)}
                                                        />
                                                    </span>
                                                )}
                                                {(status === 'Triggered' || status === 'Paused') && (
                                                    <span title="Resume Alert">
                                                        <PlayCircle
                                                            size={16}
                                                            className={styles.actionIcon}
                                                            onClick={() => onRestartAlert(alert.id)}
                                                        />
                                                    </span>
                                                )}
                                                <span title="Edit Alert">
                                                    <Edit2
                                                        size={16}
                                                        className={styles.actionIcon}
                                                        onClick={() => onEditAlert?.(alert)}
                                                    />
                                                </span>
                                                <span title="Remove Alert">
                                                    <Trash2
                                                        size={16}
                                                        className={styles.actionIcon}
                                                        onClick={() => onRemoveAlert(alert.id)}
                                                    />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                ) : (
                    <div
                        className={styles.list}
                        ref={listRef}
                        tabIndex={0}
                        onKeyDown={handleKeyDown}
                    >
                        {logs.length === 0 ? (
                            <div className={styles.emptyState}>No logs</div>
                        ) : (
                            logs.map((log, index) => {
                                const { symbol: displaySymbol } = normalizeSymbolExchange(log.symbol, log.exchange || 'NSE');
                                const logDate = new Date(log.time);
                                const dateStr = logDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
                                const timeStr = logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                return (
                                    <div key={`${log.id}-${index}`} className={classNames(styles.logItem, {
                                        [styles.focused]: index === focusedIndex
                                    })}>
                                        <div className={styles.logHeader}>
                                            <span className={styles.symbol}>{displaySymbol}</span>
                                            <span className={styles.time}>{dateStr} {timeStr}</span>
                                        </div>
                                        <div className={styles.message}>{log.message}</div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

export default AlertsPanel;
