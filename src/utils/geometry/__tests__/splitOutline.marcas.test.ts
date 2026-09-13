/**
 * Las tijeras y las marcas del comando (revisión 13-09, H5).
 *
 * `authoredAnchor` viaja con el comando que LLEGA al punto; `manualBezier`
 * con el tramo. Al cortar, la mitad que termina en el punto de corte es
 * geometría nueva (solo hereda la del tramo) y la que conserva el extremo
 * original hereda las dos — el mismo reparto que `splitSegmentAt`. Antes las
 * tijeras reconstruían la frontera con literales y un lado en Bézier libre
 * cortado volvía a ser spline gestionada.
 */
import { describe, expect, it } from 'vitest';
import type { PathCommand } from '../../../types/types';
import { splitOutlineAtPoints } from '../splitOutline';

const llegaA = (outline: PathCommand[], x: number, y: number) =>
  outline.find(c => c.type !== 'Z' && c.values.at(-2) === x && c.values.at(-1) === y);

describe('splitOutlineAtPoints — marcas del comando', () => {
  it('el extremo original conserva authoredAnchor; el punto de corte nace sin marca', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0], authoredAnchor: true },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ];
    const [a, b] = splitOutlineAtPoints(
      outline,
      { commandIndex: 1, t: 0.25, point: { x: 25, y: 0 } },
      { commandIndex: 3, t: 0.75, point: { x: 25, y: 100 } },
    );
    expect(llegaA(a, 100, 0)?.authoredAnchor, 'la mitad que conserva (100,0) pierde la marca').toBe(true);
    expect(llegaA(a, 25, 100)?.authoredAnchor, 'el punto de corte no lo insertó nadie').toBeUndefined();
    expect(llegaA(a, 25, 0)?.authoredAnchor).toBeUndefined();
    expect(b.some(c => c.authoredAnchor), 'la otra mitad no toca (100,0)').toBe(false);
  });

  it('un tramo en Bézier libre cortado sigue siendo Bézier libre en las dos mitades', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [30, -40, 70, -40, 100, 0], manualBezier: true },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ];
    const [a, b] = splitOutlineAtPoints(
      outline,
      { commandIndex: 1, t: 0.5, point: { x: 50, y: -30 } },
      { commandIndex: 3, t: 0.5, point: { x: 50, y: 100 } },
    );
    const curvaA = a.find(c => c.type === 'C');
    const curvaB = b.find(c => c.type === 'C');
    expect(curvaA?.manualBezier).toBe(true);
    expect(curvaB?.manualBezier).toBe(true);
    expect(a.filter(c => c.manualBezier)).toHaveLength(1);
    expect(b.filter(c => c.manualBezier)).toHaveLength(1);
  });

  it('dos cortes sobre el mismo comando: el trozo del medio hereda el tramo, no el ancla', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [30, -40, 70, -40, 100, 0], manualBezier: true, authoredAnchor: true },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
    ];
    const [a] = splitOutlineAtPoints(
      outline,
      { commandIndex: 1, t: 0.25, point: { x: 25, y: -22.5 } },
      { commandIndex: 1, t: 0.75, point: { x: 75, y: -22.5 } },
    );
    const medio = a.find(c => c.type === 'C');
    expect(medio?.manualBezier).toBe(true);
    expect(medio?.authoredAnchor, 'ninguno de sus extremos es el original').toBeUndefined();
  });
});
