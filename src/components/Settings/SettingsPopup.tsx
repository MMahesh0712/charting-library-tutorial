import React, { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { BaseModal } from '../shared';
import styles from './SettingsPopup.module.css';
import { X, Keyboard } from 'lucide-react';
import ShortcutsSettings from '../ShortcutsSettings/ShortcutsSettings';
import { getLogLevel } from '../../utils/logger';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';
import { getDefaultHostUrl, getDefaultWebSocketHost } from '../../services/api/config';

// Import extracted section components
import { ScalesSection, OpenAlgoSection, LoggingSection, AppearanceSection, SymbolSection } from './sections';

// Import constants
import { DEFAULT_CHART_APPEARANCE, ChartAppearance } from './constants';

type Theme = 'dark' | 'light';
type SectionId = 'symbol' | 'scales' | 'openalgo' | 'logging' | 'appearance' | 'shortcuts';

interface Section {
    id: SectionId;
    label: string;
    icon: React.ReactNode;
}

export interface SettingsPopupProps {
    isOpen: boolean;
    onClose: () => void;
    theme?: Theme;
    // Price Scale settings
    isTimerVisible?: boolean;
    onTimerToggle?: (visible: boolean) => void;
    isSessionBreakVisible?: boolean;
    onSessionBreakToggle?: (visible: boolean) => void;
    // OpenAlgo settings
    hostUrl?: string;
    onHostUrlSave?: (url: string) => void;
    apiKey?: string;
    onApiKeySave?: (key: string) => void;
    websocketUrl?: string;
    onWebsocketUrlSave?: (url: string) => void;
    openalgoUsername?: string;
    onUsernameSave?: (username: string) => void;
    chartEngine?: 'legacy' | 'tradingview';
    onChartEngineSave?: (engine: 'legacy' | 'tradingview') => void;
    tradingViewLibraryPath?: string;
    onTradingViewLibraryPathSave?: (path: string) => void;
    // Chart Appearance settings
    chartAppearance?: ChartAppearance;
    onChartAppearanceChange?: (appearance: ChartAppearance) => void;
    onResetChartAppearance?: () => void;
}

const SettingsPopup: FC<SettingsPopupProps> = ({
    isOpen,
    onClose,
    theme = 'dark',
    // Price Scale settings
    isTimerVisible = false,
    onTimerToggle,
    isSessionBreakVisible = false,
    onSessionBreakToggle,
    // OpenAlgo settings
    hostUrl = getDefaultHostUrl(),
    onHostUrlSave,
    apiKey = '',
    onApiKeySave,
    websocketUrl = getDefaultWebSocketHost(),
    onWebsocketUrlSave,
    openalgoUsername = '',
    onUsernameSave,
    chartEngine = 'legacy',
    onChartEngineSave,
    tradingViewLibraryPath = '/charting_library/',
    onTradingViewLibraryPathSave,
    // Chart Appearance settings
    chartAppearance = DEFAULT_CHART_APPEARANCE,
    onChartAppearanceChange,
    onResetChartAppearance
}) => {
    // Logging state
    const [logLevel, setLocalLogLevel] = useState(getLogLevel);
    const [activeSection, setActiveSection] = useState<SectionId>('symbol');
    const [localHostUrl, setLocalHostUrl] = useState(hostUrl);
    const [localApiKey, setLocalApiKey] = useState(apiKey);
    const [localWsUrl, setLocalWsUrl] = useState(websocketUrl);
    const [localUsername, setLocalUsername] = useState(openalgoUsername);
    const [localChartEngine, setLocalChartEngine] = useState(chartEngine);
    const [localTradingViewLibraryPath, setLocalTradingViewLibraryPath] = useState(tradingViewLibraryPath);
    const [hasChanges, setHasChanges] = useState(false);
    const [localAppearance, setLocalAppearance] = useState<ChartAppearance>(chartAppearance);

    // Handle cancel - reset local state and close
    const handleCancel = useCallback(() => {
        setLocalHostUrl(hostUrl);
        setLocalApiKey(apiKey);
        setLocalWsUrl(websocketUrl);
        setLocalUsername(openalgoUsername);
        setLocalChartEngine(chartEngine);
        setLocalTradingViewLibraryPath(tradingViewLibraryPath);
        setLocalAppearance(chartAppearance);
        onClose();
    }, [hostUrl, apiKey, websocketUrl, openalgoUsername, chartEngine, tradingViewLibraryPath, chartAppearance, onClose]);

    // Focus trap for accessibility
    const focusTrapRef = useFocusTrap(isOpen);

    // Escape key to close
    useKeyboardNav({
        enabled: isOpen,
        onEscape: handleCancel,
    });

    // Sync local state with props
    useEffect(() => {
        setLocalHostUrl(hostUrl);
    }, [hostUrl]);

    useEffect(() => {
        setLocalApiKey(apiKey);
    }, [apiKey]);

    useEffect(() => {
        setLocalWsUrl(websocketUrl);
    }, [websocketUrl]);

    useEffect(() => {
        setLocalUsername(openalgoUsername);
    }, [openalgoUsername]);

    useEffect(() => {
        setLocalChartEngine(chartEngine);
    }, [chartEngine]);

    useEffect(() => {
        setLocalTradingViewLibraryPath(tradingViewLibraryPath);
    }, [tradingViewLibraryPath]);

    useEffect(() => {
        setLocalAppearance(chartAppearance);
    }, [chartAppearance]);

    // Track changes
    useEffect(() => {
        const hasHostChange = localHostUrl !== hostUrl;
        const hasApiKeyChange = localApiKey !== apiKey;
        const hasWsUrlChange = localWsUrl !== websocketUrl;
        const hasUsernameChange = localUsername !== openalgoUsername;
        const hasChartEngineChange = localChartEngine !== chartEngine;
        const hasTradingViewLibraryPathChange = localTradingViewLibraryPath !== tradingViewLibraryPath;
        const hasAppearanceChange = JSON.stringify(localAppearance) !== JSON.stringify(chartAppearance);
        setHasChanges(hasHostChange || hasApiKeyChange || hasWsUrlChange || hasUsernameChange || hasChartEngineChange || hasTradingViewLibraryPathChange || hasAppearanceChange);
    }, [localHostUrl, localApiKey, localWsUrl, localUsername, localChartEngine, localTradingViewLibraryPath, localAppearance, hostUrl, apiKey, websocketUrl, openalgoUsername, chartEngine, tradingViewLibraryPath, chartAppearance]);

    if (!isOpen) return null;

    const handleSave = (): void => {
        if (localHostUrl !== hostUrl) {
            onHostUrlSave?.(localHostUrl);
        }
        if (localApiKey !== apiKey) {
            onApiKeySave?.(localApiKey);
        }
        if (localWsUrl !== websocketUrl) {
            onWebsocketUrlSave?.(localWsUrl);
        }
        if (localUsername !== openalgoUsername) {
            onUsernameSave?.(localUsername);
        }
        if (localChartEngine !== chartEngine) {
            onChartEngineSave?.(localChartEngine);
        }
        if (localTradingViewLibraryPath !== tradingViewLibraryPath) {
            onTradingViewLibraryPathSave?.(localTradingViewLibraryPath);
        }
        if (JSON.stringify(localAppearance) !== JSON.stringify(chartAppearance)) {
            onChartAppearanceChange?.(localAppearance);
        }
        onClose();
    };

    const sections: Section[] = [
        {
            id: 'symbol', label: 'Symbol', icon: (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17.5 20.5h4v-13h-4v13zm2-13v-3m0 16v3M6.5 17.5h4v-7h-4v7zm2-7v-3m0 10v3" />
                </svg>
            )
        },
        {
            id: 'scales', label: 'Scales', icon: (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" stroke="currentColor">
                    <path d="M10.5 20.5a2 2 0 1 1-2-2m2 2a2 2 0 0 0-2-2m2 2h14m-16-2v-14m16 16L21 17m3.5 3.5L21 24M8.5 4.5L12 8M8.5 4.5L5 8"></path>
                </svg>
            )
        },
        {
            id: 'openalgo', label: 'OpenAlgo', icon: (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="currentColor">
                    <path d="M14 5a2 2 0 0 0-2 2v2h4V7a2 2 0 0 0-2-2Zm3 4V7a3 3 0 1 0-6 0v2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-8 2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8Zm5 3a1 1 0 0 0-.5.13v-.13a.5.5 0 0 0-1 0v2.5a.5.5 0 0 0 1 0v-.13A1 1 0 1 0 14 14Z"></path>
                </svg>
            )
        },
        {
            id: 'logging', label: 'Logging', icon: (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="currentColor">
                    <path d="M4 6h20v2H4V6zm0 5h20v2H4v-2zm0 5h14v2H4v-2zm0 5h10v2H4v-2z"></path>
                </svg>
            )
        },
        {
            id: 'appearance', label: 'Appearance', icon: (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="currentColor">
                    <path d="M14 4a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM5 14a9 9 0 1 1 18 0 9 9 0 0 1-18 0Z" />
                    <path d="M14 8a6 6 0 0 0-6 6h12a6 6 0 0 0-6-6Z" />
                </svg>
            )
        },
        {
            id: 'shortcuts', label: 'Keyboard Shortcuts', icon: (
                <Keyboard size={18} />
            )
        }
    ];

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={handleCancel}
            showHeader={false}
            noPadding={true}
            className={`${styles.modalBase} ${theme === 'light' ? styles.light : ''}`}
        >
            {/* Header */}
            <div className={styles.header}>
                <h2 id="settings-dialog-title" className={styles.title}>Settings</h2>
                <button
                    className={styles.closeButton}
                    onClick={handleCancel}
                    aria-label="Close settings"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Content */}
            <div className={styles.content}>
                {/* Sidebar */}
                <div className={styles.sidebar}>
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            className={`${styles.sidebarItem} ${activeSection === section.id ? styles.active : ''}`}
                            onClick={() => setActiveSection(section.id)}
                        >
                            <span className={styles.sidebarIcon}>{section.icon}</span>
                            <span className={styles.sidebarLabel}>{section.label}</span>
                        </button>
                    ))}
                </div>

                {/* Main Content Area */}
                <div className={styles.main}>
                    {activeSection === 'symbol' && (
                        <SymbolSection
                            localAppearance={localAppearance}
                            setLocalAppearance={setLocalAppearance}
                        />
                    )}
                    {activeSection === 'scales' && (
                        <ScalesSection
                            isTimerVisible={isTimerVisible}
                            onTimerToggle={onTimerToggle}
                            isSessionBreakVisible={isSessionBreakVisible}
                            onSessionBreakToggle={onSessionBreakToggle}
                        />
                    )}

                    {activeSection === 'openalgo' && (
                        <OpenAlgoSection
                            localHostUrl={localHostUrl}
                            setLocalHostUrl={setLocalHostUrl}
                            localApiKey={localApiKey}
                            setLocalApiKey={setLocalApiKey}
                            localWsUrl={localWsUrl}
                            setLocalWsUrl={setLocalWsUrl}
                            localUsername={localUsername}
                            setLocalUsername={setLocalUsername}
                            localChartEngine={localChartEngine}
                            setLocalChartEngine={setLocalChartEngine}
                            localTradingViewLibraryPath={localTradingViewLibraryPath}
                            setLocalTradingViewLibraryPath={setLocalTradingViewLibraryPath}
                        />
                    )}

                    {activeSection === 'logging' && (
                        <LoggingSection
                            logLevel={logLevel}
                            setLocalLogLevel={setLocalLogLevel}
                        />
                    )}

                    {activeSection === 'appearance' && (
                        <AppearanceSection
                            localAppearance={localAppearance}
                            setLocalAppearance={setLocalAppearance}
                        />
                    )}

                    {activeSection === 'shortcuts' && (
                        <div className={styles.section}>
                            <ShortcutsSettings embedded={true} />
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
                <button className={styles.cancelButton} onClick={handleCancel}>
                    Cancel
                </button>
                <button
                    className={styles.okButton}
                    onClick={handleSave}
                >
                    Ok
                </button>
            </div>
        </BaseModal>
    );
};

export default SettingsPopup;
