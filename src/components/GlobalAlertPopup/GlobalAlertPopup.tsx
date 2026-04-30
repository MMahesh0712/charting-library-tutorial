import React, { useState, useCallback, useEffect } from 'react';
import type { MouseEvent } from 'react';
import styles from './GlobalAlertPopup.module.css';
import { normalizeSymbolExchange } from '../../utils/symbolNormalization';

interface AlertNotification {
    id: string;
    symbol: string;
    exchange: string;
    direction?: 'up' | 'down';
    price?: number;
    timestamp: number;
    // Indicator alert fields
    alertType?: 'price' | 'indicator';
    indicator?: string;
    condition?: string;
    message?: string;
    currentPrice?: number;
}

interface SymbolInfo {
    symbol: string;
    exchange: string;
}

export interface GlobalAlertPopupProps {
    alerts: AlertNotification[];
    onDismiss?: (alertId: string) => void;
    onClick?: (symbolInfo: SymbolInfo) => void;
}

/**
 * GlobalAlertPopup - Shows alert notifications for background alerts
 * Works independently of which chart is currently being viewed
 */
// React.memo prevents re-render when parent re-renders but props unchanged (TSK-CS-029)
const GlobalAlertPopup: React.FC<GlobalAlertPopupProps> = React.memo(function GlobalAlertPopup({ alerts, onDismiss, onClick }) {
    const [dismissing, setDismissing] = useState<Record<string, boolean>>({});

    const handleDismiss = useCallback((alertId: string): void => {
        setDismissing(prev => ({ ...prev, [alertId]: true }));
        setTimeout(() => {
            onDismiss?.(alertId);
            setDismissing(prev => {
                const next = { ...prev };
                delete next[alertId];
                return next;
            });
        }, 300);
    }, [onDismiss]);

    // Auto-dismiss after 15 seconds
    useEffect(() => {
        const timers: Record<string, ReturnType<typeof setTimeout>> = {};
        alerts.forEach(alert => {
            timers[alert.id] = setTimeout(() => {
                handleDismiss(alert.id);
            }, 15000);
        });

        return () => {
            Object.values(timers).forEach(t => clearTimeout(t));
        };
    }, [alerts, handleDismiss]);

    const handleClick = useCallback((alert: AlertNotification, e: MouseEvent<HTMLDivElement>): void => {
        // Don't navigate if clicking close button
        if ((e.target as HTMLElement).closest('button')) return;

        if (onClick) {
            // Normalize symbol/exchange before navigating — ensures canonical routing
            const normalized = normalizeSymbolExchange(alert.symbol, alert.exchange);
            onClick({ symbol: normalized.symbol, exchange: normalized.exchange });
            handleDismiss(alert.id);
        }
    }, [onClick, handleDismiss]);

    const formatTime = (timestamp: number): string => {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    };

    if (!alerts || alerts.length === 0) return null;

    return (
        <div className={styles.container}>
            {alerts.map(alert => {
                const isIndicatorAlert = alert.alertType === 'indicator';
                // Use canonical display name for header/footer
                const { symbol: displaySymbol } = normalizeSymbolExchange(alert.symbol, alert.exchange);
                const icon = isIndicatorAlert ? '📊' : '🔔';
                const indicatorName = alert.indicator?.toUpperCase() || 'Indicator';
                const header = isIndicatorAlert
                    ? indicatorName + ' Alert — ' + displaySymbol
                    : displaySymbol + ' Alert';
                const dirArrow = alert.direction === 'up' ? '↑' : alert.direction === 'down' ? '↓' : '';
                const conditionSuffix = alert.condition ? ': ' + alert.condition : '';
                const currentPriceSuffix = alert.currentPrice != null ? ' (now ' + alert.currentPrice + ')' : '';
                const message = isIndicatorAlert
                    ? (alert.message || (alert.indicator + ' condition met' + conditionSuffix))
                    : ('Price ' + dirArrow + ' ' + (alert.price ?? '') + currentPriceSuffix);

                return (
                    <div
                        key={alert.id}
                        className={`${styles.notification} ${dismissing[alert.id] ? styles.dismissing : ''}`}
                        onClick={(e) => handleClick(alert, e)}
                        style={{ cursor: 'pointer' }}
                        title="Click to view chart"
                    >
                        {/* Icon */}
                        <div className={styles.icon}>{icon}</div>

                        {/* Content */}
                        <div className={styles.content}>
                            <div className={styles.header}>{header}</div>
                            <div className={styles.message}>{message}</div>
                            <div className={styles.footer}>
                                <span className={styles.viewChart}>{displaySymbol} →</span>
                                <span className={styles.timestamp}>{formatTime(alert.timestamp)}</span>
                            </div>
                        </div>

                        {/* Close button */}
                        <button
                            className={styles.closeBtn}
                            onClick={() => handleDismiss(alert.id)}
                        >
                            ×
                        </button>
                    </div>
                );
            })}
        </div>
    );

});

export default GlobalAlertPopup;
