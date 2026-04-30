import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import type { FC, ChangeEvent, KeyboardEvent } from 'react';
import { BaseModal, Button, Text } from '../shared';
import { X, Loader2, RefreshCw, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { getOptionChain, getAvailableExpiries, UNDERLYINGS } from '../../services/optionChain';
import { subscribeToMultiTicker, getMultiOptionGreeks } from '../../services/openalgo';
import styles from './OptionChainModal.module.css';
import classNames from 'classnames';
import logger from '../../utils/logger';

// Import extracted components and format helpers
import { formatCurrency, formatPrice } from '../../utils/shared/formatters';
import { formatOI, formatLTP, formatLtpChange, formatDelta, formatIv, formatTheta, formatVega, formatGamma } from './components';
import { useOptionChainKeyboard } from './hooks';

type ViewMode = 'ltp-oi' | 'greeks';
type ColumnType = 'ce' | 'pe';

interface Underlying {
    symbol: string;
    name?: string;
    exchange: string;
    indexExchange?: string;
}

interface OptionData {
    symbol?: string;
    ltp?: number;
    oi?: number;
    prevClose?: number;
}

interface OptionRow {
    strike: number;
    ce?: OptionData;
    pe?: OptionData;
}

interface OptionChainData {
    chain?: OptionRow[];
    atmStrike?: number;
    underlyingLTP?: number;
    underlyingPrevClose?: number;
    change?: number;
    changePercent?: number;
    underlying?: string;
    expiryDate?: string;
}

interface LiveData {
    ltp?: number;
    volume?: number;
    timestamp?: number;
}

interface Greeks {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
}

interface GreeksData {
    greeks?: Greeks;
    iv?: number;
}

interface GroupedExpiry {
    monthYear: string;
    dates: { expiry: string; day: number | string }[];
}

interface VisibleData {
    groups: GroupedExpiry[];
    scrollAmount: number;
}

interface InitialSymbol {
    symbol: string;
    exchange?: string;
}

interface WebSocketConnection {
    close: () => void;
}

interface MultiGreeksResponse {
    data?: Array<{
        status: string;
        symbol?: string;
        implied_volatility?: number;
        greeks?: Greeks;
    }>;
    summary?: string;
}

export interface OptionChainModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectOption: (symbol: string, exchange: string) => void;
    initialSymbol?: InitialSymbol;
}

/**
 * OptionChainModal - Option Chain UI with proper date alignment
 */
