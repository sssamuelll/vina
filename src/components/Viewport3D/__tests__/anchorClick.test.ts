/**
 * anchorClick — el handler puro del click humano en el placement contract
 * (click pieza → click anchor → binding). Pines: guardas de selección
 * (0/2/stale → no-selection), gate de namespace (cross → mensaje con el
 * namespace de la PIEZA), y que el binding despachado es EXACTAMENTE el de
 * bindingForAnchor con los opts espejo de GarmentSimulation.
 */
import { describe, it, expect } from 'vitest';
import { resolveAnchorClick, selectionNamespace } from '../anchorClick';
import { bindingForAnchor } from '../../../utils/cloth/arrangement/placementContract';
import type { AnchorMap, AnchorRing } from '../../../utils/cloth/arrangement/anchorMap';
import type { ArmAxis } from '../../../utils/cloth/arrangement/buildAxisHints';
import type { BodyMeasurements, PatternPiece } from '../../../types/types';

const MEAS = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } as BodyMeasurements;
const ARM_AXIS: ArmAxis = { left: null, right: null, ready: false };

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

const waistRing = ring('front-torso', 1, [0, 0.924, 0]);
const armRing = ring('left-sleeve', 0, [-0.3, 1.3, 0]);
const MAP: AnchorMap = { rings: [waistRing, armRing], points: [...waistRing.points, ...armRing.points] };

const args = (over: Partial<Parameters<typeof resolveAnchorClick>[0]> = {}) => {
  const pieces = [piece('p1', 'Front')];
  return {
    pieces,
    activePieces: pieces,
    selectedPieceIds: ['p1'],
    measurements: MEAS,
    map: MAP,
    anchorId: 'front-torso.ring1.front',
    armAxis: ARM_AXIS,
    ...over,
  };
};

describe('resolveAnchorClick', () => {
  it('no piece selected → no-selection (toast suave, no binding)', () => {
    expect(resolveAnchorClick(args({ selectedPieceIds: [] }))).toEqual({ kind: 'no-selection' });
  });

  it('multi-selection is not a contract writer → no-selection', () => {
    const pieces = [piece('p1', 'Front'), piece('p2', 'Back')];
    expect(resolveAnchorClick(args({ pieces, activePieces: pieces, selectedPieceIds: ['p1', 'p2'] })))
      .toEqual({ kind: 'no-selection' });
  });

  it('stale selection (id not in pieces) → no-selection', () => {
    expect(resolveAnchorClick(args({ selectedPieceIds: ['gone'] }))).toEqual({ kind: 'no-selection' });
  });

  it('no registered map → no-map (defensive; a rendered point implies a map)', () => {
    expect(resolveAnchorClick(args({ map: null }))).toEqual({ kind: 'no-map' });
  });

  it('cross-namespace anchor → the PIECE namespace (for the toast copy)', () => {
    const result = resolveAnchorClick(args({ anchorId: 'left-sleeve.ring0.front' }));
    expect(result).toEqual({ kind: 'cross-namespace', namespace: 'front-torso' });
  });

  it('same-namespace anchor → bound, con el binding espejo de bindingForAnchor', () => {
    const a = args();
    const result = resolveAnchorClick(a);
    expect(result.kind).toBe('bound');
    if (result.kind !== 'bound') return;
    expect(result.pieceId).toBe('p1');
    expect(result.binding.anchorId).toBe('front-torso.ring1.front');
    // Espejo exacto: mismos opts que GarmentSimulation (skeletonReady + axisHints).
    const direct = bindingForAnchor(a.pieces, 0, MEAS, MAP, a.anchorId, {
      skeletonReady: ARM_AXIS.ready,
      axisHints: {},
    });
    expect(result.binding).toEqual(direct);
  });

  it('indexes over the FULL pieces array (selected piece not at index 0)', () => {
    const pieces = [piece('p0', 'Back'), piece('p1', 'Front')];
    const result = resolveAnchorClick(args({ pieces, activePieces: pieces, selectedPieceIds: ['p1'] }));
    expect(result.kind).toBe('bound');
    if (result.kind === 'bound') expect(result.pieceId).toBe('p1');
  });
});

describe('selectionNamespace', () => {
  it('exactly one selected torso piece → front-torso', () => {
    expect(selectionNamespace([piece('p1', 'Front')], ['p1'])).toBe('front-torso');
  });

  it('zero, multi or stale selection → null (no highlight)', () => {
    const pieces = [piece('p1', 'Front'), piece('p2', 'Back')];
    expect(selectionNamespace(pieces, [])).toBeNull();
    expect(selectionNamespace(pieces, ['p1', 'p2'])).toBeNull();
    expect(selectionNamespace(pieces, ['gone'])).toBeNull();
  });
});
