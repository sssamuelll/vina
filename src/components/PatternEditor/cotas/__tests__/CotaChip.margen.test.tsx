// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CotaChip from '../CotaChip';
import type { Cota } from '../cotas';

/**
 * Spec 2026-09-02 § 6 (scrub fuera) y § 5.7 (rótulo): el chip de margen no
 * arma scrub —la ganancia de CotaChip está calibrada para 100-3000 mm y un
 * margen vive en [0, 50]— y lleva su rótulo (`de la pieza` / `del tramo`)
 * como `data-rotulo` en botón e input.
 */
afterEach(cleanup);

const margen = (over: Partial<Cota> = {}): Cota => ({
  id: 'margen:p:p:top', kind: 'margen', label: 'Margen · top', valueMm: 10, unit: 'mm', min: 0, max: 100,
  primary: false, rotulo: 'de la pieza', scrub: false,
  a: { x: 100, y: 0 }, b: { x: 100, y: 0 }, outward: { x: 0, y: -1 }, apply: () => null, ...over,
});

function monta(cota: Cota) {
  const props = {
    cota, left: 50, top: 20, zoom2D: 1,
    onCommit: vi.fn(), onScrubStart: vi.fn(), onScrub: vi.fn(), onScrubEnd: vi.fn(), onScrubCancel: vi.fn(),
  };
  render(<CotaChip {...props} />);
  return props;
}
function pointer(el: Element, type: string, x: number) {
  fireEvent(el, new MouseEvent(type, { clientX: x, clientY: 0, bubbles: true, button: 0 }));
}

describe('CotaChip — margen', () => {
  it('scrub: false → arrastrar 30 px no scrubea, y el clic que sigue abre la edición', () => {
    const p = monta(margen());
    const b = screen.getByRole('button') as HTMLButtonElement & { setPointerCapture: unknown };
    b.setPointerCapture = vi.fn();
    pointer(b, 'pointerdown', 100);
    pointer(b, 'pointermove', 130);
    pointer(b, 'pointerup', 130);
    expect(p.onScrubStart).not.toHaveBeenCalled();
    expect(p.onScrub).not.toHaveBeenCalled();
    expect(p.onScrubEnd).not.toHaveBeenCalled();
    fireEvent.click(b);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('sin scrub lleva la clase cota--sin-scrub (cursor de texto, no ew-resize)', () => {
    monta(margen());
    expect(screen.getByRole('button').classList.contains('cota--sin-scrub')).toBe(true);
    cleanup();
    monta(margen({ scrub: undefined }));
    expect(screen.getByRole('button').classList.contains('cota--sin-scrub')).toBe(false);
  });

  it('el rótulo va como data-rotulo en el botón y sobrevive en el input; sin rótulo no hay atributo', () => {
    monta(margen());
    const b = screen.getByRole('button');
    expect(b.getAttribute('data-rotulo')).toBe('de la pieza');
    fireEvent.click(b);
    expect(screen.getByRole('textbox').getAttribute('data-rotulo')).toBe('de la pieza');
    cleanup();
    monta(margen({ primary: true, rotulo: undefined }));
    expect(screen.getByRole('button').hasAttribute('data-rotulo')).toBe(false);
  });

  it('el rótulo va abajo cuando la normal apunta hacia abajo, en el botón y en el input', () => {
    monta(margen({ outward: { x: 0, y: 1 } }));
    const b = screen.getByRole('button');
    expect(b.getAttribute('data-lado')).toBe('abajo');
    fireEvent.click(b);
    expect(screen.getByRole('textbox').getAttribute('data-lado')).toBe('abajo');
  });

  it('0 es un valor válido: escribir 0 y Enter confirma (sin margen, a propósito)', () => {
    const p = monta(margen());
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledWith(p.cota, 0, 'enter');
  });

  it('las flechas siguen: ↑ +1, Shift ↑ +10, Alt ↑ +0,1', () => {
    monta(margen());
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('11');
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
    expect(input.value).toBe('21');
    fireEvent.keyDown(input, { key: 'ArrowUp', altKey: true });
    expect(input.value).toBe('21,1');
  });
});
