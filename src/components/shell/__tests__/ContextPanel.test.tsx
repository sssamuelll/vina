/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContextPanel from '../ContextPanel';

afterEach(cleanup);

describe('ContextPanel side routing', () => {
  it('defaults to the right side', () => {
    const { container } = render(<ContextPanel title="Avatar" onClose={() => {}}>body</ContextPanel>);
    const root = container.querySelector('.context-panel')!;
    expect(root.classList.contains('context-panel--right')).toBe(true);
    expect(root.classList.contains('context-panel--left')).toBe(false);
  });

  it('renders on the left when side="left"', () => {
    const { container } = render(<ContextPanel title="Grading" side="left" onClose={() => {}}>body</ContextPanel>);
    const root = container.querySelector('.context-panel')!;
    expect(root.classList.contains('context-panel--left')).toBe(true);
    expect(root.classList.contains('context-panel--right')).toBe(false);
  });

  it('renders the title and still closes on the button and Escape', () => {
    const onClose = vi.fn();
    render(<ContextPanel title="Avatar" side="right" onClose={onClose}>body</ContextPanel>);
    expect(screen.getByText('Avatar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /cerrar panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
