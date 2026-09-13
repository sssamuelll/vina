// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { CotasLayer, type CotasLayerHandle } from '../CotasLayer';
import type { Cota } from '../cotas';

/**
 * Spec 2026-09-02 § 4.2 R2 y § 5.7: el chip de LECTURA no es un blanco —
 * un `<div aria-hidden>` sin punteros, nunca un `<button>` (Tab enfocaría
 * algo que muere en el próximo mousemove). Y `abrirPrimero()` abre la
 * edición del primer chip vivo: es lo que hace el clic en el borde.
 */
afterEach(cleanup);

const margen = (over: Partial<Cota> = {}): Cota => ({
  id: 'margen:p:p:top', kind: 'margen', label: 'Margen · top', valueMm: 10, unit: 'mm', min: 0, max: 100,
  primary: false, rotulo: 'de la pieza', scrub: false,
  a: { x: 100, y: 0 }, b: { x: 100, y: 0 }, outward: { x: 0, y: -1 }, apply: () => null, ...over,
});
const noop = { onCommit: vi.fn(), onScrubStart: vi.fn(), onScrub: vi.fn(), onScrubEnd: vi.fn(), onScrubCancel: vi.fn() };

describe('CotasLayer — lectura', () => {
  it('pinta la lectura como un div oculto a la a11y, sin punteros, con el rótulo y el peso de la cota', () => {
    const { container } = render(
      <CotasLayer cotas={[]} lectura={margen()} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />,
    );
    const lectura = container.querySelector('.cota--lectura') as HTMLElement;
    expect(lectura).not.toBeNull();
    expect(lectura.tagName).toBe('DIV');
    expect(lectura.getAttribute('aria-hidden')).toBe('true');
    expect(lectura.style.pointerEvents).toBe('none');
    expect(lectura.textContent).toBe('10 mm');
    expect(lectura.getAttribute('data-rotulo')).toBe('de la pieza');
    expect(lectura.classList.contains('cota--hueca')).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('se para donde chipScreenPosition dice: sobre el punto, 18 px hacia fuera', () => {
    const { container } = render(
      <CotasLayer cotas={[]} lectura={margen()} pan2D={{ x: 5, y: 7 }} zoom2D={2} {...noop} />,
    );
    const lectura = container.querySelector('.cota--lectura') as HTMLElement;
    expect(lectura.style.left).toBe(`${5 + 100 * 2}px`);
    expect(lectura.style.top).toBe(`${7 + 0 * 2 - 18}px`);
  });

  it('rellena y sin rótulo cuando la cota es propia del borde; apagada si la pieza está bloqueada', () => {
    const { container, rerender } = render(
      <CotasLayer cotas={[]} lectura={margen({ primary: true, rotulo: undefined })} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />,
    );
    const lectura = container.querySelector('.cota--lectura') as HTMLElement;
    expect(lectura.classList.contains('cota--hueca')).toBe(false);
    expect(lectura.hasAttribute('data-rotulo')).toBe(false);
    // El candado de la lectura es el suyo, no el del ancla (`disabled`).
    rerender(<CotasLayer cotas={[]} lectura={margen()} lecturaApagada pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    expect((container.querySelector('.cota--lectura') as HTMLElement).getAttribute('aria-disabled')).toBe('true');
    rerender(<CotasLayer cotas={[]} lectura={margen()} disabled pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    expect((container.querySelector('.cota--lectura') as HTMLElement).hasAttribute('aria-disabled')).toBe(false);
  });

  it('el rótulo va del lado de fuera: abajo cuando la normal apunta hacia abajo (borde inferior)', () => {
    const { container, rerender } = render(
      <CotasLayer cotas={[]} lectura={margen({ outward: { x: 0, y: 1 } })} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />,
    );
    expect((container.querySelector('.cota--lectura') as HTMLElement).getAttribute('data-lado')).toBe('abajo');
    rerender(<CotasLayer cotas={[]} lectura={margen()} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    expect((container.querySelector('.cota--lectura') as HTMLElement).hasAttribute('data-lado')).toBe(false);
  });

  it('pinta la referencia del ángulo: se mide con ella (separarChips) y hay que pintarla con ella también', () => {
    const { container } = render(
      <CotasLayer
        cotas={[]}
        lectura={margen({ unit: 'deg', valueMm: 90, referenceLabel: 'al borde' })}
        pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop}
      />,
    );
    const lectura = container.querySelector('.cota--lectura') as HTMLElement;
    expect(lectura.textContent).toBe('90° al borde');
  });

  it('sin lectura no pinta nada extra', () => {
    const { container } = render(<CotasLayer cotas={[]} lectura={null} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    expect(container.querySelector('.cota--lectura')).toBeNull();
  });
});

describe('CotasLayer — abrirPrimero', () => {
  it('abre la edición del primer chip vivo y devuelve true', () => {
    const ref = createRef<CotasLayerHandle>();
    render(<CotasLayer ref={ref} cotas={[margen()]} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    // `abrirPrimero` clica el botón: es un cambio de estado de React y va dentro de act.
    let abrio = false;
    act(() => { abrio = ref.current!.abrirPrimero(); });
    expect(abrio).toBe(true);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('10');
    expect(input.getAttribute('data-rotulo')).toBe('de la pieza');
  });

  it('sin chips, o con la capa apagada, devuelve false y no abre nada', () => {
    const ref = createRef<CotasLayerHandle>();
    const r = render(<CotasLayer ref={ref} cotas={[]} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    let abrio = true;
    act(() => { abrio = ref.current!.abrirPrimero(); });
    expect(abrio).toBe(false);
    r.rerender(<CotasLayer ref={ref} cotas={[margen()]} disabled pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    act(() => { abrio = ref.current!.abrirPrimero(); });
    expect(abrio).toBe(false);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
