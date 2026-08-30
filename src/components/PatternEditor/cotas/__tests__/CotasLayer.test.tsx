// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { CotasLayer, type CotasLayerHandle } from '../CotasLayer';
import { chipScreenPosition } from '../cotasGeometry';
import CotaLines from '../CotaLines';
import type { Cota } from '../cotas';

/**
 * Cotas vivas (spec 2026-08-30 § 5.1-5.2): la capa HTML de chips ancla con la
 * fórmula de FloatingActionBar (pan + patrón × zoom) y no recibe punteros; las
 * líneas de cota van en SVG dentro del grupo pan-zoom con grosor 1/zoom.
 */
afterEach(cleanup);

const cota = (over: Partial<Cota>): Cota => ({
  id: 'ancho', kind: 'ancho', label: 'Ancho de la pieza', valueMm: 200, unit: 'mm', min: 1, max: 3000, primary: true,
  a: { x: 10, y: 20 }, b: { x: 210, y: 20 }, outward: { x: 0, y: -1 }, apply: () => null, ...over,
});
const noop = { onCommit: vi.fn(), onScrubStart: vi.fn(), onScrub: vi.fn(), onScrubEnd: vi.fn() };

describe('chipScreenPosition', () => {
  it('punto medio del segmento en pantalla, desplazado 18 px hacia fuera', () => {
    expect(chipScreenPosition(cota({}), { x: 100, y: 50 }, 2)).toEqual({ left: 100 + 110 * 2, top: 50 + 20 * 2 - 18 });
  });
});

describe('CotasLayer', () => {
  it('la capa no recibe punteros y pinta un chip por cota, en orden', () => {
    const { container } = render(
      <CotasLayer
        cotas={[cota({}), cota({ id: 'alto', kind: 'alto', label: 'Alto de la pieza', valueMm: 300 })]}
        pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop}
      />,
    );
    const capa = container.querySelector('.cotas') as HTMLElement;
    expect(capa.style.pointerEvents).toBe('none');
    const botones = screen.getAllByRole('button');
    expect(botones.map(b => b.textContent)).toEqual(['200 mm', '300 mm']);
  });
  it('focusFirst enfoca el primer chip y devuelve true; sin cotas devuelve false', () => {
    const ref = createRef<CotasLayerHandle>();
    const r = render(<CotasLayer ref={ref} cotas={[cota({})]} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    expect(ref.current!.focusFirst()).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button'));
    r.rerender(<CotasLayer ref={ref} cotas={[]} pan2D={{ x: 0, y: 0 }} zoom2D={1} {...noop} />);
    expect(ref.current!.focusFirst()).toBe(false);
  });
  it('deshabilitada: focusFirst no enfoca chips apagados', () => {
    const ref = createRef<CotasLayerHandle>();
    render(<CotasLayer ref={ref} cotas={[cota({})]} pan2D={{ x: 0, y: 0 }} zoom2D={1} disabled {...noop} />);
    expect(ref.current!.focusFirst()).toBe(false);
  });
});

describe('CotaLines', () => {
  it('una línea por cota, desplazada 18/zoom hacia fuera, con ticks, sin punteros y con el token de tinta', () => {
    const { container } = render(<svg><CotaLines cotas={[cota({})]} zoom2D={2} /></svg>);
    const g = container.querySelector('g.cota-linea') as SVGGElement;
    expect(g.getAttribute('pointer-events')).toBe('none');
    const linea = g.querySelector('line.cota-linea__hilo')!;
    expect(linea.getAttribute('x1')).toBe('10');
    expect(linea.getAttribute('y1')).toBe('11');
    expect(linea.getAttribute('x2')).toBe('210');
    expect(linea.getAttribute('stroke')).toBe('var(--cota-line-2d)');
    expect(linea.getAttribute('stroke-width')).toBe('0.5');
    expect(g.querySelectorAll('line.cota-linea__tick')).toHaveLength(2);
  });
});
