/**
 * Account Panel Constants
 * Tab definitions and configuration
 */

export interface Tab {
    id: string;
    label: string;
}

// Tab definitions
export const TABS: Tab[] = [
    { id: 'live-positions', label: 'Live Positions' },
    { id: 'today-trades', label: 'Today Trades' },
    { id: 'orders', label: 'Orders' },
    { id: 'activity', label: 'Activity' },
];

// Auto-refresh interval in milliseconds
export const AUTO_REFRESH_INTERVAL_MS = 30000;

export default {
    TABS,
    AUTO_REFRESH_INTERVAL_MS,
};
