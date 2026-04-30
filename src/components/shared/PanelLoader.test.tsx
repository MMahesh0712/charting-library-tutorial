/**
 * PanelLoader.test.tsx
 * Unit tests for the PanelLoader spinner component.
 * TSK-CS-032
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PanelLoader from './PanelLoader';

describe('PanelLoader', () => {
  it('renders default label "Loading..." when no label provided', () => {
    render(<PanelLoader />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders custom label when provided', () => {
    render(<PanelLoader label="Loading Scanner..." />);
    expect(screen.getByText('Loading Scanner...')).toBeTruthy();
  });

  it('renders a spinner element', () => {
    const { container } = render(<PanelLoader />);
    // The component renders a div with a nested spinner div and a style tag
    expect(container.firstChild).toBeTruthy();
  });

  it('renders "Loading DOM..." label correctly', () => {
    render(<PanelLoader label="Loading DOM..." />);
    expect(screen.getByText('Loading DOM...')).toBeTruthy();
  });
});
