import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ReactNode, MouseEvent } from 'react';
import styles from './Layout.module.css';

export interface LayoutProps {
    leftToolbar?: ReactNode;
    drawingPropertiesPanel?: ReactNode;
    topbar?: ReactNode;
    chart?: ReactNode;
    bottomBar?: ReactNode;
    watchlist?: ReactNode;
    optionsPanel?: ReactNode;
    rightToolbar?: ReactNode;
    mobileNav?: ReactNode;
    accountPanel?: ReactNode;
    isAccountPanelOpen?: boolean;
    accountPanelHeight?: number;
    onAccountPanelHeightChange?: (height: number) => void;
    isAccountPanelMinimized?: boolean;
    onAccountPanelMinimize?: () => void;
    isAccountPanelMaximized?: boolean;
    onAccountPanelMaximize?: () => void;
    isLeftToolbarVisible?: boolean;
    isMobile?: boolean;
    isWatchlistVisible?: boolean;
    isRightPanelOpen?: boolean;
    onWatchlistOverlayClick?: () => void;
    watchlistWidth?: number;
    onWatchlistWidthChange?: (width: number) => void;
}

const Layout: React.FC<LayoutProps> = ({
    leftToolbar,
    drawingPropertiesPanel,
    topbar,
    chart,
    bottomBar,
    watchlist,
    optionsPanel,
    rightToolbar,
    mobileNav,
    accountPanel,
    isAccountPanelOpen = false,
    accountPanelHeight: controlledAccountHeight,
    onAccountPanelHeightChange,
    isAccountPanelMinimized = false,
    onAccountPanelMinimize,
    isAccountPanelMaximized = false,
    onAccountPanelMaximize,
    isLeftToolbarVisible = true,
    isMobile = false,
    isWatchlistVisible = true,
    isRightPanelOpen = false,
    onWatchlistOverlayClick,
    watchlistWidth: controlledWidth,
    onWatchlistWidthChange,
}) => {
    // Internal state for watchlist width (used if not controlled)
    const [internalWidth, setInternalWidth] = useState<number>(() => {
        const saved = localStorage.getItem('tv_watchlist_width');
        return saved ? parseInt(saved, 10) : 320;
    });

    const [isResizing, setIsResizing] = useState(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    // Account panel height state
    const [internalAccountHeight, setInternalAccountHeight] = useState<number>(() => {
        const saved = localStorage.getItem('tv_account_panel_height');
        return saved ? parseInt(saved, 10) : 200;
    });
    const [isAccountResizing, setIsAccountResizing] = useState(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    // Use controlled or internal width/height
    const watchlistWidth = controlledWidth ?? internalWidth;
    const setWatchlistWidth = onWatchlistWidthChange ?? setInternalWidth;
    const accountPanelHeight = controlledAccountHeight ?? internalAccountHeight;
    const setAccountPanelHeight = onAccountPanelHeightChange ?? setInternalAccountHeight;

    // Handle watchlist resize start
    const handleResizeStart = useCallback((e: MouseEvent<HTMLDivElement>): void => {
        e.preventDefault();
        setIsResizing(true);
        startXRef.current = e.clientX;
        startWidthRef.current = watchlistWidth;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }, [watchlistWidth]);

    // Handle account panel resize start (vertical)
    const handleAccountResizeStart = useCallback((e: MouseEvent<HTMLDivElement>): void => {
        e.preventDefault();
        e.stopPropagation();
        setIsAccountResizing(true);
        startYRef.current = e.clientY;
        startHeightRef.current = accountPanelHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    }, [accountPanelHeight]);

    // Handle watchlist resize move and end
    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: globalThis.MouseEvent): void => {
            // Resize from left edge: dragging left (decreasing X) should INCREASE width
            const delta = startXRef.current - e.clientX;
            const newWidth = Math.min(600, Math.max(200, startWidthRef.current + delta));
            setWatchlistWidth(newWidth);
        };

        const handleMouseUp = (): void => {
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Save to localStorage
            localStorage.setItem('tv_watchlist_width', watchlistWidth.toString());
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, setWatchlistWidth, watchlistWidth]);

    // Handle account panel resize move and end (vertical)
    useEffect(() => {
        if (!isAccountResizing) return;

        const handleMouseMove = (e: globalThis.MouseEvent): void => {
            // Dragging up (decreasing Y) should INCREASE height
            const delta = startYRef.current - e.clientY;
            const newHeight = Math.min(500, Math.max(100, startHeightRef.current + delta));
            setAccountPanelHeight(newHeight);
        };

        const handleMouseUp = (): void => {
            setIsAccountResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Save to localStorage
            localStorage.setItem('tv_account_panel_height', accountPanelHeight.toString());
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isAccountResizing, setAccountPanelHeight, accountPanelHeight]);

    // Calculate actual account panel height based on min/max state
    const getAccountPanelStyle = (): React.CSSProperties => {
        if (isAccountPanelMinimized) {
            return { height: '38px' }; // Just header height
        }
        if (isAccountPanelMaximized) {
            return { height: '60vh' }; // 60% of viewport
        }
        return { height: `${accountPanelHeight}px` };
    };

    const shouldRenderWatchlist = Boolean(
        watchlist && ((isMobile && isWatchlistVisible) || (!isMobile && isRightPanelOpen))
    );

    return (
        <div className={`${styles.container} ${isMobile ? styles.mobile : ''}`}>
            {/* Skip link for keyboard accessibility */}
            <a href="#main-chart" className="skip-link">
                Skip to chart
            </a>

            <div className={styles.topbarArea}>
                {topbar}
            </div>

            <div className={styles.mainArea}>
                {/* Left toolbar - hidden on mobile unless explicitly toggled */}
                {(!isMobile || isLeftToolbarVisible) && (
                    <div className={`${styles.leftToolbarArea} ${!isLeftToolbarVisible ? styles.leftToolbarHidden : ''} ${isMobile ? styles.leftToolbarMobile : ''}`}>
                        {leftToolbar}
                    </div>
                )}

                {/* Drawing properties panel - shown when drawing tool is active */}
                {!isMobile && drawingPropertiesPanel}

                <div className={styles.centerArea}>
                    <div id="main-chart" className={styles.chartArea} tabIndex={-1}>
                        {chart}
                    </div>
                    {/* Account Panel - shown below chart */}
                    {!isMobile && accountPanel && isAccountPanelOpen && (
                        <div
                            className={`${styles.accountPanelArea} ${isAccountResizing ? styles.accountPanelResizing : ''}`}
                            style={getAccountPanelStyle()}
                        >
                            {/* Resize handle - drag to resize vertically */}
                            <div
                                className={`${styles.accountResizeHandle} ${isAccountResizing ? styles.accountResizeHandleActive : ''}`}
                                onMouseDown={handleAccountResizeStart}
                                title="Drag to resize"
                            />
                            {accountPanel}
                        </div>
                    )}
                    {/* Bottom bar - hidden on mobile (replaced by MobileNav) */}
                    {!isMobile && (
                        <div className={styles.bottomBarArea}>
                            {bottomBar}
                        </div>
                    )}
                </div>

                {/* Watchlist - slide-out panel on mobile, resizable on desktop */}
                {shouldRenderWatchlist && (
                    <>
                        {/* Overlay for mobile - clicking closes watchlist */}
                        {isMobile && isWatchlistVisible && (
                            <div
                                className={styles.watchlistOverlay}
                                onClick={onWatchlistOverlayClick}
                                aria-hidden="true"
                            />
                        )}
                        <div
                            className={`${styles.watchlistArea} ${isMobile ? styles.watchlistMobile : ''} ${isMobile && !isWatchlistVisible ? styles.watchlistHidden : ''}`}
                            style={!isMobile ? { width: watchlistWidth } : undefined}
                        >
                            {/* Resize handle - desktop only */}
                            {!isMobile && (
                                <div
                                    className={`${styles.resizeHandle} ${isResizing ? styles.resizeHandleActive : ''}`}
                                    onMouseDown={handleResizeStart}
                                    title="Drag to resize"
                                />
                            )}
                            {watchlist}
                        </div>
                    </>
                )}

                {optionsPanel && (
                    <div className={styles.optionsPanelArea}>
                        {optionsPanel}
                    </div>
                )}

                {!isMobile && rightToolbar && (
                    <div className={styles.rightToolbarArea}>
                        {rightToolbar}
                    </div>
                )}
            </div>

            {/* Mobile bottom navigation */}
            {isMobile && mobileNav}
        </div>
    );
};

export default Layout;
