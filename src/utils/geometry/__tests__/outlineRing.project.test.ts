/**
 * `projectToRing` — de un punto del plano a su distancia de arco en el anillo.
 *
 * Es la pieza que faltaba: el anillo sabe ir de distancia a punto (`pointAt`)
 * y de (comando, t) a distancia (`distanceAt`), pero un ancla guarda un
 * refPoint en COORDENADAS. Sin la proyección no hay forma de medir desde él.
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../types/types';
import { buildRing, pointAt, projectToRing } from '../outlineRing';
import { resolveNotchAnchor } from '../../notchAnchor';

// Una "pieza": tres lados rectos y un costado curvo. El vértice (100,0) es
// justo el inicio del comando C, así que su distancia de arco es exactamente
// la longitud del primer lado — un valor que se puede afirmar sin oráculo.
const pieza: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'C', values: [130, 60, 120, 140, 100, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
];

const ok = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('se esperaba ok:true');
  return r.value;
};

describe('projectToRing', () => {
  it('un vértice del contorno cae en su distancia de arco exacta', () => {
    const ring = ok(buildRing(pieza, 2));
    const r = projectToRing(ring, { x: 100, y: 0 });
    expect(r.distanceMm).toBe(100);
    expect(r.point.x).toBeCloseTo(100, 9);
    expect(r.point.y).toBeCloseTo(0, 9);
  });

  it('un punto a mitad de un lado recto cae a mitad de camino', () => {
    const ring = ok(buildRing(pieza, 2));
    expect(projectToRing(ring, { x: 40, y: 0 }).distanceMm).toBeCloseTo(40, 9);
  });

  it('un punto sobre la curva vuelve a sí mismo por pointAt (ida y vuelta)', () => {
    const ring = ok(buildRing(pieza, 2));
    // Un punto que sabemos que está en la curva: el que pointAt da a 180mm.
    const original = pointAt(ring, 180);
    const s = projectToRing(ring, original.point).distanceMm;
    expect(s).toBeCloseTo(180, 6);
    const vuelta = pointAt(ring, s);
    expect(vuelta.point.x).toBeCloseTo(original.point.x, 6);
    expect(vuelta.point.y).toBeCloseTo(original.point.y, 6);
  });

  it('un punto FUERA del contorno se proyecta al más cercano, no falla', () => {
    const ring = ok(buildRing(pieza, 2));
    // 30mm por debajo del lado inferior: su proyección es (40,0), a 40mm.
    const r = projectToRing(ring, { x: 40, y: -30 });
    expect(r.distanceMm).toBeCloseTo(40, 6);
    expect(r.point.y).toBeCloseTo(0, 6);
  });

  it('en v1 es EXACTA respecto del anillo viejo — el ancla vieja no se mueve', () => {
    // El contrato duro: proyectar el refPoint en v1 y avanzar la distancia
    // tiene que dar el MISMO punto, bit a bit, que resolveNotchAnchor. Si esto
    // se desvía, los piquetes guardados de María se mueven.
    const ring = ok(buildRing(pieza, 1));
    const s = projectToRing(ring, { x: 100, y: 0 }).distanceMm;
    const viejo = resolveNotchAnchor(pieza, {
      refPoint: { x: 100, y: 0 }, direction: 'cw', distanceMm: 100,
    });
    expect(viejo).not.toBeNull();
    const nuevo = pointAt(ring, s + 100);
    expect(nuevo.point.x).toBe(viejo!.point.x);
    expect(nuevo.point.y).toBe(viejo!.point.y);
  });
});
