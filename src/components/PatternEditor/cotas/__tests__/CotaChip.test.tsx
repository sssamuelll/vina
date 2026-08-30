// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CotaChip from '../CotaChip';
import type { Cota } from '../cotas';

/**
 * Cotas vivas (spec 2026-08-30 § 5.3): el chip es lectura en reposo y control
 * al tocarlo — clic escribe, arrastre ajusta, Enter aplica, Escape descarta,
 * Tab confirma y sigue. Las teclas del campo no salen del campo.
 */
afterEach(cleanup);

const cota = (over: Partial<Cota> = {}): Cota => ({
  id: 'ancho', kind: 'ancho', label: 'Ancho de la pieza', valueMm: 100, unit: 'mm', min: 1, max: 3000,
  primary: true, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, outward: { x: 0, y: -1 },
  apply: () => null, ...over,
});

function monta(over: Partial<ComponentProps<typeof CotaChip>> = {}) {
  const props = {
    cota: cota(), left: 50, top: 20, zoom2D: 1,
    onCommit: vi.fn(), onScrubStart: vi.fn(), onScrub: vi.fn(), onScrubEnd: vi.fn(),
    ...over,
  };
  render(<CotaChip {...props} />);
  return props;
}

describe('CotaChip - reposo', () => {
  it('es un botón con el valor formateado y el aria-label en español', () => {
    monta();
    const b = screen.getByRole('button', { name: 'Ancho de la pieza: 100 mm' });
    expect(b.textContent).toBe('100 mm');
    expect(b.style.left).toBe('50px');
    expect(b.style.top).toBe('20px');
  });
  it('un clic entra en edición con el valor seleccionado', () => {
    monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('100');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(document.activeElement).toBe(input);
  });
  it('deshabilitado: no entra en edición ni scrubea', () => {
    const p = monta({ disabled: true });
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(p.onScrubStart).not.toHaveBeenCalled();
  });
});

describe('CotaChip - edición', () => {
  it('Enter confirma UNA vez con el valor parseado y vuelve al botón con el foco', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '300,5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledTimes(1);
    expect(p.onCommit).toHaveBeenCalledWith(p.cota, 300.5);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });
  it('Escape descarta sin confirmar y devuelve el foco al botón', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button').textContent).toBe('100 mm');
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });
  it('Tab confirma y NO detiene el Tab nativo (el foco sigue al siguiente)', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '150' } });
    const noPrevenido = fireEvent.keyDown(input, { key: 'Tab' });
    expect(p.onCommit).toHaveBeenCalledWith(p.cota, 150);
    expect(noPrevenido).toBe(true);
  });
  it('blur con valor válido y distinto confirma; con el mismo valor o inválido no', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    let input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.blur(input);
    expect(p.onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button'));
    input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(p.onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button'));
    input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '120' } });
    fireEvent.blur(input);
    expect(p.onCommit).toHaveBeenCalledWith(p.cota, 120);
  });
  it('Enter con texto inválido no confirma y marca el campo', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(input.className).toContain('cota--invalida');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
  it('flechas: arriba +1, Shift+arriba +10, abajo -1, y no confirman', () => {
    const p = monta();
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('101');
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
    expect(input.value).toBe('111');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('110');
    expect(p.onCommit).not.toHaveBeenCalled();
  });
  it('las teclas dentro del campo no burbujean a window', () => {
    const espia = vi.fn();
    window.addEventListener('keydown', espia);
    monta();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace' });
    expect(espia).not.toHaveBeenCalled();
    window.removeEventListener('keydown', espia);
  });
});

describe('CotaChip - scrub', () => {
  function pointer(el: Element, type: string, x: number, extra: Record<string, unknown> = {}) {
    fireEvent(el, new MouseEvent(type, { clientX: x, clientY: 0, bubbles: true, button: 0, ...extra }));
  }
  function botonConCaptura() {
    const b = screen.getByRole('button') as HTMLButtonElement & { setPointerCapture: unknown; releasePointerCapture: unknown };
    b.setPointerCapture = vi.fn();
    b.releasePointerCapture = vi.fn();
    return b;
  }
  it('3 px no es scrub: el clic posterior abre la edición', () => {
    const p = monta();
    const b = botonConCaptura();
    pointer(b, 'pointerdown', 100);
    pointer(b, 'pointermove', 103);
    pointer(b, 'pointerup', 103);
    fireEvent.click(b);
    expect(p.onScrubStart).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
  it('4 px o más es scrub: start una vez, move con dx/zoom mm, end con el valor final; el clic posterior no abre la edición', () => {
    const p = monta({ zoom2D: 2 });
    const b = botonConCaptura();
    pointer(b, 'pointerdown', 100);
    pointer(b, 'pointermove', 110);
    pointer(b, 'pointermove', 140);
    pointer(b, 'pointerup', 140);
    fireEvent.click(b);
    expect(p.onScrubStart).toHaveBeenCalledTimes(1);
    expect(p.onScrub).toHaveBeenNthCalledWith(1, p.cota, 105);
    expect(p.onScrub).toHaveBeenNthCalledWith(2, p.cota, 120);
    expect(p.onScrubEnd).toHaveBeenCalledWith(p.cota, 120);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('con Shift el paso es dx/10 y el valor se acota a [min, max]', () => {
    const p = monta({ zoom2D: 1 });
    const b = botonConCaptura();
    pointer(b, 'pointerdown', 0);
    pointer(b, 'pointermove', 50, { shiftKey: true });
    expect(p.onScrub).toHaveBeenLastCalledWith(p.cota, 105);
    pointer(b, 'pointermove', -5000);
    expect(p.onScrub).toHaveBeenLastCalledWith(p.cota, 1);
    pointer(b, 'pointerup', -5000);
  });
});
