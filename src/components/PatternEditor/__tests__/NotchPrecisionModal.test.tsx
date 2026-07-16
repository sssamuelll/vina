// @vitest-environment jsdom
/**
 * Notch-precision F3 review hardening — the precision panel's validation
 * and key handling (findings #3, #5, #9 of the adversarial review).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import NotchPrecisionModal from '../NotchPrecisionModal';

afterEach(cleanup);

function setup() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const onPreview = vi.fn();
  render(
    <NotchPrecisionModal
      initialDistanceMm={30}
      initialDepthMm={8}
      maxDistanceMm={400}
      onPreview={onPreview}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  const distance = screen.getByLabelText(/Distancia desde la esquina/i) as HTMLInputElement;
  const depth = screen.getByLabelText(/Profundidad/i) as HTMLInputElement;
  const confirm = screen.getByRole('button', { name: /Colocar exacto/i }) as HTMLButtonElement;
  return { onConfirm, onCancel, onPreview, distance, depth, confirm };
}

describe('NotchPrecisionModal — validation (findings #5, #9)', () => {
  it('pre-fills from the anchor and enables confirm', () => {
    const { distance, depth, confirm } = setup();
    expect(distance.value).toBe('30.0');
    expect(depth.value).toBe('8');
    expect(confirm.disabled).toBe(false);
  });

  it('a cleared distance field disables confirm (empty is NOT 0mm)', () => {
    const { distance, confirm, onConfirm } = setup();
    fireEvent.change(distance, { target: { value: '' } });
    expect(confirm.disabled).toBe(true);
    // Enter must not confirm either
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a distance beyond the outline perimeter disables confirm (no silent wrap)', () => {
    const { distance, confirm } = setup();
    fireEvent.change(distance, { target: { value: '500' } });
    expect(confirm.disabled).toBe(true);
  });

  it('a cleared depth field disables confirm', () => {
    const { depth, confirm } = setup();
    fireEvent.change(depth, { target: { value: '' } });
    expect(confirm.disabled).toBe(true);
  });

  it('confirm passes the parsed values', () => {
    const { distance, depth, confirm, onConfirm } = setup();
    fireEvent.change(distance, { target: { value: '42' } });
    fireEvent.change(depth, { target: { value: '10' } });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(42, 10);
  });
});

describe('NotchPrecisionModal — live preview (finding #10)', () => {
  it('valid distance edits fire onPreview; invalid ones do not', () => {
    const { distance, onPreview } = setup();
    fireEvent.change(distance, { target: { value: '42' } });
    expect(onPreview).toHaveBeenCalledWith(42);
    onPreview.mockClear();
    fireEvent.change(distance, { target: { value: '999' } }); // > perimeter
    expect(onPreview).not.toHaveBeenCalled();
  });
});

describe('NotchPrecisionModal — key handling (finding #3)', () => {
  it('Escape cancels AND stops propagation so global shortcuts never see it', () => {
    const { onCancel } = setup();
    const leaked = vi.fn();
    // Simulates the shortcut system: a bubble-phase window listener.
    window.addEventListener('keydown', leaked);
    fireEvent.keyDown(window, { key: 'Escape' });
    window.removeEventListener('keydown', leaked);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(leaked).not.toHaveBeenCalled();
  });

  it('Enter confirms with the current values and stops propagation', () => {
    const { onConfirm } = setup();
    const leaked = vi.fn();
    window.addEventListener('keydown', leaked);
    fireEvent.keyDown(window, { key: 'Enter' });
    window.removeEventListener('keydown', leaked);
    expect(onConfirm).toHaveBeenCalledWith(30, 8);
    expect(leaked).not.toHaveBeenCalled();
  });
});
