/**
 * OrdersTable Component
 * Renders the orders table for AccountPanel with search and filter
 */
import React, { useState, useMemo, useCallback, memo } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { XCircle, Edit } from 'lucide-react';
import styles from '../AccountPanel.module.css';
import { formatCurrency, isOpenOrderStatus, sortData } from '../utils/accountFormatters';
import { BaseTable } from '../../shared';

interface Order {
    symbol: string;
    exchange: string;
    action: string;
    pricetype: string;
    product: string;
    quantity: string | number;
    filledqty?: string | number;
    filled_quantity?: string | number;
    price: string | number;
    average_price: string | number;
    order_status: string;
    orderid?: string;
    timestamp?: string;
}

interface SortConfig {
    key: string | null;
    direction: 'asc' | 'desc';
}

interface Filters {
    action: string[];
    status: string[];
    exchange: string[];
    product: string[];
}

interface Column {
    key: string;
    title: string;
    width: string;
    align?: 'left' | 'center' | 'right';
    sortable?: boolean;
    render?: (row: Order) => ReactNode;
}

export interface OrdersTableProps {
    orders: Order[];
    onRowClick?: (symbol: string, exchange: string) => void;
    onCancelOrder: (order: Order, e: MouseEvent<HTMLButtonElement>) => void;
    onModifyOrder: (order: Order, e: MouseEvent<HTMLButtonElement>) => void;
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    showFilters: boolean;
    onToggleFilters: () => void;
}

