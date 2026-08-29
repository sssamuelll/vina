// @vitest-environment jsdom
/**
 * Overlay de "Línea interna" (spec 2026-08-29 § 4.7): pinta desde la MISMA
 * geometría que el motor, anuncia el enganche con un anillo, enseña el tipo
 * del nodo que va a caer, y lleva la píldora con largo y ángulo. Y ningún
 * color literal: el trinquete R3 cuenta literales en .tsx.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import PolyPenToolOverlay from '../overlays/PolyPenToolOverlay';
import { nodesToCommands, commandsToPathD, type PolyPenNode } from '../../polyPenGeometry';
import { formatDimension } from '../../../../utils/units';

afterEach(cleanup);

const P = (x: number, y: number) => ({ x, y });
const nodes: PolyPenNode[] = [{ point: P(0, 0), type: 'straight' }, { point: P(100, 0), type: 'curvePoints' }];

function draw(props: Partial<React.ComponentProps<typeof PolyPenToolOverlay>> = {}) {
  const all = {
    nodes: [], previewPoint: null, pressPoint: null, isDragging: false, dragHandle: null,
    hover: null, nodeType: 'straight' as const, closeArmed: false, zoom2D: 1, units: 'mm',
    ...props,
  };
  return render(<svg><PolyPenToolOverlay {...all} /></svg>);
}

describe('PolyPenToolOverlay', () => {
  it('sin nodos ni objetivo no pinta trazo, anillo ni píldora', () => {
    const { container } = draw();
    expect(container.querySelector('.il-trace')).toBeNull();
    expect(container.querySelector('.snap-ring')).toBeNull();
    expect(container.querySelector('.il-readout')).toBeNull();
  });

  it('pinta el trazo con la geometría compartida, la goma hasta el cursor y la píldora con largo y ángulo', () => {
    const { container } = draw({ nodes, previewPoint: P(110, -10) });
    const trace = container.querySelector('path.il-trace')!;
    expect(trace.getAttribute('d')).toBe(commandsToPathD(nodesToCommands(nodes, false)));
    const rubber = container.querySelector('line.il-rubber')!;
    expect(rubber.getAttribute('x2')).toBe('110');
    expect(rubber.getAttribute('y2')).toBe('-10');
    const readout = container.querySelector('.il-readout text')!.textContent!;
    expect(readout).toContain(formatDimension(Math.hypot(10, 10), 'mm'));
    // 0° a la derecha, 90° hacia arriba tal como se ve en pantalla
    expect(readout).toContain('45.0°');
  });

  it('con un objetivo de enganche la goma salta al objetivo y aparece el anillo', () => {
    const { container } = draw({
      nodes, previewPoint: P(110, -10),
      hover: { kind: 'vertex', pieceId: 'A', point: P(120, 0) },
    });
    const rubber = container.querySelector('line.il-rubber')!;
    expect(rubber.getAttribute('x2')).toBe('120');
    expect(rubber.getAttribute('y2')).toBe('0');
    const ring = container.querySelector('circle.snap-ring')!;
    expect(ring.getAttribute('cx')).toBe('120');
    expect(ring.getAttribute('cy')).toBe('0');
  });

  it('el fantasma del nodo lleva el tipo latcheado y su relleno', () => {
    const recta = draw({ nodes, previewPoint: P(110, -10), nodeType: 'straight' });
    const g1 = recta.container.querySelector('[data-node-type]')!;
    expect(g1.getAttribute('data-node-type')).toBe('straight');
    expect(g1.getAttribute('fill')).toBe('var(--piece-fill-2d)');
    cleanup();
    const curva = draw({ nodes, previewPoint: P(110, -10), nodeType: 'curvePoints' });
    const g2 = curva.container.querySelector('[data-node-type]')!;
    expect(g2.getAttribute('data-node-type')).toBe('curvePoints');
    expect(g2.getAttribute('fill')).toBe('var(--accent-2d)');
  });

  it('con el cierre armado el anillo va sobre el primer nodo', () => {
    const tres: PolyPenNode[] = [...nodes, { point: P(50, 50), type: 'straight' }];
    const { container } = draw({
      nodes: tres, previewPoint: P(2, 1), closeArmed: true,
      hover: { kind: 'firstNode', pieceId: 'A', point: P(0, 0) },
    });
    const ring = container.querySelector('circle.snap-ring')!;
    expect(ring.getAttribute('cx')).toBe('0');
    expect(ring.getAttribute('cy')).toBe('0');
  });

  it('mientras se arrastra un manejador, el ancla es el press y no el último nodo', () => {
    const { container } = draw({
      nodes, previewPoint: P(60, 30), pressPoint: P(50, 30), isDragging: true, dragHandle: P(60, 30),
    });
    const handle = container.querySelector('line.il-drag-handle')!;
    expect(handle.getAttribute('x1')).toBe('60');
    expect(handle.getAttribute('x2')).toBe('40');
  });

  it('ningún color literal: todo fill y stroke sale de un token', () => {
    const { container } = draw({
      nodes: [...nodes, { point: P(50, 50), type: 'bezier', handleIn: P(40, 40), handleOut: P(60, 60) }],
      previewPoint: P(110, -10), hover: { kind: 'outline', pieceId: 'A', point: P(120, 0) },
    });
    for (const el of Array.from(container.querySelectorAll('*'))) {
      for (const attr of ['fill', 'stroke']) {
        const v = el.getAttribute(attr);
        if (!v) continue;
        expect(v, `${el.tagName} ${attr}=${v}`).not.toMatch(/#|rgba?\(/);
      }
    }
  });
});
