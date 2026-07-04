/**
 * Fix del drag no-op (consejo 2026-07-03, dictamen Halberg §4): post
 * envelope-wrap el solver siembra vía `wrapPlacedMesh(frame, …)` y
 * `placement.position` no se componía nunca — el drag del usuario y el
 * binding frame-delta eran no-ops silenciosos en el path del wrap. El fix
 * compone el DELTA del override (resolved − auto) como traslación rígida del
 * frame. También pinea el region-lock del branch Phase-2 (el binding usa las
 * regiones deterministas de placeGarmentPieces, no un detectBodyRegion
 * fresco cuyo toggle L/R diverge).
 */
import { describe, it, expect } from 'vitest';
import {
  resolveArrangement,
  resolveArrangementWithFrames,
  type ArrangementBinding,
} from '../arrangementBinding';
import { wrapPanel } from '../wrapPanel';
import { computeAutoFrame, computeEffectiveRegions } from '../../garmentPlacement';
import type { BodyMeasurements, PatternPiece } from '../../../../types/types';

const MEAS = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } as BodyMeasurements;

function piece(id: string, name: string): PatternPiece {
  return {
    id, name, category: undefined as never, side: undefined as never,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 300] }, { type: 'L', values: [0, 300] }, { type: 'Z', values: [] }],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as PatternPiece;
}

describe('override → wrap frame composition (drag no-op fix)', () => {
  it('a legacy [x,y,z] override shifts the wrap frame by exactly (override − auto)', () => {
    const front = piece('p1', 'Front');
    const [autoP] = resolveArrangement([front], MEAS, undefined);
    const ov: [number, number, number] = [autoP.position[0] + 0.07, autoP.position[1] - 0.03, autoP.position[2] + 0.11];

    const [base] = resolveArrangementWithFrames([front], MEAS, undefined);
    const [moved] = resolveArrangementWithFrames([front], MEAS, { p1: ov });

    expect(moved.frame.point[0] - base.frame.point[0]).toBeCloseTo(0.07, 9);
    expect(moved.frame.point[1] - base.frame.point[1]).toBeCloseTo(-0.03, 9);
    expect(moved.frame.point[2] - base.frame.point[2]).toBeCloseTo(0.11, 9);
    // Solo traslación: la base del wrap (normal/tangent/axis/radius) intacta.
    expect(moved.frame.normal).toEqual(base.frame.normal);
    expect(moved.frame.tangent).toEqual(base.frame.tangent);
    expect(moved.frame.radius).toBe(base.frame.radius);

    // Y los vértices WRAPPED se trasladan rígido por el mismo delta.
    const lv: [number, number, number] = [0.05, 0, 0.12];
    const a = wrapPanel(lv, base.frame, base.wrapParams);
    const b = wrapPanel(lv, moved.frame, moved.wrapParams);
    expect(b[0] - a[0]).toBeCloseTo(0.07, 9);
    expect(b[1] - a[1]).toBeCloseTo(-0.03, 9);
    expect(b[2] - a[2]).toBeCloseTo(0.11, 9);
  });

  it('a frame-delta binding shifts the wrap frame by its resolved world delta (grading-safe path)', () => {
    const front = piece('p1', 'Front');
    const binding: ArrangementBinding = { space: 'frame', posDelta: [0.04, 0.02, -0.06], rotDelta: [0, 0, 0, 1] };

    const [autoP] = resolveArrangement([front], MEAS, undefined);
    const [resolved] = resolveArrangement([front], MEAS, { p1: binding });
    const [base] = resolveArrangementWithFrames([front], MEAS, undefined);
    const [moved] = resolveArrangementWithFrames([front], MEAS, { p1: binding });

    for (let k = 0; k < 3; k++) {
      const worldDelta = resolved.position[k] - autoP.position[k];
      expect(moved.frame.point[k] - base.frame.point[k]).toBeCloseTo(worldDelta, 9);
    }
  });

  it('no override → frames bit-identical (cero regresión del camino auto)', () => {
    const pieces = [piece('p1', 'Front'), piece('p2', 'Back'), piece('p3', 'Sleeve')];
    const a = resolveArrangementWithFrames(pieces, MEAS, undefined);
    const b = resolveArrangementWithFrames(pieces, MEAS, {});
    for (let i = 0; i < pieces.length; i++) {
      expect(b[i].frame.point).toEqual(a[i].frame.point);
      expect(b[i].frame.normal).toEqual(a[i].frame.normal);
      expect(b[i].flip).toBe(a[i].flip);
      expect(b[i].wrapParams).toEqual(a[i].wrapParams);
    }
  });

  it('region lock: a binding on the SECOND side-less sleeve uses the region placeGarmentPieces assigned', () => {
    // Dos mangas sin side: placeGarmentPieces asigna L/R vía toggle
    // determinista. El branch de binding debe usar ESA asignación — el bug
    // latente (detectBodyRegion fresco) re-toggleaba y podía mapear el
    // posDelta en el frame del brazo OPUESTO (tangente ±x invertida).
    const pieces = [piece('s1', 'Sleeve'), piece('s2', 'Sleeve')];
    const effRegions = computeEffectiveRegions(pieces);
    expect(new Set(effRegions).size).toBe(2); // se repartieron en brazos distintos

    const binding: ArrangementBinding = { space: 'frame', posDelta: [0, 0, 0.1], rotDelta: [0, 0, 0, 1] };
    const autos = resolveArrangement(pieces, MEAS, undefined);
    const resolved = resolveArrangement(pieces, MEAS, { s2: binding });

    // Esperado con la región EFECTIVA de s2 (la que asignó placeGarmentPieces).
    const { frame } = computeAutoFrame(effRegions[1], MEAS, { widthMm: 200, heightMm: 300 });
    const t = frame.tangent;
    const b = [
      frame.normal[1] * t[2] - frame.normal[2] * t[1],
      frame.normal[2] * t[0] - frame.normal[0] * t[2],
      frame.normal[0] * t[1] - frame.normal[1] * t[0],
    ];
    void b; // basis sanity only; the delta below is tangent-dominated
    for (let k = 0; k < 3; k++) {
      const expected = autos[1].position[k] + t[k] * 0.1;
      expect(resolved[1].position[k]).toBeCloseTo(expected, 6);
    }
  });
});
