/**
 * PanelLoader
 *
 * Consistent loading spinner for lazy-loaded right panels (ANNScanner, DepthOfMarket).
 * Replaces ad-hoc inline spinners — all panels share one visual identity and CSS variables.
 *
 * TSK-CS-030 (Error Handling and Fallback UX)
 */
import React from 'react';

interface PanelLoaderProps {
    label?: string;
}

/**
 * Consistent loading skeleton for lazy-loaded right-panel components.
 * Uses CSS variables to match the active theme.
 */
const PanelLoader: React.FC<PanelLoaderProps> = ({ label }) => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 20px',
            gap: '12px',
            color: 'var(--tv-color-text-secondary, #787b86)',
            fontSize: '13px',
        }}
    >
        <div
            style={{
                width: '24px',
                height: '24px',
                border: '2px solid var(--tv-color-popup-element-border, rgba(255,255,255,0.15))',
                borderTopColor: 'var(--tv-color-pane-background-active, #2962ff)',
                borderRadius: '50%',
                              animation: 'panelLoaderSpin 0.7s linear infinite',
            }}
        />
        <style>{`@keyframes panelLoaderSpin { to { transform: rotate(360deg); } }`}</style>
        <span>{label || 'Loading...'}</span>
    </div>
);

export default PanelLoader;
