/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import type { PatternPiece, Seam, Avatar, Fabric } from '../../types/types';
import type { CollisionBody } from '../../types/collisionBody';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePiece(id: string, overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id,
    name: `Piece ${id}`,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ],
    internals: [
      {
        id: `il-${id}`,
        type: 'grainline',
        path: [
          { type: 'M', values: [50, 10] },
          { type: 'L', values: [50, 140] },
        ],
      },
    ],
    position: { x: 100, y: 200 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    grainLine: {
      angle: 90,
      path: [
        { type: 'M', values: [50, 10] },
        { type: 'L', values: [50, 140] },
      ],
    },
    darts: [
      { id: `dart-${id}`, intake: 15, apex: { x: 50, y: 75 }, legs: [{ x: 42, y: 0 }, { x: 58, y: 0 }] },
    ],
    category: 'bodice',
    side: 'front',
    edges: [
      { id: `e1-${id}`, name: 'sideSeam', startIndex: 0, endIndex: 1, type: 'seam' },
      { id: `e2-${id}`, name: 'hemline', startIndex: 2, endIndex: 3, type: 'hem' },
    ],
    fabricId: 'default-cotton',
    constructionPieceId: `cp-${id}`,
    linkedPieceId: undefined,
    linkMode: undefined,
    zOrder: 0,
    layer: 1,
    sublayer: 0,
    bodyRegion: 'torso',
    locked: false,
    active: true,
    interfacingType: undefined,
    solidifyFactor: undefined,
    createdAt: 1711200000000,
    updatedAt: 1711200000000,
    ...overrides,
  } as any;
}

function makeAvatar(): Avatar {
  return {
    id: 'avatar-1',
    name: 'Test Avatar',
    modelUrl: '/models/avatar.glb',
    measurements: {
      height: 172,
      chest: 92,
      waist: 74,
      hips: 98,
      shoulder: 40,
      armLength: 58,
      inseam: 78,
    },
  };
}

function makeSeam(id: string): Seam {
  return {
    id,
    pieceA: { pieceId: 'p1', edgeName: 'sideSeam' },
    pieceB: { pieceId: 'p2', edgeName: 'sideSeam' },
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
  } as any;
}

function makeFabric(id: string): Fabric {
  return {
    id,
    name: `Fabric ${id}`,
    color: '#cccccc',
    weight: 200,
    stretch: 0.03,
    stiffness: 0.6,
    friction: 0.4,
  };
}

/**
 * Build a realistic ProjectState exercising every field that the undo
 * middleware snapshots via JSON.parse(JSON.stringify(state.project)).
 */
function buildRealisticProjectState() {
  return {
    id: 'proj-1',
    name: 'Test Garment',
    pieces: [makePiece('p1'), makePiece('p2', { mirrored: true, side: 'back' as const })],
    seams: [makeSeam('s1')],
    fabrics: [makeFabric('default-cotton'), makeFabric('silk-charmeuse')],
    avatar: makeAvatar(),
    avatarMode: 'model' as const,
    avatarModelUrl: '/avatares/mujer-eu38.glb',
    isDirty: true,
    groups: [{ id: 'g1', name: 'Front panels', pieceIds: ['p1'] }],
    seamGroups: [],
    arrangementOverrides: { p1: [0.1, 0, 0] as [number, number, number] },
    poms: [{ id: 'pom1', name: 'Chest Width', pieceId: 'p1', points: [{ x: 0, y: 50 }, { x: 100, y: 50 }], value: 100 }],
    layerNames: { 0: 'Lining', 1: 'Shell', 2: 'Trim' },
    layerLocked: { 0: true, 1: false },
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
  };
}

function makeCollisionBody(id: string): CollisionBody {
  return {
    id,
    name: `Body ${id}`,
    meshUrl: `/models/${id}.glb`,
    format: 'glb',
    transform: {
      position: [0, 0.9, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    collision: { enabled: true, friction: 0.3, offset: 0.005 },
    animation: { clipIndex: null, playing: false, time: 0, loop: true },
    visible: true,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Undo round-trip serialization', () => {
  it('JSON.parse(JSON.stringify()) preserves all project state fields', () => {
    const original = buildRealisticProjectState();
    const roundTripped = JSON.parse(JSON.stringify(original));

    expect(roundTripped).toEqual(original);
  });

  it('preserves PatternPiece data through round-trip (excluded path: project.pieces)', () => {
    const piece = makePiece('p1');
    const roundTripped = JSON.parse(JSON.stringify(piece));

    // Deep equality
    expect(roundTripped).toEqual(piece);

    // Spot-check nested structures survive
    expect(roundTripped.outline).toHaveLength(piece.outline.length);
    expect(roundTripped.internals[0].path).toEqual(piece.internals[0].path);
    expect(roundTripped.darts[0].apex).toEqual(piece.darts![0].apex);
    expect(roundTripped.edges[0].name).toBe('sideSeam');
    expect(roundTripped.grainLine.angle).toBe(90);
  });

  it('preserves Avatar data through round-trip (excluded path: project.avatar)', () => {
    const avatar = makeAvatar();
    const roundTripped = JSON.parse(JSON.stringify(avatar));

    expect(roundTripped).toEqual(avatar);
    expect(roundTripped.measurements.chest).toBe(92);
    expect(roundTripped.measurements.inseam).toBe(78);
  });

  it('round-trip produces an independent deep copy (mutations do not propagate)', () => {
    const original = buildRealisticProjectState();
    const snapshot = JSON.parse(JSON.stringify(original));

    // Mutate the snapshot — should NOT affect original
    snapshot.pieces[0].name = 'MUTATED';
    snapshot.avatar.measurements.chest = 999;
    snapshot.seams[0].tension = 0;

    expect(original.pieces[0].name).toBe('Piece p1');
    expect(original.avatar.measurements.chest).toBe(92);
    expect(original.seams[0].tension).toBe(100);
  });

  it('preserves CollisionBody data through round-trip (excluded path: collisionBody.bodies)', () => {
    const bodies = [makeCollisionBody('mannequin'), makeCollisionBody('table')];
    const roundTripped = JSON.parse(JSON.stringify(bodies));

    expect(roundTripped).toEqual(bodies);
    expect(roundTripped[0].transform.position).toEqual([0, 0.9, 0]);
    expect(roundTripped[1].collision.friction).toBe(0.3);
    expect(roundTripped[0].animation.clipIndex).toBeNull();
  });

  it('round-trip handles edge cases: empty arrays, optional undefined fields', () => {
    const minimal = {
      id: 'min',
      name: 'Minimal',
      pieces: [],
      seams: [],
      fabrics: [],
      avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} },
      avatarMode: 'model' as const,
      avatarModelUrl: null,
      isDirty: false,
      groups: [],
      seamGroups: [],
      arrangementOverrides: {},
      poms: [],
      layerNames: {},
      layerLocked: {},
      loadDiagnostics: [],
      loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    };

    const roundTripped = JSON.parse(JSON.stringify(minimal));
    expect(roundTripped).toEqual(minimal);
    expect(roundTripped.avatarModelUrl).toBeNull();
    expect(roundTripped.pieces).toEqual([]);
  });
});
