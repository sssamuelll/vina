// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import EdgeWidthMenu from '../EdgeWidthMenu';

afterEach(cleanup);

function setup(over = {}) {
  const props = {
    position: { x: 100, y: 100 },
    edgeName: 'hemline',
    currentWidth: 10,
    isOverridden: false,
    pieceDefaultWidth: 10,
    onApply: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<EdgeWidthMenu {...props} />);
  return props;
}

describe('EdgeWidthMenu', () => {
  it('shows the edge name and the current width prefilled', () => {
    setup({ edgeName: 'hemline', currentWidth: 10 });
    expect(screen.getByText(/hemline/i)).toBeTruthy();
    expect((screen.getByLabelText(/width/i) as HTMLInputElement).value).toBe('10');
  });

  it('applies the typed width on Enter', () => {
    const p = setup();
    const input = screen.getByLabelText(/width/i);
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onApply).toHaveBeenCalledWith(40);
  });

  it('applies the typed width via the Apply button', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText(/width/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(p.onApply).toHaveBeenCalledWith(25);
  });

  it('does not apply an invalid (non-numeric or negative) width', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText(/width/i), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(p.onApply).not.toHaveBeenCalled();
  });

  it('clears back to inherit when the inherit option is used', () => {
    const p = setup({ isOverridden: true, currentWidth: 40, pieceDefaultWidth: 10 });
    fireEvent.click(screen.getByRole('button', { name: /inherit/i }));
    expect(p.onClear).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const p = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalled();
  });
});
