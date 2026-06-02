/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DockShell from '../DockShell';

afterEach(cleanup);

describe('DockShell', () => {
  it('renders the domain label and children', () => {
    render(<DockShell side="left" domainLabel="2D"><button>tool</button></DockShell>);
    expect(screen.getByText('2D')).toBeTruthy();
    expect(screen.getByText('tool')).toBeTruthy();
  });

  it('applies the side modifier class', () => {
    const { container } = render(<DockShell side="right" domainLabel="3D"><span /></DockShell>);
    expect(container.querySelector('.dock--right')).toBeTruthy();
  });
});