const OrdersTable: React.FC<OrdersTableProps> = ({
    orders,
    onRowClick,
    onCancelOrder,
    onModifyOrder,
    searchTerm,
    onSearchTermChange,
    showFilters,
    onToggleFilters
}) => {
    const [filters, setFilters] = useState<Filters>({
        action: [],
        status: [],
        exchange: [],
        product: []
    });
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });

    // Get unique values for filters
    const uniqueActions = useMemo(() => {
        return [...new Set(orders.map(o => o.action).filter(Boolean))];
    }, [orders]);

    const uniqueStatuses = useMemo(() => {
        return [...new Set(orders.map(o => o.order_status).filter(Boolean))];
    }, [orders]);

    const uniqueExchanges = useMemo(() => {
        return [...new Set(orders.map(o => o.exchange).filter(Boolean))];
    }, [orders]);

    const uniqueProducts = useMemo(() => {
        return [...new Set(orders.map(o => o.product).filter(Boolean))];
    }, [orders]);

    // Filter and sort orders
    const sortedOrders = useMemo(() => {
        const normalizeStatus = (s: string | undefined): string => (s || '').toUpperCase().replace(/\s+/g, '_');

        const filtered = orders
            .filter(order => {
                // Search filter
                const matchesSearch = !searchTerm ||
                    order.symbol?.toLowerCase().includes(searchTerm.toLowerCase());

                // Action filter
                const matchesAction = filters.action.length === 0 ||
                    filters.action.includes(order.action);

                // Status filter
                const matchesStatus = filters.status.length === 0 ||
                    filters.status.includes(order.order_status);

                // Exchange filter
                const matchesExchange = filters.exchange.length === 0 ||
                    filters.exchange.includes(order.exchange);

                // Product filter
                const matchesProduct = filters.product.length === 0 ||
                    filters.product.includes(order.product);

                return matchesSearch && matchesAction && matchesStatus &&
                    matchesExchange && matchesProduct;
            });

        // Apply sorting if configured, otherwise default sort
        if (sortConfig.key) {
            return sortData(filtered, sortConfig);
        }

        return filtered.sort((a, b) => {
            const statusA = normalizeStatus(a.order_status);
            const statusB = normalizeStatus(b.order_status);

            const isOpenA = ['OPEN', 'PENDING', 'TRIGGER_PENDING', 'AMO_REQ_RECEIVED'].includes(statusA);
            const isOpenB = ['OPEN', 'PENDING', 'TRIGGER_PENDING', 'AMO_REQ_RECEIVED'].includes(statusB);

            if (isOpenA && !isOpenB) return -1;
            if (!isOpenA && isOpenB) return 1;

            return (b.timestamp || '').localeCompare(a.timestamp || '');
        });
    }, [orders, searchTerm, filters, sortConfig]);

    // Handle filter toggle
    const handleFilterToggle = useCallback((filterType: keyof Filters, value: string): void => {
        setFilters(prev => {
            const currentFilters = prev[filterType];
            const newFilters = currentFilters.includes(value)
                ? currentFilters.filter(v => v !== value)
                : [...currentFilters, value];
            return { ...prev, [filterType]: newFilters };
        });
    }, []);

    // Clear all filters
    const handleClearFilters = useCallback((): void => {
        onSearchTermChange('');
        setFilters({ action: [], status: [], exchange: [], product: [] });
    }, [onSearchTermChange]);

    // Handle column sorting
    const handleSort = useCallback((key: string): void => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, []);

    const hasActiveFilters = !!searchTerm || filters.action.length > 0 ||
        filters.status.length > 0 || filters.exchange.length > 0 || filters.product.length > 0;

    // Define columns for BaseTable
    const columns: Column[] = useMemo(() => [
        {
            key: 'timestamp',
            title: 'Time',
            width: '12%',
            sortable: true,
            render: (row: Order) => <span className={styles.timeCell}>{row.timestamp}</span>
        },
        {
            key: 'symbol',
            title: 'Symbol',
            width: '15%',
            sortable: true,
            render: (row: Order) => <span className={styles.symbolCell}>{row.symbol}</span>
        },
        {
            key: 'action',
            title: 'Action',
            width: '7%',
            render: (row: Order) => (
                <span className={row.action === 'BUY' ? styles.positive : styles.negative}>
                    {row.action}
                </span>
            )
        },
        { key: 'pricetype', title: 'Type', width: '8%' },
        {
            key: 'quantity',
            title: 'Qty',
            width: '10%',
            align: 'right' as const,
            sortable: true,
            render: (row: Order) => {
                const totalQty = parseFloat(String(row.quantity || 0));
                const filledQty = parseFloat(String(row.filledqty || row.filled_quantity || 0));
                const pendingQty = totalQty - filledQty;

                let qtyDisplay: string;
                if (filledQty > 0 && filledQty < totalQty) {
                    qtyDisplay = `${filledQty}/${totalQty}`;
                } else {
                    qtyDisplay = totalQty.toString();
                }

                return (
                    <>
                        {qtyDisplay}
                        {filledQty > 0 && filledQty < totalQty && (
                            <span className={styles.partialFill} title={`${pendingQty} pending`}> ⏳</span>
                        )}
                    </>
                );
            }
        },
        {
            key: 'price',
            title: 'Limit Price',
            width: '10%',
            align: 'right' as const,
            sortable: true,
            render: (row: Order) => formatCurrency(parseFloat(String(row.price || 0)))
        },
        {
            key: 'average_price',
            title: 'Fill Price',
            width: '10%',
            align: 'right' as const,
            sortable: true,
            render: (row: Order) => {
                const avgPrice = parseFloat(String(row.average_price || 0));
                return avgPrice > 0 ? formatCurrency(avgPrice) : '-';
            }
        },
        {
            key: 'status',
            title: 'Status',
            width: '15%',
            render: (row: Order) => (
                <span className={`${styles.statusBadge} ${styles[`status${row.order_status}`]}`}>
                    {row.order_status}
                </span>
            )
        },
        {
            key: 'orderAction',
            title: 'Action',
            width: '13%',
            align: 'center' as const,
            render: (row: Order) => {
                const canCancel = isOpenOrderStatus(row.order_status);
                if (!canCancel) return <span className={styles.noAction}>-</span>;

                return (
                    <div className={styles.actionButtons}>
                        <button
                            className={styles.modifyBtn}
                            onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                e.stopPropagation();
                                onModifyOrder(row, e);
                            }}
                            title="Modify order"
                        >
                            <Edit size={12} />
                            <span>Modify</span>
                        </button>
                        <button
                            className={styles.cancelBtn}
                            onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                e.stopPropagation();
                                onCancelOrder(row, e);
                            }}
                            title="Cancel order"
                        >
                            <XCircle size={12} />
                            <span>Cancel</span>
                        </button>
                    </div>
                );
            }
        }
    ], [onModifyOrder, onCancelOrder]);

    const handleRowClick = useCallback((row: Order): void => {
        if (onRowClick) {
            onRowClick(row.symbol, row.exchange);
        }
    }, [onRowClick]);

    if (orders.length === 0) {
        return (
            <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>📋</span>
                <p>No orders found for today</p>
            </div>
        );
    }

    return (
        <div className={styles.tableContainer}>
            {/* Filter Dropdowns */}
            {showFilters && (
                <div className={styles.filterPanel}>
                    <div className={styles.filterGroup}>
                        <label>Action</label>
                        <div className={styles.filterOptions}>
                            {uniqueActions.map(action => (
                                <label key={action} className={styles.filterOption}>
                                    <input
                                        type="checkbox"
                                        checked={filters.action.includes(action)}
                                        onChange={() => handleFilterToggle('action', action)}
                                    />
                                    <span>{action}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>Status</label>
                        <div className={styles.filterOptions}>
                            {uniqueStatuses.map(status => (
                                <label key={status} className={styles.filterOption}>
                                    <input
                                        type="checkbox"
                                        checked={filters.status.includes(status)}
                                        onChange={() => handleFilterToggle('status', status)}
                                    />
                                    <span>{status}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>Exchange</label>
                        <div className={styles.filterOptions}>
                            {uniqueExchanges.map(exchange => (
                                <label key={exchange} className={styles.filterOption}>
                                    <input
                                        type="checkbox"
                                        checked={filters.exchange.includes(exchange)}
                                        onChange={() => handleFilterToggle('exchange', exchange)}
                                    />
                                    <span>{exchange}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>Product</label>
                        <div className={styles.filterOptions}>
                            {uniqueProducts.map(product => (
                                <label key={product} className={styles.filterOption}>
                                    <input
                                        type="checkbox"
                                        checked={filters.product.includes(product)}
                                        onChange={() => handleFilterToggle('product', product)}
                                    />
                                    <span>{product}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Results Count */}
            {hasActiveFilters && (
                <div className={styles.resultsCount}>
                    Showing {sortedOrders.length} of {orders.length} orders
                </div>
            )}

            {/* Use BaseTable */}
            <BaseTable
                columns={columns as any}
                data={sortedOrders as any}
                onSort={handleSort}
                sortConfig={sortConfig}
                onRowClick={handleRowClick as any}
                keyField="orderid"
                emptyState={
                    <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}>🔍</span>
                        <p>No orders match your filters</p>
                        <button className={styles.clearFiltersBtn} onClick={handleClearFilters}>
                            Clear Filters
                        </button>
                    </div>
                }
            />
        </div>
    );
};

export default memo(OrdersTable);
