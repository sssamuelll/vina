/**
 * placementContract — el traductor único hacia ArrangementBinding (consejo
 * 2026-07-03 §1): click del humano, tool del agente y heurísticas escriben
 * el MISMO esquema. Pines: proyección world→frame exacta (round-trip por
 * resolveArrangement), colocación en anchor (el frame aterriza en el
 * axisPoint del anillo vía el compose de D1), gate de namespace
 * (cross-region = null), grading-safety del binding producido.
 */
import { describe, it, expect } from 'vitest';
import { resolveArrangement, resolveArrangementWithFrames } from '../arrangementBinding';
import { anchorNamespaceFor, bindingForAnchor, worldDeltaToBinding } from '../placementContract';
import type { AnchorMap, AnchorRing } from '../anchorMap';
import type { BodyMeasurements, PatternPiece } from '../../../../types/types';

const MEAS_A = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } as BodyMeasurements;
const MEAS_B = { ...MEAS_A, chest: 104, hips: 112 } as BodyMeasurements;

function piece(id: string, name: string): PatternPiece {
  return {
    id, name, category: undefined as never, side: undefined as never,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] }, { type: 'L', values: [200, 300] }, { type: 'L', values: [0, 300] }, { type: 'Z', values: [] }],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as PatternPiece;
}

function ring(region: AnchorRing['region'], ringN: number, axisPoint: [number, number, number]): AnchorRing {
  const points = ['front', 'frontRight', 'right', 'backRight', 'back', 'backLeft', 'left', 'frontLeft'].map((bearing, k) => ({
    id: `${region}.ring${ringN}.${bearing}`, // state-encoded ID
    region, ring: ringN,
    position: [axisPoint[0] + 0.15 * Math.cos((k * Math.PI) / 4), axisPoint[1], axisPoint[2] + 0.15 * Math.sin((k * Math.PI) / 4)] as [number, number, number],
    outward: [Math.cos((k * Math.PI) / 4), 0, Math.sin((k * Math.PI) / 4)] as [number, number, number],
  }));
  return { region, ring: ringN, axisPoint, axis: [0, 1, 0], radius: 0.15, points };
}

function mapOf(...rings: AnchorRing[]): AnchorMap {
  return { rings, points: rings.flatMap((r) => r.points) };
}

describe('placementContract', () => {
  it('worldDeltaToBinding round-trips through resolveArrangement exactly', () => {
    const pieces = [piece('p1', 'Front')];
    const delta: [number, number, number] = [0.03, -0.05, 0.08];
    const binding = worldDeltaToBinding(pieces, 0, MEAS_A, delta);

    const [auto] = resolveArrangement(pieces, MEAS_A, undefined);
    const [resolved] = resolveArrangement(pieces, MEAS_A, { p1: binding });
    for (let k = 0; k < 3; k++) {
      expect(resolved.position[k] - auto.position[k]).toBeCloseTo(delta[k], 9);
    }
  });

  it('bindingForAnchor lands the wrap frame at the ring axisPoint (height re-target)', () => {
    const pieces = [piece('p1', 'Front')];
    const [base] = resolveArrangementWithFrames(pieces, MEAS_A, undefined);
    const waistRing = ring('front-torso', 1, [0, 0.924, 0]); // waistHeight de MEAS_A
    const map = mapOf(waistRing);

    const binding = bindingForAnchor(pieces, 0, MEAS_A, map, 'front-torso.ring1.back');
    expect(binding).not.toBeNull();
    expect(binding!.anchorId).toBe('front-torso.ring1.back');

    const [moved] = resolveArrangementWithFrames(pieces, MEAS_A, { p1: binding! });
    for (let k = 0; k < 3; k++) {
      expect(moved.frame.point[k]).toBeCloseTo(waistRing.axisPoint[k], 6);
    }
    // La base del wrap no rota (v1 = traslación): normal/tangent intactos.
    expect(moved.frame.normal).toEqual(base.frame.normal);
    expect(moved.frame.tangent).toEqual(base.frame.tangent);
  });

  it('rejects cross-namespace anchors (null, fuera del contrato v1)', () => {
    const pieces = [piece('p1', 'Front')]; // front-torso
    const armRing = ring('left-sleeve', 0, [-0.3, 1.3, 0]);
    const map = mapOf(armRing);
    expect(bindingForAnchor(pieces, 0, MEAS_A, map, 'left-sleeve.ring0.front')).toBeNull();
    expect(bindingForAnchor(pieces, 0, MEAS_A, map, 'no-existe')).toBeNull();
  });

  it('namespace mapping: front/back/waistband→front-torso, skirts→front-skirt, cuffs→sleeves, collar/hood→collar', () => {
    expect(anchorNamespaceFor('back-torso')).toBe('front-torso');
    expect(anchorNamespaceFor('waistband')).toBe('front-torso');
    expect(anchorNamespaceFor('back-skirt')).toBe('front-skirt');
    expect(anchorNamespaceFor('cuff-left')).toBe('left-sleeve');
    expect(anchorNamespaceFor('hood')).toBe('collar');
    expect(anchorNamespaceFor('unknown')).toBe('front-torso');
  });

  it('the produced binding is grading-safe: tracks the graded body, not a world point', () => {
    const pieces = [piece('p1', 'Front')];
    const waistRingA = ring('front-torso', 1, [0, 0.924, 0]);
    const binding = bindingForAnchor(pieces, 0, MEAS_A, mapOf(waistRingA), 'front-torso.ring1.front')!;

    const [autoA] = resolveArrangement(pieces, MEAS_A, undefined);
    const [a] = resolveArrangement(pieces, MEAS_A, { p1: binding });
    const [autoB] = resolveArrangement(pieces, MEAS_B, undefined);
    const [b] = resolveArrangement(pieces, MEAS_B, { p1: binding });

    // Mismo delta RELATIVO al frame en ambas tallas (el frame graduado se
    // mueve; el binding cabalga) — la definición operativa de grading-safe.
    for (let k = 0; k < 3; k++) {
      expect(b.position[k] - autoB.position[k]).toBeCloseTo(a.position[k] - autoA.position[k], 6);
    }
    // Y el mundo absoluto SÍ cambió con la talla (chest 88→104 mueve el frame +z).
    expect(b.position[2]).not.toBeCloseTo(a.position[2], 4);
  });
});
