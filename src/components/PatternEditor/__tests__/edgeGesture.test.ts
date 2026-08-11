import { describe, it, expect } from 'vitest';
import { resolveEdgeCommit, type EdgeTarget } from '../edgeGesture';

const press = (t: number): EdgeTarget => ({
  pieceId: 'p1',
  edgeIndex: 1,
  edgeRange: [1, 2],
  t,
  point: { x: 0, y: 0 },
});

describe('resolveEdgeCommit', () => {
  it('bajo umbral es CLIC, aunque el t haya cambiado', () => {
    const c = resolveEdgeCommit(press(0.3), 0.9, 2, 2);
    expect(c.kind).toBe('click');
  });

  it('sobre umbral con recorrido real de t es ARRASTRE', () => {
    const c = resolveEdgeCommit(press(0.2), 0.7, 40, 0);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[0]).toBeCloseTo(0.2, 5);
    expect(c.range[1]).toBeCloseTo(0.7, 5);
  });

  it('ordena el rango cuando arrastra hacia atrás', () => {
    const c = resolveEdgeCommit(press(0.8), 0.3, 0, 40);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[0]).toBeCloseTo(0.3, 5);
    expect(c.range[1]).toBeCloseTo(0.8, 5);
  });

  it('cruzó el umbral en pantalla pero el t colapsó: cae a CLIC, no al vacío', () => {
    // arrastró perpendicular al borde — 40px de recorrido, cero avance de t
    const c = resolveEdgeCommit(press(0.5), 0.505, 0, 40);
    expect(c.kind).toBe('click');
  });

  it('soltar fuera del borde (releaseT null) es CLIC', () => {
    const c = resolveEdgeCommit(press(0.5), null, 40, 40);
    expect(c.kind).toBe('click');
  });

  it('colapsa el arranque al extremo: t < 0.01 pasa a 0', () => {
    const c = resolveEdgeCommit(press(0.004), 0.6, 40, 0);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[0]).toBe(0);
  });

  it('colapsa el final al extremo: t > 0.99 pasa a 1', () => {
    const c = resolveEdgeCommit(press(0.4), 0.997, 40, 0);
    expect(c.kind).toBe('drag');
    if (c.kind !== 'drag') throw new Error('unreachable');
    expect(c.range[1]).toBe(1);
  });

  it('el objetivo del commit es SIEMPRE el del press', () => {
    const p = press(0.1);
    const c = resolveEdgeCommit(p, 0.9, 40, 0);
    expect(c.target).toBe(p);
  });
});
