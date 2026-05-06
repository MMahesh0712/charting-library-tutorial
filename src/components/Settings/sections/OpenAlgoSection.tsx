/**
 * OpenAlgo Section Component
 * OpenAlgo connection settings for SettingsPopup
 */
import React, { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import styles from '../SettingsPopup.module.css';
import { getDefaultHostUrl, getDefaultWebSocketHost } from '../../../services/api/config';

export interface OpenAlgoSectionProps {
    localHostUrl: string;
    setLocalHostUrl: (url: string) => void;
    localApiKey: string;
    setLocalApiKey: (key: string) => void;
    localWsUrl: string;
    setLocalWsUrl: (url: string) => void;
    localUsername: string;
    setLocalUsername: (username: string) => void;
    localChartEngine: 'legacy' | 'tradingview';
    setLocalChartEngine: (engine: 'legacy' | 'tradingview') => void;
    localTradingViewLibraryPath: string;
    setLocalTradingViewLibraryPath: (path: string) => void;
}

const OpenAlgoSection: React.FC<OpenAlgoSectionProps> = ({
    localHostUrl,
    setLocalHostUrl,
    localApiKey,
    setLocalApiKey,
    localWsUrl,
    setLocalWsUrl,
    localUsername,
    setLocalUsername,
    localChartEngine,
    setLocalChartEngine,
    localTradingViewLibraryPath,
    setLocalTradingViewLibraryPath,
}) => {
    const [showApiKey, setShowApiKey] = useState(false);

    return (
        <div className={styles.section}>
            <h3 className={styles.sectionTitle}>OPENALGO CONNECTION</h3>

            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Host URL</label>
                <input
                    type="text"
                    value={localHostUrl}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setLocalHostUrl(e.target.value)}
                    placeholder={getDefaultHostUrl()}
                    className={styles.input}
                />
                <p className={styles.inputHint}>
                    Default: {getDefaultHostUrl()}. On VPS, keep this on the same app origin unless Data Hub is hosted elsewhere.
                </p>
            </div>

            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>API Key</label>
                <div className={styles.inputWithIcon}>
                    <input
                        type={showApiKey ? "text" : "password"}
                        value={localApiKey}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setLocalApiKey(e.target.value)}
                        placeholder="Enter your OpenAlgo API key"
                        className={styles.input}
                    />
                    <button
                        type="button"
                        className={styles.eyeButton}
                        onClick={() => setShowApiKey(!showApiKey)}
                        title={showApiKey ? "Hide API key" : "Show API key"}
                    >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
                <p className={styles.inputHint}>
                    Find your API key in the{' '}
                    <a
                        href={`${localHostUrl}/apikey`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.link}
                    >
                        OpenAlgo Dashboard
                    </a>
                </p>
            </div>

            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>WebSocket URL</label>
                <input
                    type="text"
                    value={localWsUrl}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setLocalWsUrl(e.target.value)}
                    placeholder={getDefaultWebSocketHost()}
                    className={styles.input}
                />
                <p className={styles.inputHint}>
                    Default: {getDefaultWebSocketHost()}. Leave this on the app host for VPS unless WebSocket is exposed separately.
                </p>
            </div>

            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Chart Engine</label>
                <select
                    value={localChartEngine}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setLocalChartEngine(e.target.value as 'legacy' | 'tradingview')}
                    className={styles.input}
                >
                    <option value="legacy">Legacy Chart</option>
                    <option value="tradingview">TradingView Advanced Chart</option>
                </select>
                <p className={styles.inputHint}>
                    Use Legacy while migrating. Switch to TradingView after library files are available on the same app host.
                </p>
            </div>

            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>TradingView Library Path</label>
                <input
                    type="text"
                    value={localTradingViewLibraryPath}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setLocalTradingViewLibraryPath(e.target.value)}
                    placeholder="/charting_library/"
                    className={styles.input}
                />
                <p className={styles.inputHint}>
                    VPS-safe default: /charting_library/. Keep TradingView static files on the same host and port when possible.
                </p>
            </div>

            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>OpenAlgo Username</label>
                <input
                    type="text"
                    value={localUsername}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setLocalUsername(e.target.value)}
                    placeholder="Enter your OpenAlgo login username"
                    className={styles.input}
                />
                <p className={styles.inputHint}>
                    Your OpenAlgo login username (NOT Telegram username). Required for Telegram notifications.
                </p>
            </div>
        </div>
    );
};

export default OpenAlgoSection;
