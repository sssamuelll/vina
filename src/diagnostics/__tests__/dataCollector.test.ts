import { describe, it, expect } from 'vitest';
import { collectInspectionData } from '../dataCollector';
import type { InspectionTarget } from '../types';
import type { RootState } from '../../store';

// ─── Mock state factory ──────────────────────────────────────────────────────

function makePiece(overrides: Partial<{
  id: string;
  name: string;
  position: { x: number; y: number };
  rotation: number;
  seamAllowance: number;
  fabricId: string;
  edges: Array<{ id: string; name: string; edgeType: string; length?: number }>;
  internals: Array<{ id: string; type: string; path: unknown[] }>;
}> = {}) {
  return {
    id: 'piece-1',
    name: 'Front Bodice',
    position: { x: 10, y: 20 },
    rotation: 45,
    seamAllowance: 10,
    fabricId: 'cotton-poplin',
    outline: [],
    edges: [],
    internals: [],
    mirrored: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeState(overrides: {
  pieces?: ReturnType<typeof makePiece>[];
  seams?: unknown[];
  constructionPoints?: Array<{ id: string; label: string; x: number; y: number; definition: { type: 'manual'; x: number; y: number }; visible: boolean }>;
  particleCount?: number;
} = {}): RootState {
  const {
    pieces = [makePiece()],
    seams = [],
    constructionPoints = [],
    particleCount = 0,
  } = overrides;

  return {
    project: {
      id: 'proj-1',
      name: 'Test Project',
      pieces,
      seams,
      fabrics: [],
      avatar: {} as never,
      avatarMode: 'model',
      avatarModelUrl: null,
      isDirty: false,
      groups: [],
      arrangementOverrides: {},
    },
    construction: {
      points: constructionPoints,
      lines: [],
      curves: [],
      pieces: [],
      variables: {},
      selectedEntity: null,
      showConstruction: true,
      pieceIdentityMap: {},
    },
    simulation: {
      particleCount,
      simulationState: 'idle',
      pieceFabrics: {},
      defaultFabricId: '',
      particleDistance: 10,
      pieceParticleDistance: {},
      fitMapMode: 'off',
      fitMapConfig: {} as never,
      simulationMode: 'normal',
      solverTier: 'none',
      frameTimeMs: 0,
      bodyCollision: false,
      viewMode3D: 'arrange',
      arrangementSnapshot: null,
      pinnedVertices: {},
      selectedPinId: null,
      showGarment: true,
      showSeamlines3D: false,
      showInternalLines3D: false,
      surfaceMode3D: 'textured',
      snapshots: [],
      activeSnapshotId: null,
      isWarmStarting: false,
      windForce: [0, 0, 0],
      windEnabled: false,
      dragCoefficient: 1,
      frozenPieceIds: [],
      fitMapStats: null,
      pieceTints: {},
      pieceTextureOverrides: {},
      pieceUVTransforms: {},
      pieceOpacity: {},
      pieceEmission: {},
      pieceEmissionIntensity: {},
      steamBrush: { active: false, radius: 0, strength: 0 },
    },
    // cast rest as never — the data collector only reads the three slices above
  } as unknown as RootState;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('collectInspectionData', () => {
  const baseTarget: InspectionTarget = {
    type: 'piece',
    pieceId: 'piece-1',
  };

  it('returns basic piece metadata', () => {
    const state = makeState();
    const result = collectInspectionData(baseTarget, state);

    expect(result.target).toEqual(baseTarget);
    expect(result.piece.id).toBe('piece-1');
    expect(result.piece.name).toBe('Front Bodice');
    expect(result.piece.position).toEqual({ x: 10, y: 20 });
    expect(result.piece.rotation).toBe(45);
    expect(result.piece.seamAllowance).toBe(10);
    expect(typeof result.timestamp).toBe('number');
  });

  it('includes fabric properties when fabricId is known', () => {
    const state = makeState();
    const result = collectInspectionData(baseTarget, state);

    expect(result.fabric).toBeDefined();
    expect(result.fabric?.id).toBe('cotton-poplin');
    expect(result.fabric?.name).toBe('Cotton Poplin');
  });

  it('fabric is undefined when fabricId is not in library', () => {
    const state = makeState({
      pieces: [makePiece({ fabricId: 'unknown-fabric-xyz' })],
    });
    const result = collectInspectionData(baseTarget, state);

    expect(result.fabric).toBeUndefined();
  });

  it('fabric is undefined when piece has no fabricId', () => {
    const state = makeState({
      pieces: [makePiece({ fabricId: undefined })],
    });
    const result = collectInspectionData(baseTarget, state);

    expect(result.fabric).toBeUndefined();
  });

  it('includes edge data when target has edgeName', () => {
    const piece = makePiece({
      edges: [
        { id: 'edge-1', name: 'armhole', edgeType: 'seam', length: 350 },
        { id: 'edge-2', name: 'shoulder', edgeType: 'seam', length: 140 },
      ],
    });
    const state = makeState({ pieces: [piece] });

    const target: InspectionTarget = { type: 'edge', pieceId: 'piece-1', edgeName: 'armhole' };
    const result = collectInspectionData(target, state);

    expect(result.edge).toBeDefined();
    expect(result.edge?.name).toBe('armhole');
    expect(result.edge?.type).toBe('seam');
    expect(result.edge?.length).toBe(350);
  });

  it('edge is undefined when edgeName does not match any edge', () => {
    const piece = makePiece({
      edges: [{ id: 'edge-1', name: 'armhole', edgeType: 'seam', length: 350 }],
    });
    const state = makeState({ pieces: [piece] });

    const target: InspectionTarget = { type: 'edge', pieceId: 'piece-1', edgeName: 'neckline' };
    const result = collectInspectionData(target, state);

    expect(result.edge).toBeUndefined();
  });

  it('edge is undefined when target has no edgeName', () => {
    const state = makeState();
    const result = collectInspectionData(baseTarget, state);

    expect(result.edge).toBeUndefined();
  });

  it('collects seam connections where piece is pieceA', () => {
    const seams = [
      {
        id: 'seam-1',
        pieceA: { pieceId: 'piece-1', edgeName: 'armhole' },
        pieceB: { pieceId: 'piece-2', edgeName: 'sleeve-cap' },
        type: 'standard',
      },
      {
        id: 'seam-2',
        pieceA: { pieceId: 'piece-3', edgeName: 'side' },
        pieceB: { pieceId: 'piece-4', edgeName: 'side' },
        type: 'overlock',
      },
    ];
    const pieces = [
      makePiece({ id: 'piece-1', name: 'Front Bodice' }),
      makePiece({ id: 'piece-2', name: 'Sleeve' }),
    ];
    const state = makeState({ pieces, seams });
    const result = collectInspectionData(baseTarget, state);

    expect(result.seams).toHaveLength(1);
    expect(result.seams[0].id).toBe('seam-1');
    expect(result.seams[0].partnerPieceId).toBe('piece-2');
    expect(result.seams[0].partnerPieceName).toBe('Sleeve');
    expect(result.seams[0].edgeName).toBe('armhole');
    expect(result.seams[0].type).toBe('standard');
  });

  it('collects seam connections where piece is pieceB', () => {
    const seams = [
      {
        id: 'seam-10',
        pieceA: { pieceId: 'piece-99', edgeName: 'side-back' },
        pieceB: { pieceId: 'piece-1', edgeName: 'side-front' },
        type: 'french',
      },
    ];
    const pieces = [
      makePiece({ id: 'piece-1', name: 'Front Bodice' }),
      makePiece({ id: 'piece-99', name: 'Back Bodice' }),
    ];
    const state = makeState({ pieces, seams });
    const result = collectInspectionData(baseTarget, state);

    expect(result.seams).toHaveLength(1);
    expect(result.seams[0].id).toBe('seam-10');
    expect(result.seams[0].partnerPieceId).toBe('piece-99');
    expect(result.seams[0].partnerPieceName).toBe('Back Bodice');
    expect(result.seams[0].edgeName).toBe('side-front');
    expect(result.seams[0].type).toBe('french');
  });

  it('returns empty seams array when no seams match', () => {
    const state = makeState({ seams: [] });
    const result = collectInspectionData(baseTarget, state);

    expect(result.seams).toEqual([]);
  });

  it('groups internals by type and counts them', () => {
    const piece = makePiece({
      internals: [
        { id: 'i-1', type: 'grainline', path: [] },
        { id: 'i-2', type: 'notch', path: [] },
        { id: 'i-3', type: 'notch', path: [] },
        { id: 'i-4', type: 'dart', path: [] },
        { id: 'i-5', type: 'dart', path: [] },
        { id: 'i-6', type: 'dart', path: [] },
      ],
    });
    const state = makeState({ pieces: [piece] });
    const result = collectInspectionData(baseTarget, state);

    // Sort for deterministic comparison
    const sorted = [...result.internals].sort((a, b) => a.type.localeCompare(b.type));
    expect(sorted).toEqual([
      { type: 'dart', count: 3 },
      { type: 'grainline', count: 1 },
      { type: 'notch', count: 2 },
    ]);
  });

  it('returns empty internals array when piece has no internals', () => {
    const state = makeState();
    const result = collectInspectionData(baseTarget, state);

    expect(result.internals).toEqual([]);
  });

  it('includes simulation particleCount', () => {
    const state = makeState({ particleCount: 4096 });
    const result = collectInspectionData(baseTarget, state);

    expect(result.simulation?.particleCount).toBe(4096);
  });

  it('includes construction point when constructionPointId is set', () => {
    const constructionPoints = [
      {
        id: 'cp-1',
        label: 'neckPoint',
        x: 100,
        y: 200,
        definition: { type: 'manual' as const, x: 100, y: 200 },
        visible: true,
      },
    ];
    const state = makeState({ constructionPoints });
    const target: InspectionTarget = {
      type: 'point',
      pieceId: 'piece-1',
      constructionPointId: 'cp-1',
    };
    const result = collectInspectionData(target, state);

    expect(result.constructionPoint).toBeDefined();
    expect(result.constructionPoint?.label).toBe('neckPoint');
    expect(result.constructionPoint?.x).toBe(100);
    expect(result.constructionPoint?.y).toBe(200);
    expect(result.constructionPoint?.definitionType).toBe('manual');
  });

  it('constructionPoint is undefined when constructionPointId not found', () => {
    const state = makeState({ constructionPoints: [] });
    const target: InspectionTarget = {
      type: 'point',
      pieceId: 'piece-1',
      constructionPointId: 'does-not-exist',
    };
    const result = collectInspectionData(target, state);

    expect(result.constructionPoint).toBeUndefined();
  });

  it('constructionPoint is undefined when no constructionPointId in target', () => {
    const state = makeState();
    const result = collectInspectionData(baseTarget, state);

    expect(result.constructionPoint).toBeUndefined();
  });

  it('returns fallback InspectionData when piece is not found', () => {
    const state = makeState({ pieces: [] });
    const result = collectInspectionData(baseTarget, state);

    expect(result.piece.name).toBe('Unknown');
    expect(result.piece.id).toBe('piece-1');
    expect(result.fabric).toBeUndefined();
    expect(result.edge).toBeUndefined();
    expect(result.seams).toEqual([]);
    expect(result.internals).toEqual([]);
    expect(result.constructionPoint).toBeUndefined();
  });
});
