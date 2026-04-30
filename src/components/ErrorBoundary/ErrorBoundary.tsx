import React from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import logger from '../../utils/logger';

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Optional custom fallback — if omitted, default error UI is shown */
    fallback?: ReactNode;
    /** Optional label for which panel/area this wraps — shown in error message */
    label?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        const label = this.props.label || 'unknown';
        logger.error(`[ErrorBoundary:${label}] Caught error:`, error, errorInfo);
    }

    handleReset = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const label = this.props.label;

            return (
                <div
                    style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: 'var(--tv-color-text-primary, #d1d4dc)',
                        backgroundColor: 'var(--tv-color-pane-background, #131722)',
                        border: '1px solid var(--tv-color-popup-element-border, rgba(255,255,255,0.1))',
                        borderRadius: '8px',
                        margin: '8px',
                    }}
                >
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>&#x26A0;&#xFE0F;</div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>
                        {label ? `${label} failed to load` : 'Something went wrong'}
                    </h3>
                    <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--tv-color-text-secondary, #787b86)', wordBreak: 'break-word' }}>
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                            onClick={this.handleReset}
                            style={{
                                padding: '6px 14px',
                                fontSize: '12px',
                                border: '1px solid var(--tv-color-popup-element-border, rgba(255,255,255,0.2))',
                                borderRadius: '4px',
                                background: 'var(--tv-color-toolbar-button-background-hover, rgba(255,255,255,0.08))',
                                color: 'var(--tv-color-text-primary, #d1d4dc)',
                                cursor: 'pointer',
                            }}
                        >
                            Try again
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '6px 14px',
                                fontSize: '12px',
                                border: 'none',
                                borderRadius: '4px',
                                background: 'var(--tv-color-pane-background-active, #2962ff)',
                                color: '#fff',
                                cursor: 'pointer',
                            }}
                        >
                            Reload app
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
