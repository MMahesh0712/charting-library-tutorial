/**
 * ErrorBoundary.test.tsx
 * Unit tests for the ErrorBoundary component — catch, display, reset, custom fallback.
 * TSK-CS-032
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

// Suppress console.error for expected throws during tests
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// Helper: a child that throws on render when `shouldThrow` is true
const ThrowingChild = ({ shouldThrow, message = 'Test error' }: { shouldThrow: boolean; message?: string }) => {
  if (shouldThrow) throw new Error(message);
  return <div data-testid="child">OK</div>;
};

// ── Normal rendering ─────────────────────────────────────────────────────────

describe('ErrorBoundary — normal rendering', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });
});

// ── Error catching ───────────────────────────────────────────────────────────

describe('ErrorBoundary — error catching', () => {
  it('renders default fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} message="Boom" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Boom')).toBeTruthy();
  });

  it('includes the label in the error heading when label prop is provided', () => {
    render(
      <ErrorBoundary label="ANN Scanner">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('ANN Scanner failed to load')).toBeTruthy();
  });

  it('shows "Something went wrong" when no label is provided', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('shows the error message text', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} message="Cannot read properties of undefined" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Cannot read properties of undefined')).toBeTruthy();
  });

  it('shows fallback message when error has no message', () => {
    const ErrorChild = () => { throw new Error(); };
    render(
      <ErrorBoundary>
        <ErrorChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('An unexpected error occurred')).toBeTruthy();
  });
});

// ── Custom fallback ──────────────────────────────────────────────────────────

describe('ErrorBoundary — custom fallback', () => {
  it('renders custom fallback instead of default UI when provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom error</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('custom-fallback')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});

// ── Reset (Try again) ────────────────────────────────────────────────────────

describe('ErrorBoundary — reset', () => {
  it('renders "Try again" and "Reload app" buttons in error state', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.getByText('Reload app')).toBeTruthy();
  });

  it('clears error state when "Try again" is clicked', () => {
    // We need a component that can toggle the throw
    let shouldThrow = true;
    const ToggleChild = () => {
      if (shouldThrow) throw new Error('Recoverable error');
      return <div data-testid="recovered">Recovered</div>;
    };

    render(
      <ErrorBoundary>
        <ToggleChild />
      </ErrorBoundary>
    );

    // Error UI is shown
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    // Fix the throw before clicking Try again
    shouldThrow = false;
    fireEvent.click(screen.getByText('Try again'));

    // After reset, children re-render without throwing
    expect(screen.getByTestId('recovered')).toBeTruthy();
  });
});