const OptionChainModal: FC<OptionChainModalProps> = ({ isOpen, onClose, onSelectOption, initialSymbol }) => {
    const [underlying, setUnderlying] = useState<Underlying>(UNDERLYINGS[0] as Underlying);
    const [isCustomSymbol, setIsCustomSymbol] = useState(false);
    const [optionChain, setOptionChain] = useState<OptionChainData | null>(null);
    const [availableExpiries, setAvailableExpiries] = useState<string[]>([]);
    const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingExpiries, setIsLoadingExpiries] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expiryScrollIndex, setExpiryScrollIndex] = useState(0);
    const [liveLTP, setLiveLTP] = useState<Map<string, LiveData>>(new Map());
    const [focusedRow, setFocusedRow] = useState(-1);
    const [focusedCol, setFocusedCol] = useState<ColumnType>('ce');
    const [strikeCount, setStrikeCount] = useState(15);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const tableBodyRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocketConnection | null>(null);

    // Greeks mode state
    const [viewMode, setViewMode] = useState<ViewMode>('ltp-oi');
    const [greeksData, setGreeksData] = useState<Map<string, GreeksData>>(new Map());
    const [greeksLoading, setGreeksLoading] = useState(false);

    // Request tracking refs
    const expiryRequestIdRef = useRef(0);
    const chainRequestIdRef = useRef(0);
    const greeksRequestIdRef = useRef(0);
    const failedGreeksSymbolsRef = useRef<Set<string>>(new Set());
    const greeksRetryCountRef = useRef<Map<string, number>>(new Map());
    const MAX_GREEKS_RETRY_COUNT = 3;
    const pendingInitialSymbolRef = useRef(false);

    const MAX_STRIKE_COUNT = 100;
    const STRIKE_INCREMENT = 20;

    // Set underlying from initialSymbol when modal opens
    useEffect(() => {
        if (isOpen && initialSymbol) {
            pendingInitialSymbolRef.current = true;
            expiryRequestIdRef.current++;
            chainRequestIdRef.current++;

            const known = (UNDERLYINGS as Underlying[]).find(u => u.symbol === initialSymbol.symbol);
            if (known) {
                setUnderlying(known);
                setIsCustomSymbol(false);
            } else {
                const sourceExchange = initialSymbol.exchange?.toUpperCase() || 'NSE';
                let foExchange = 'NFO';
                let indexExchange = 'NSE';

                if (sourceExchange === 'BSE' || sourceExchange === 'BSE_INDEX') {
                    foExchange = 'BFO';
                    indexExchange = 'BSE';
                } else if (sourceExchange === 'MCX') {
                    foExchange = 'MCX';
                    indexExchange = 'MCX';
                } else if (sourceExchange === 'CDS') {
                    foExchange = 'CDS';
                    indexExchange = 'CDS';
                } else if (sourceExchange === 'BFO') {
                    foExchange = 'BFO';
                    indexExchange = 'BSE';
                } else if (sourceExchange === 'NFO') {
                    foExchange = 'NFO';
                    indexExchange = 'NSE';
                }

                setUnderlying({
                    symbol: initialSymbol.symbol,
                    name: initialSymbol.symbol,
                    exchange: foExchange,
                    indexExchange: indexExchange
                });
                setIsCustomSymbol(true);
            }
            setOptionChain(null);
            setAvailableExpiries([]);
            setSelectedExpiry(null);
            setExpiryScrollIndex(0);
            setStrikeCount(15);

            setTimeout(() => {
                pendingInitialSymbolRef.current = false;
            }, 0);
        } else if (isOpen && !initialSymbol) {
            pendingInitialSymbolRef.current = false;
        }
    }, [isOpen, initialSymbol]);

    // Parse expiry date
    const parseExpiry = (expiryStr: string): { day: number | string; month: string; year: number } => {
        const date = new Date(expiryStr);
        if (!isNaN(date.getTime())) {
            const day = date.getDate();
            const month = date.toLocaleString('en-US', { month: 'short' });
            const year = date.getFullYear();
            return { day, month, year };
        }
        return { day: expiryStr, month: '', year: 0 };
    };

    // Group expiries by month
    const groupedExpiries = useMemo((): GroupedExpiry[] => {
        const groups: GroupedExpiry[] = [];
        let currentMonth = '';
        let currentYear = 0;
        let lastDisplayedYear = new Date().getFullYear();

        availableExpiries.forEach((exp) => {
            const parsed = parseExpiry(exp);
            const monthKey = `${parsed.month}-${parsed.year}`;

            if (monthKey !== `${currentMonth}-${currentYear}`) {
                const showYear = parsed.year !== lastDisplayedYear;
                const monthYear = showYear ? `${parsed.month} '${String(parsed.year).slice(-2)}` : parsed.month;

                groups.push({
                    monthYear,
                    dates: [{ expiry: exp, day: parsed.day }]
                });

                currentMonth = parsed.month;
                currentYear = parsed.year;
                if (showYear) lastDisplayedYear = parsed.year;
            } else {
                groups[groups.length - 1].dates.push({ expiry: exp, day: parsed.day });
            }
        });

        return groups;
    }, [availableExpiries]);

    // Visible groups based on scroll
    const visibleData = useMemo((): VisibleData => {
        const maxDates = 12;
        const result: GroupedExpiry[] = [];
        let dateCount = 0;
        let skipCount = expiryScrollIndex;
        let lastDisplayedYear = new Date().getFullYear();

        for (const group of groupedExpiries) {
            if (dateCount >= maxDates) break;

            if (skipCount >= group.dates.length) {
                skipCount -= group.dates.length;
                continue;
            }

            const startIdx = skipCount;
            skipCount = 0;

            const remainingSlots = maxDates - dateCount;
            const datesToTake = Math.min(group.dates.length - startIdx, remainingSlots);

            const firstDate = group.dates[startIdx];
            const expDate = new Date(firstDate.expiry);
            const month = expDate.toLocaleString('en-US', { month: 'short' });
            const year = expDate.getFullYear();

            const showYear = year !== lastDisplayedYear;
            const monthLabel = showYear ? `${month} '${String(year).slice(-2)}` : month;
            if (showYear) lastDisplayedYear = year;

            result.push({
                monthYear: monthLabel,
                dates: group.dates.slice(startIdx, startIdx + datesToTake)
            });

            dateCount += datesToTake;
        }

        const totalVisibleDates = dateCount;
        return { groups: result, scrollAmount: Math.max(1, totalVisibleDates - 1) };
    }, [groupedExpiries, expiryScrollIndex]);

    const totalExpiries = availableExpiries.length;
    const canScrollLeft = expiryScrollIndex > 0;
    const canScrollRight = expiryScrollIndex + 12 < totalExpiries;

    // Fetch expiries
    const fetchExpiries = useCallback(async (): Promise<void> => {
        if (pendingInitialSymbolRef.current) {
            logger.debug('[OptionChain] Skipping fetchExpiries - waiting for initialSymbol');
            return;
        }

        const requestId = ++expiryRequestIdRef.current;
        const currentSymbol = underlying.symbol;
        const currentExchange = underlying.exchange;

        logger.debug('[OptionChain] Fetching expiries for', currentSymbol, 'requestId:', requestId);
        setIsLoadingExpiries(true);

        try {
            logger.debug('[OptionChain] Calling getAvailableExpiries for', currentSymbol);
            const expiries = await getAvailableExpiries(currentSymbol, currentExchange) as string[];

            if (requestId !== expiryRequestIdRef.current) {
                logger.debug('[OptionChain] Discarding stale expiry response');
                return;
            }

            setAvailableExpiries(expiries);
            if (expiries.length > 0) {
                setSelectedExpiry(expiries[0]);
                setExpiryScrollIndex(0);
            }
        } catch (err) {
            if (requestId === expiryRequestIdRef.current) {
                logger.error('Failed to fetch expiries:', err);
                setAvailableExpiries([]);
            }
        } finally {
            if (requestId === expiryRequestIdRef.current) {
                setIsLoadingExpiries(false);
            }
        }
    }, [underlying.symbol, underlying.exchange]);

    // Fetch chain
    const fetchChain = useCallback(async (requestedStrikeCount = strikeCount): Promise<void> => {
        if (!selectedExpiry) return;

        const requestId = ++chainRequestIdRef.current;
        const currentSymbol = underlying.symbol;
        const currentExchange = underlying.exchange;
        const currentExpiry = selectedExpiry;

        logger.debug('[OptionChain] Fetching chain for', currentSymbol, currentExpiry, 'requestId:', requestId);
        setIsLoading(true);
        setError(null);

        try {
            logger.debug('[OptionChain] Calling getOptionChain for', currentSymbol, currentExpiry, 'strikes:', requestedStrikeCount);
            const chain = await getOptionChain(currentSymbol, currentExchange, currentExpiry, requestedStrikeCount) as OptionChainData;

            if (requestId !== chainRequestIdRef.current) {
                logger.debug('[OptionChain] Discarding stale chain response');
                return;
            }

            setOptionChain(chain);
        } catch (err) {
            if (requestId === chainRequestIdRef.current) {
                setError('Failed to fetch option chain');
                logger.error(err);
            }
        } finally {
            if (requestId === chainRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [underlying.symbol, underlying.exchange, selectedExpiry, strikeCount]);

    // Load more strikes
    const loadMoreStrikes = useCallback(async (): Promise<void> => {
        if (strikeCount >= MAX_STRIKE_COUNT) return;

        const newStrikeCount = Math.min(strikeCount + STRIKE_INCREMENT, MAX_STRIKE_COUNT);
        setIsLoadingMore(true);

        try {
            const chain = await getOptionChain(underlying.symbol, underlying.exchange, selectedExpiry!, newStrikeCount, true) as OptionChainData;
            setOptionChain(chain);
            setStrikeCount(newStrikeCount);
        } catch (err) {
            logger.error('Failed to load more strikes:', err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [underlying, selectedExpiry, strikeCount]);

    // Fetch expiries when modal opens
    useEffect(() => {
        if (isOpen && underlying.symbol) {
            const timeoutId = setTimeout(() => {
                if (!pendingInitialSymbolRef.current) {
                    fetchExpiries();
                }
            }, 10);
            return () => clearTimeout(timeoutId);
        }
    }, [isOpen, underlying.symbol, underlying.exchange, fetchExpiries]);

    // Fetch chain when expiry selected
    useEffect(() => {
        if (isOpen && selectedExpiry) {
            fetchChain();
        }
    }, [isOpen, selectedExpiry, fetchChain]);

    useEffect(() => {
        if (optionChain?.atmStrike && tableContainerRef.current) {
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
                const container = tableContainerRef.current;
                if (!container) return;

                const spotBar = container.querySelector('[data-spot-bar="true"]') as HTMLElement;
                if (spotBar) {
                    // Manual scroll calculation to prevent scrolling the entire page/modal
                    const containerRect = container.getBoundingClientRect();
                    const spotRect = spotBar.getBoundingClientRect();

                    // Calculate relative position + current scroll
                    const relativeTop = spotRect.top - containerRect.top + container.scrollTop;
                    const containerHeight = container.clientHeight;
                    const spotHeight = spotBar.offsetHeight;

                    // Center the spot bar
                    container.scrollTop = relativeTop - (containerHeight / 2) + (spotHeight / 2);
                }
            }, 100);
        }
    }, [optionChain]);

    // WebSocket subscription
    useEffect(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        if (!isOpen || !optionChain?.chain?.length) return;

        const symbols: Array<{ symbol: string; exchange: string }> = [
            { symbol: underlying.symbol, exchange: underlying.indexExchange || underlying.exchange }
        ];
        optionChain.chain.forEach(row => {
            if (row.ce?.symbol) symbols.push({ symbol: row.ce.symbol, exchange: underlying.exchange });
            if (row.pe?.symbol) symbols.push({ symbol: row.pe.symbol, exchange: underlying.exchange });
        });

        if (symbols.length === 0) return;

        logger.debug('[OptionChain] Subscribing to', symbols.length, 'option symbols');

        wsRef.current = subscribeToMultiTicker(symbols, (ticker: { symbol: string; last: number; volume?: number }) => {
            setLiveLTP(prev => {
                const newMap = new Map(prev);
                newMap.set(ticker.symbol, {
                    ltp: ticker.last,
                    volume: ticker.volume,
                    timestamp: Date.now()
                });
                return newMap;
            });
        }) as WebSocketConnection;

        return () => {
            if (wsRef.current) {
                logger.debug('[OptionChain] Unsubscribing from live LTP');
                wsRef.current.close();
                wsRef.current = null;
            }
            setLiveLTP(new Map());
        };
    }, [isOpen, optionChain?.chain, underlying.exchange, underlying.indexExchange, underlying.symbol]);

    // Fetch Greeks
    const fetchGreeks = useCallback(async (): Promise<void> => {
        if (!optionChain?.chain?.length) return;

        const requestId = ++greeksRequestIdRef.current;

        const symbolsToFetch: Array<{ symbol: string; exchange: string }> = [];
        optionChain.chain.forEach(row => {
            if (row.ce?.symbol && !greeksData.has(row.ce.symbol) && !failedGreeksSymbolsRef.current.has(row.ce.symbol)) {
                symbolsToFetch.push({ symbol: row.ce.symbol, exchange: underlying.exchange });
            }
            if (row.pe?.symbol && !greeksData.has(row.pe.symbol) && !failedGreeksSymbolsRef.current.has(row.pe.symbol)) {
                symbolsToFetch.push({ symbol: row.pe.symbol, exchange: underlying.exchange });
            }
        });

        if (symbolsToFetch.length === 0) return;

        logger.debug('[OptionChain] Fetching Greeks for', symbolsToFetch.length, 'options');
        setGreeksLoading(true);

        const markSymbolFailed = (symbol: string): void => {
            const currentCount = greeksRetryCountRef.current.get(symbol) || 0;
            const newCount = currentCount + 1;
            greeksRetryCountRef.current.set(symbol, newCount);

            if (newCount >= MAX_GREEKS_RETRY_COUNT) {
                failedGreeksSymbolsRef.current.add(symbol);
            }
        };

        try {
            const response = await getMultiOptionGreeks(symbolsToFetch) as any;

            if (requestId !== greeksRequestIdRef.current) return;

            if (response?.data?.length) {
                const newGreeksData = new Map(greeksData);
                const symbolsInResponse = new Set<string>();

                response.data.forEach(item => {
                    if (item.status === 'success' && item.symbol) {
                        newGreeksData.set(item.symbol, {
                            iv: item.implied_volatility,
                            greeks: item.greeks
                        });
                        symbolsInResponse.add(item.symbol);
                        greeksRetryCountRef.current.delete(item.symbol);
                    } else if (item.symbol) {
                        markSymbolFailed(item.symbol);
                        symbolsInResponse.add(item.symbol);
                    }
                });

                symbolsToFetch.forEach(s => {
                    if (!symbolsInResponse.has(s.symbol) && !newGreeksData.has(s.symbol)) {
                        markSymbolFailed(s.symbol);
                    }
                });

                setGreeksData(newGreeksData);
            } else {
                symbolsToFetch.forEach(s => markSymbolFailed(s.symbol));
            }
        } catch (error) {
            logger.error('[OptionChain] Greeks batch API error:', error);
            symbolsToFetch.forEach(s => markSymbolFailed(s.symbol));
        } finally {
            if (requestId === greeksRequestIdRef.current) {
                setGreeksLoading(false);
            }
        }
    }, [optionChain?.chain, underlying.exchange, greeksData]);

    // Trigger Greeks fetch when switching to greeks view
    useEffect(() => {
        if (isOpen && viewMode === 'greeks' && optionChain?.chain?.length) {
            fetchGreeks();
        }
    }, [isOpen, viewMode, optionChain?.chain, fetchGreeks]);

    // Clear Greeks cache when modal closes
    useEffect(() => {
        if (!isOpen) {
            greeksRequestIdRef.current++;
            setGreeksData(new Map());
            failedGreeksSymbolsRef.current = new Set();
            greeksRetryCountRef.current = new Map();
            setViewMode('ltp-oi');
        }
    }, [isOpen]);

    // Clear Greeks cache when expiry changes
    useEffect(() => {
        greeksRequestIdRef.current++;
        setGreeksData(new Map());
        failedGreeksSymbolsRef.current = new Set();
        greeksRetryCountRef.current = new Map();
    }, [selectedExpiry]);

    // Chain data
    const chainData = useMemo(() => optionChain?.chain || [], [optionChain]);
    const atmStrike = optionChain?.atmStrike || 0;
    const underlyingLTP = optionChain?.underlyingLTP || 0;

    // Max OI for bars
    const maxOI = useMemo((): number => {
        let max = 0;
        chainData.forEach(row => {
            if ((row.ce?.oi || 0) > max) max = row.ce!.oi!;
            if ((row.pe?.oi || 0) > max) max = row.pe!.oi!;
        });
        return max || 1;
    }, [chainData]);

    const atmIndex = useMemo(() => chainData.findIndex(row => row.strike === atmStrike), [chainData, atmStrike]);

    const { aboveATM, belowATM } = useMemo(() => {
        if (atmIndex === -1) return { aboveATM: chainData, belowATM: [] };
        return { aboveATM: chainData.slice(0, atmIndex + 1), belowATM: chainData.slice(atmIndex + 1) };
    }, [chainData, atmIndex]);

    const handleOptionClick = useCallback((symbol: string | undefined): void => {
        if (!symbol) return;
        onSelectOption(symbol, underlying.exchange);
        onClose();
    }, [underlying.exchange, onSelectOption, onClose]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>): void => {
        if (chainData.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedRow(prev => prev < 0 ? 0 : Math.min(prev + 1, chainData.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedRow(prev => prev < 0 ? 0 : Math.max(prev - 1, 0));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            setFocusedCol(prev => prev === 'ce' ? 'pe' : 'ce');
        } else if (e.key === 'Enter' && focusedRow >= 0 && focusedRow < chainData.length) {
            e.preventDefault();
            const row = chainData[focusedRow];
            const symbol = focusedCol === 'ce' ? row.ce?.symbol : row.pe?.symbol;
            if (symbol) handleOptionClick(symbol);
        } else if (e.key === 'Escape') {
            onClose();
        }
    }, [chainData, focusedRow, focusedCol, handleOptionClick, onClose]);

    // Click handler
    const handleCellClick = useCallback((rowIndex: number, col: ColumnType, symbol: string | undefined): void => {
        setFocusedRow(rowIndex);
        setFocusedCol(col);
        handleOptionClick(symbol);
    }, [handleOptionClick]);

    const getOIBarWidth = (oi: number | undefined): number => oi ? Math.min((oi / maxOI) * 100, 100) : 0;

    const formatSpotChange = (): { price: string; change: string; percent: string; isPositive: boolean } => {
        const liveSpot = liveLTP.get(underlying.symbol);
        const spotLTP = liveSpot?.ltp ?? underlyingLTP;

        const prevClose = optionChain?.underlyingPrevClose || 0;
        const change = prevClose > 0 ? spotLTP - prevClose : (optionChain?.change || 0);
        const changePercent = prevClose > 0 ? (change / prevClose) * 100 : (optionChain?.changePercent || 0);
        const isPositive = change >= 0;

        return {
            price: formatCurrency(spotLTP, { showSymbol: false, decimals: 2 }),
            change: (isPositive ? '+' : '') + change.toFixed(2),
            percent: (isPositive ? '+' : '') + changePercent.toFixed(2) + '%',
            isPositive
        };
    };

    const getLtpChange = (data: OptionData | undefined): number | null => {
        if (!data?.ltp || !data?.prevClose) return null;
        return ((data.ltp - data.prevClose) / data.prevClose) * 100;
    };

    const renderRow = (row: OptionRow, isITM_CE: boolean, isITM_PE: boolean, rowIndex: number): React.ReactNode => {
        const ceLive = liveLTP.get(row.ce?.symbol || '');
        const peLive = liveLTP.get(row.pe?.symbol || '');

        const ceLTP = ceLive?.ltp ?? row.ce?.ltp;
        const peLTP = peLive?.ltp ?? row.pe?.ltp;

        const ceOIWidth = getOIBarWidth(row.ce?.oi);
        const peOIWidth = getOIBarWidth(row.pe?.oi);
        const isRowFocused = rowIndex === focusedRow;

        const ceLtpChange = row.ce?.prevClose && ceLTP
            ? ((ceLTP - row.ce.prevClose) / row.ce.prevClose) * 100
            : getLtpChange(row.ce);
        const peLtpChange = row.pe?.prevClose && peLTP
            ? ((peLTP - row.pe.prevClose) / row.pe.prevClose) * 100
            : getLtpChange(row.pe);

        return (
            <div key={row.strike} className={classNames(styles.row, {
                [styles.itmCE]: isITM_CE,
                [styles.itmPE]: isITM_PE,
                [styles.focused]: isRowFocused
            })}>
                <div className={classNames(styles.cell, styles.combinedCell, styles.combinedCellLeft, styles.clickable, {
                    [styles.focusedCell]: isRowFocused && focusedCol === 'ce'
                })} onClick={() => handleCellClick(rowIndex, 'ce', row.ce?.symbol)}>
                    <div className={styles.oiSection}>
                        <div className={styles.oiBarWrapperLeft}>
                            <div className={styles.oiBarGreen} style={{ width: `${ceOIWidth}%` }}></div>
                        </div>
                        <span className={styles.oiValue}>{formatOI(row.ce?.oi)}</span>
                    </div>
                    <div className={styles.ltpSection}>
                        <span className={styles.ltpValue}>{formatLTP(ceLTP)}</span>
                        {ceLtpChange !== null && (
                            <span className={classNames(styles.ltpChange, ceLtpChange >= 0 ? styles.changePositive : styles.changeNegative)}>
                                {formatLtpChange(ceLtpChange)}
                            </span>
                        )}
                    </div>
                </div>

                <div className={classNames(styles.cell, styles.strikeCell)}>
                    {formatPrice(row.strike, 0)}
                </div>

                <div className={classNames(styles.cell, styles.combinedCell, styles.combinedCellRight, styles.clickable, {
                    [styles.focusedCell]: isRowFocused && focusedCol === 'pe'
                })} onClick={() => handleCellClick(rowIndex, 'pe', row.pe?.symbol)}>
                    <div className={styles.ltpSection}>
                        <span className={styles.ltpValue}>{formatLTP(peLTP)}</span>
                        {peLtpChange !== null && (
                            <span className={classNames(styles.ltpChange, peLtpChange >= 0 ? styles.changePositive : styles.changeNegative)}>
                                {formatLtpChange(peLtpChange)}
                            </span>
                        )}
                    </div>
                    <div className={styles.oiSection}>
                        <div className={styles.oiBarWrapperRight}>
                            <div className={styles.oiBarRed} style={{ width: `${peOIWidth}%` }}></div>
                        </div>
                        <span className={styles.oiValue}>{formatOI(row.pe?.oi)}</span>
                    </div>
                </div>
            </div>
        );
    };

    const renderGreeksRow = (row: OptionRow, isITM_CE: boolean, isITM_PE: boolean, rowIndex: number): React.ReactNode => {
        const ceLive = liveLTP.get(row.ce?.symbol || '');
        const peLive = liveLTP.get(row.pe?.symbol || '');
        const ceLTP = ceLive?.ltp ?? row.ce?.ltp;
        const peLTP = peLive?.ltp ?? row.pe?.ltp;

        const ceGreeks = greeksData.get(row.ce?.symbol || '');
        const peGreeks = greeksData.get(row.pe?.symbol || '');

        const isRowFocused = rowIndex === focusedRow;

        return (
            <div key={row.strike} className={classNames(styles.rowGreeks, {
                [styles.itmCE]: isITM_CE,
                [styles.itmPE]: isITM_PE,
                [styles.focused]: isRowFocused
            })}>
                <div className={classNames(styles.greeksCell, {
                    [styles.focusedCell]: isRowFocused && focusedCol === 'ce'
                })} onClick={() => handleCellClick(rowIndex, 'ce', row.ce?.symbol)}>
                    <span className={classNames(styles.greekValue, styles.muted)}>
                        {formatGamma(ceGreeks?.greeks?.gamma)}
                    </span>
                    <span className={styles.greekValue}>
                        {formatVega(ceGreeks?.greeks?.vega)}
                    </span>
                    <span className={classNames(styles.greekValue, styles.greekTheta)}>
                        {formatTheta(ceGreeks?.greeks?.theta)}
                    </span>
                    <span className={classNames(styles.greekValue, styles.greekDeltaPositive)}>
                        {formatDelta(ceGreeks?.greeks?.delta)}
                    </span>
                    <span className={styles.greekLtp}>{formatLTP(ceLTP)}</span>
                </div>

                <div className={styles.strikeCellGreeks}>
                    <span>{row.strike.toLocaleString('en-IN')}</span>
                    <span className={styles.strikeIv}>
                        {ceGreeks?.iv ? formatIv(ceGreeks.iv) : ''}
                    </span>
                </div>

                <div className={classNames(styles.greeksCell, {
                    [styles.focusedCell]: isRowFocused && focusedCol === 'pe'
                })} onClick={() => handleCellClick(rowIndex, 'pe', row.pe?.symbol)}>
                    <span className={styles.greekLtp}>{formatLTP(peLTP)}</span>
                    <span className={classNames(styles.greekValue, styles.greekDeltaNegative)}>
                        {formatDelta(peGreeks?.greeks?.delta)}
                    </span>
                    <span className={classNames(styles.greekValue, styles.greekTheta)}>
                        {formatTheta(peGreeks?.greeks?.theta)}
                    </span>
                    <span className={styles.greekValue}>
                        {formatVega(peGreeks?.greeks?.vega)}
                    </span>
                    <span className={classNames(styles.greekValue, styles.muted)}>
                        {formatGamma(peGreeks?.greeks?.gamma)}
                    </span>
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    const spotInfo = formatSpotChange();

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            showHeader={false}
            noPadding={true}
            className={classNames(styles.modalBase, { [styles.modalBaseWide]: viewMode === 'greeks' })}
            contentClassName={styles.modalContent}
        >
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <ChevronLeft size={20} className={styles.backIcon} onClick={onClose} />
                    <select
                        className={styles.headerSelect}
                        value={underlying.symbol}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                            const found = (UNDERLYINGS as Underlying[]).find(u => u.symbol === e.target.value);
                            if (found) {
                                setUnderlying(found);
                                setIsCustomSymbol(false);
                                setSelectedExpiry(null);
                                setOptionChain(null);
                            }
                        }}
                    >
                        {isCustomSymbol && (
                            <option key={underlying.symbol} value={underlying.symbol}>
                                {underlying.symbol}
                            </option>
                        )}
                        {(UNDERLYINGS as Underlying[]).map(u => (
                            <option key={u.symbol} value={u.symbol}>{u.symbol}</option>
                        ))}
                    </select>
                    <Text variant="h3" weight="semibold">Options</Text>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchChain()}
                        disabled={!selectedExpiry}
                        isLoading={isLoading}
                        iconOnly
                    >
                        {!isLoading && <RefreshCw size={16} />}
                    </Button>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.viewToggle}>
                        <button
                            className={classNames(styles.viewToggleBtn, { [styles.viewToggleBtnActive]: viewMode === 'ltp-oi' })}
                            onClick={() => setViewMode('ltp-oi')}
                        >
                            LTP & OI
                        </button>
                        <button
                            className={classNames(styles.viewToggleBtn, { [styles.viewToggleBtnActive]: viewMode === 'greeks' })}
                            onClick={() => setViewMode('greeks')}
                        >
                            Greeks
                        </button>
                    </div>
                    {greeksLoading && (
                        <div className={styles.greeksLoading}>
                            <Loader2 size={14} className={styles.spin} />
                            <span>Loading Greeks...</span>
                        </div>
                    )}
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Expiry Picker */}
            <div className={styles.expiryPicker}>
                {canScrollLeft && (
                    <button className={styles.scrollBtn} onClick={() => setExpiryScrollIndex(prev => Math.max(0, prev - 11))}>
                        <ChevronLeft size={14} />
                    </button>
                )}

                <div className={styles.expiryGrid}>
                    {visibleData.groups.map((group, idx) => (
                        <div key={idx} className={styles.monthColumn}>
                            <span className={styles.monthLabel}>{group.monthYear}</span>
                            <div className={styles.dateGroup}>
                                {group.dates.map((d) => (
                                    <button
                                        key={d.expiry}
                                        className={classNames(styles.dateBtn, {
                                            [styles.activeDate]: selectedExpiry === d.expiry
                                        })}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            logger.debug('[OptionChain] Expiry clicked:', d.expiry);
                                            setSelectedExpiry(d.expiry);
                                        }}
                                    >
                                        {d.day}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {canScrollRight && (
                    <button className={styles.scrollBtn} onClick={() => setExpiryScrollIndex(prev => prev + visibleData.scrollAmount)}>
                        <ChevronRight size={14} />
                    </button>
                )}
            </div>

            {/* Column Headers */}
            {viewMode === 'ltp-oi' ? (
                <div className={styles.colHeaders}>
                    <div className={styles.colHeaderCalls}>
                        <span className={styles.colHeaderLabel}>CALLS</span>
                        <span className={styles.colHeaderSub}>OI · LTP</span>
                    </div>
                    <span className={styles.colHeaderStrike}>STRIKE</span>
                    <div className={styles.colHeaderPuts}>
                        <span className={styles.colHeaderLabel}>PUTS</span>
                        <span className={styles.colHeaderSub}>LTP · OI</span>
                    </div>
                </div>
            ) : (
                <div className={styles.colHeadersGreeks}>
                    <div className={styles.greeksHeaderGroup}>
                        <span className={styles.greeksHeaderLabel}>Gamma</span>
                        <span className={styles.greeksHeaderLabel}>Vega</span>
                        <span className={styles.greeksHeaderLabel}>Theta</span>
                        <span className={styles.greeksHeaderLabel}>Delta</span>
                        <span className={styles.greeksHeaderLabel}>LTP</span>
                    </div>
                    <span className={styles.colHeaderStrike}>STRIKE<br /><small>IV</small></span>
                    <div className={styles.greeksHeaderGroup}>
                        <span className={styles.greeksHeaderLabel}>LTP</span>
                        <span className={styles.greeksHeaderLabel}>Delta</span>
                        <span className={styles.greeksHeaderLabel}>Theta</span>
                        <span className={styles.greeksHeaderLabel}>Vega</span>
                        <span className={styles.greeksHeaderLabel}>Gamma</span>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className={styles.tableContainer} ref={tableContainerRef}>
                {isLoading ? (
                    <div className={styles.loading}>
                        <Loader2 size={28} className={styles.spin} />
                        <p>Loading option chain...</p>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <p>{error}</p>
                        <button onClick={() => fetchChain()}>Retry</button>
                    </div>
                ) : chainData.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No options found</p>
                        <span>Select an expiry to load option chain</span>
                    </div>
                ) : (
                    <div
                        className={styles.tableBody}
                        ref={tableBodyRef}
                        tabIndex={0}
                        onKeyDown={handleKeyDown}
                    >
                        {strikeCount < MAX_STRIKE_COUNT && (
                            <button
                                className={styles.loadMoreBtn}
                                onClick={loadMoreStrikes}
                                disabled={isLoadingMore}
                            >
                                {isLoadingMore ? (
                                    <Loader2 size={14} className={styles.spin} />
                                ) : (
                                    <ChevronUp size={14} />
                                )}
                                <span>Load more strikes</span>
                            </button>
                        )}

                        {aboveATM.map((row, idx) =>
                            viewMode === 'greeks'
                                ? renderGreeksRow(row, row.strike < atmStrike, false, idx)
                                : renderRow(row, row.strike < atmStrike, false, idx)
                        )}

                        {optionChain && (
                            <div className={styles.spotBar} data-spot-bar="true">
                                <div className={styles.spotLine}></div>
                                <div className={styles.spotBadge}>
                                    <Text as="span" variant="caption" color="secondary">Spot price</Text>
                                    <Text as="span" variant="body" weight="bold">{spotInfo.price}</Text>
                                    <Text
                                        as="span"
                                        variant="caption"
                                        weight="medium"
                                        className={classNames(styles.spotChange, { [styles.positive]: spotInfo.isPositive, [styles.negative]: !spotInfo.isPositive })}
                                    >
                                        {spotInfo.change} ({spotInfo.percent})
                                    </Text>
                                </div>
                                <div className={styles.spotLine}></div>
                            </div>
                        )}

                        {belowATM.map((row, idx) =>
                            viewMode === 'greeks'
                                ? renderGreeksRow(row, false, row.strike > atmStrike, aboveATM.length + idx)
                                : renderRow(row, false, row.strike > atmStrike, aboveATM.length + idx)
                        )}

                        {strikeCount < MAX_STRIKE_COUNT && (
                            <button
                                className={styles.loadMoreBtn}
                                onClick={loadMoreStrikes}
                                disabled={isLoadingMore}
                            >
                                {isLoadingMore ? (
                                    <Loader2 size={14} className={styles.spin} />
                                ) : (
                                    <ChevronDown size={14} />
                                )}
                                <span>Load more strikes</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </BaseModal>
    );
};

export default memo(OptionChainModal);
