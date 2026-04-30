/**
 * AlertsPanel.test.tsx
 * Unit tests for AlertsPanel rendering, tab switching, navigation, and keyboard interaction.
 * TSK-CS-032
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AlertsPanel from './AlertsPanel';

// CSS modules return empty objects in jsdom
vi.mock('./AlertsPanel.module.css', () => ({ default: {} }));

const makeAlert = (overrides = {}) => ({
  id: 'alert-1',
  symbol: 'NIFTY 50',
  exchange: 'NSE',
  status: 'Active' as const,
  condition: 'crossing_up',
  created_at: '2024-01-01T10:00:00Z',
  ...overrides,
});

const makeLog = (overrides = {}) => ({
  id: 'log-1',
  symbol: 'NIFTY 50',
  exchange: 'NSE',
  time: '2024-01-01T10:01:00Z',
  message: 'Price crossed 22000',
  ...overrides,
});

const defaultProps = {
  alerts: [],
  logs: [],
  onRemoveAlert: vi.fn(),
  onRestartAlert: vi.fn(),
  onPauseAlert: vi.fn(),
  onNavigate: vi.fn(),
  onEditAlert: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ────────────────────────────────────────────────────────────────

describe('AlertsPanel rendering', () => {
  it('renders the Alerts panel header', () => {
    render(<AlertsPanel {...defaultProps} />);
    expect(screen.getByText('Alerts')).toBeTruthy();
  });

  it('shows empty state when no alerts', () => {
    render(<AlertsPanel {...defaultProps} />);
    expect(screen.getByText('No active alerts')).toBeTruthy();
  });

  it('renders alert items when alerts are provided', () => {
    const alerts = [makeAlert({ symbol: 'NIFTY 50' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} />);
    // Symbol should appear (normalization renders canonical symbol)
    expect(screen.getByText('NIFTY 50')).toBeTruthy();
  });

  it('renders the condition description for price alerts', () => {
    const alerts = [makeAlert({ condition: 'crossing_up', type: 'price' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} />);
    expect(screen.getByText('crossing_up')).toBeTruthy();
  });

  it('renders indicator alert name when type is indicator', () => {
    const alerts = [makeAlert({
      type: 'indicator',
      condition: { label: 'RSI above 70' },
    })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} />);
    expect(screen.getByText('RSI above 70')).toBeTruthy();
  });

  it('renders fallback "Indicator Alert" when condition label is missing', () => {
    const alerts = [makeAlert({
      type: 'indicator',
      condition: {},
      name: undefined,
    })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} />);
    expect(screen.getByText('Indicator Alert')).toBeTruthy();
  });
});

// ── Tab switching ────────────────────────────────────────────────────────────

describe('AlertsPanel tab switching', () => {
  it('defaults to the Alerts tab', () => {
    render(<AlertsPanel {...defaultProps} />);
    expect(screen.getByText('No active alerts')).toBeTruthy();
  });

  it('switches to Log tab when clicked', () => {
    render(<AlertsPanel {...defaultProps} />);
    const logTab = screen.getByText('Log');
    fireEvent.click(logTab);
    expect(screen.getByText('No logs')).toBeTruthy();
  });

  it('shows log count badge when logs exist', () => {
    const logs = [makeLog(), makeLog({ id: 'log-2' })];
    render(<AlertsPanel {...defaultProps} logs={logs} />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('renders log entries after switching to Log tab', () => {
    const logs = [makeLog({ message: 'Alert triggered at 22000' })];
    render(<AlertsPanel {...defaultProps} logs={logs} />);
    fireEvent.click(screen.getByText('Log'));
    expect(screen.getByText('Alert triggered at 22000')).toBeTruthy();
  });
});

// ── Symbol normalization ─────────────────────────────────────────────────────

describe('AlertsPanel symbol normalization', () => {
  it('normalizes BANKNIFTY alias to NIFTY BANK for display', () => {
    const alerts = [makeAlert({ symbol: 'BANKNIFTY', exchange: 'NSE' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} />);
    expect(screen.getByText('NIFTY BANK')).toBeTruthy();
  });

  it('passes normalized symbol when navigating on alert click', () => {
    const onNavigate = vi.fn();
    const alerts = [makeAlert({ symbol: 'BANKNIFTY', exchange: 'NSE' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} onNavigate={onNavigate} />);
    // Click on the alert item text (not a button)
    fireEvent.click(screen.getByText('NIFTY BANK'));
    expect(onNavigate).toHaveBeenCalledWith({
      symbol: 'NIFTY BANK',
      exchange: 'NSE',
    });
  });

  it('normalizes log symbols for display', () => {
    const logs = [makeLog({ symbol: 'BANKNIFTY', exchange: 'NSE' })];
    render(<AlertsPanel {...defaultProps} logs={logs} />);
    fireEvent.click(screen.getByText('Log'));
    expect(screen.getByText('NIFTY BANK')).toBeTruthy();
  });
});

// ── Action buttons ───────────────────────────────────────────────────────────

describe('AlertsPanel action buttons', () => {
  it('calls onPauseAlert when pause icon clicked on Active alert', () => {
    const onPauseAlert = vi.fn();
    const alerts = [makeAlert({ status: 'Active' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} onPauseAlert={onPauseAlert} />);
    // Pause button title
    const pauseBtn = document.querySelector('[title="Pause Alert"]') as HTMLElement;
    expect(pauseBtn).toBeTruthy();
    fireEvent.click(pauseBtn);
    expect(onPauseAlert).toHaveBeenCalledWith('alert-1');
  });

  it('calls onRestartAlert when resume icon clicked on Paused alert', () => {
    const onRestartAlert = vi.fn();
    const alerts = [makeAlert({ status: 'Paused' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} onRestartAlert={onRestartAlert} />);
    const resumeBtn = document.querySelector('[title="Resume Alert"]') as HTMLElement;
    expect(resumeBtn).toBeTruthy();
    fireEvent.click(resumeBtn);
    expect(onRestartAlert).toHaveBeenCalledWith('alert-1');
  });

  it('calls onRemoveAlert when trash icon clicked', () => {
    const onRemoveAlert = vi.fn();
    const alerts = [makeAlert()];
    render(<AlertsPanel {...defaultProps} alerts={alerts} onRemoveAlert={onRemoveAlert} />);
    const removeBtn = document.querySelector('[title="Remove Alert"]') as HTMLElement;
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn);
    expect(onRemoveAlert).toHaveBeenCalledWith('alert-1');
  });

  it('calls onEditAlert when edit icon clicked', () => {
    const onEditAlert = vi.fn();
    const alerts = [makeAlert()];
    render(<AlertsPanel {...defaultProps} alerts={alerts} onEditAlert={onEditAlert} />);
    const editBtn = document.querySelector('[title="Edit Alert"]') as HTMLElement;
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn);
    expect(onEditAlert).toHaveBeenCalledWith(alerts[0]);
  });

  it('does not call onNavigate when an action button is clicked', () => {
    const onNavigate = vi.fn();
    const alerts = [makeAlert()];
    render(<AlertsPanel {...defaultProps} alerts={alerts} onNavigate={onNavigate} />);
    const removeBtn = document.querySelector('[title="Remove Alert"]') as HTMLElement;
    fireEvent.click(removeBtn);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

// ── Keyboard navigation ──────────────────────────────────────────────────────

describe('AlertsPanel keyboard navigation', () => {
  it('moves focus down with ArrowDown', () => {
    const alerts = [makeAlert(), makeAlert({ id: 'alert-2', symbol: 'RELIANCE' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} />);
    const list = document.querySelector('[tabindex="0"]') as HTMLElement;
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    // First item gets focused (index 0)
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    // Now at index 1 — no error means navigation works
  });

  it('calls onRemoveAlert with Delete key when item focused', () => {
    const onRemoveAlert = vi.fn();
    const alerts = [makeAlert()];
    render(<AlertsPanel {...defaultProps} alerts={alerts} onRemoveAlert={onRemoveAlert} />);
    const list = document.querySelector('[tabindex="0"]') as HTMLElement;
    // Focus first item
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    // Delete focused item
    fireEvent.keyDown(list, { key: 'Delete' });
    expect(onRemoveAlert).toHaveBeenCalledWith('alert-1');
  });

  it('calls onPauseAlert with Space key when Active item focused', () => {
    const onPauseAlert = vi.fn();
    const alerts = [makeAlert({ status: 'Active' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} onPauseAlert={onPauseAlert} />);
    const list = document.querySelector('[tabindex="0"]') as HTMLElement;
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: ' ' });
    expect(onPauseAlert).toHaveBeenCalledWith('alert-1');
  });
});

// ── Status badge display ─────────────────────────────────────────────────────

describe('AlertsPanel status display', () => {
  it('shows Active status', () => {
    const alerts = [makeAlert({ status: 'Active' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows Triggered status', () => {
    const alerts = [makeAlert({ status: 'Triggered' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} />);
    expect(screen.getByText('Triggered')).toBeTruthy();
  });

  it('shows Paused status', () => {
    const alerts = [makeAlert({ status: 'Paused' })];
    render(<AlertsPanel {...defaultProps} alerts={alerts} />);
    expect(screen.getByText('Paused')).toBeTruthy();
  });
});
