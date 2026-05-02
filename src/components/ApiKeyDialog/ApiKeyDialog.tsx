import React, { useState } from 'react';
import type { FormEvent, ChangeEvent, CSSProperties } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { BaseModal, BaseButton } from '../shared';
import { get, set } from '../../services/storageService';
import { getApiBase, getDefaultHostUrl } from '../../services/api/config';

const DEFAULT_HOST = getDefaultHostUrl();

export interface ApiKeyDialogProps {
    onSave: (apiKey: string) => void;
    onClose?: () => void;
}

const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ onSave, onClose }) => {
    const [hostUrl, setHostUrl] = useState(() => {
        return get('oa_host_url') || DEFAULT_HOST;
    });
    const [apiKey, setApiKey] = useState('PD_DUMMY_KEY'); // Auto-fill with dummy key for local use
    const [showApiKey, setShowApiKey] = useState(false);
    const [error, setError] = useState('');
    const [isValidating, setIsValidating] = useState(false);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();
        if (!apiKey.trim()) {
            setError('Please enter your API key');
            return;
        }

        setIsValidating(true);
        setError('');

        try {
            // Save host URL before validation
            set('oa_host_url', hostUrl);

            const apiUrl = `${getApiBase()}/intervals`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ apikey: apiKey.trim() })
            });

            if (response.ok) {
                // API key is valid - save API key
                set('oa_apikey', apiKey.trim());
                set('_cloud_sync_done', 'true');
                onSave(apiKey.trim());
            } else if (response.status === 400 || response.status === 401 || response.status === 403) {
                setError('Invalid API key. Please check your credentials and try again.');
            } else {
                setError(`Server error: ${response.status}. Please try again later.`);
            }
        } catch (err) {
            console.error('[ApiKeyDialog] Validation error:', err);
            setError('Could not connect to Pratham Dhan server. Please check if Data-Hub is running on port 8000.');
        } finally {
            setIsValidating(false);
        }
    };

    const inputStyle: CSSProperties = {
        width: '100%',
        padding: '10px 12px',
        backgroundColor: 'var(--tv-color-input-background)',
        border: '1px solid var(--tv-color-border)',
        borderRadius: '4px',
        color: 'var(--tv-color-text-primary)',
        fontSize: '14px',
        outline: 'none',
        boxSizing: 'border-box'
    };

    const labelStyle: CSSProperties = {
        display: 'block',
        color: 'var(--tv-color-text-primary)',
        fontSize: '13px',
        marginBottom: '6px',
        fontWeight: 500
    };

    const hintStyle: CSSProperties = {
        margin: '6px 0 0 0',
        color: 'var(--tv-color-text-secondary)',
        fontSize: '11px',
        lineHeight: 1.4
    };

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose || (() => {})}
            title="Connect to Pratham Dhan"
            showCloseButton={!!onClose}
            closeOnOverlayClick={!!onClose}
            closeOnEscape={!!onClose}
            size="small"
        >
            <p style={{
                margin: '0 0 20px 0',
                color: 'var(--tv-color-text-secondary)',
                fontSize: '13px',
                lineHeight: 1.5
            }}>
                Configure your Pratham Dhan server connection.
            </p>

            <form onSubmit={handleSubmit} id="apikey-form">
                {/* Host URL Field */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Data Hub URL</label>
                    <input
                        type="text"
                        value={hostUrl}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setHostUrl(e.target.value)}
                        placeholder="http://localhost:8000"
                        style={inputStyle}
                        className="focusable-input"
                    />
                    <p style={hintStyle}>
                        Default: {DEFAULT_HOST}
                    </p>
                </div>

                {/* API Key Field */}
                <div style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>API Key</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                            type={showApiKey ? "text" : "password"}
                            value={apiKey}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                setApiKey(e.target.value);
                                setError('');
                            }}
                            placeholder="Enter your API key"
                            autoFocus
                            style={{
                                ...inputStyle,
                                paddingRight: '40px',
                                borderColor: error ? 'var(--tv-color-down)' : 'var(--tv-color-border)'
                            }}
                            className="focusable-input"
                        />
                        <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            title={showApiKey ? "Hide API key" : "Show API key"}
                            style={{
                                position: 'absolute',
                                right: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'none',
                                border: 'none',
                                color: 'var(--tv-color-text-secondary)',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px'
                            }}
                        >
                            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    {error && (
                        <p style={{
                            margin: '8px 0 0 0',
                            color: 'var(--tv-color-down)',
                            fontSize: '12px'
                        }}>
                            {error}
                        </p>
                    )}
                    <p style={hintStyle}>
                        Use any placeholder key for direct data-hub connection, for example `PD_DUMMY_KEY`.
                    </p>
                </div>

                <div style={{
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'flex-end',
                    alignItems: 'center'
                }}>
                    <BaseButton
                        type="submit"
                        variant="primary"
                        disabled={isValidating}
                        loading={isValidating}
                    >
                        {isValidating ? 'Validating...' : 'Connect'}
                    </BaseButton>
                </div>
            </form>
        </BaseModal>
    );
};

export default ApiKeyDialog;
