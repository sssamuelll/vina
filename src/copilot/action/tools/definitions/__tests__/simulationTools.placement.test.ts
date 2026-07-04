/**
 * place_piece / list_anchor_points / reset3DArrangement — el agente como
 * escritor de primera clase del contrato de colocación (consejo 2026-07-03
 * §1/§6). Pines: éxito despacha setArrangementBinding con anchorId (y el
 * binding round-tripea al axisPoint del anillo), cross-namespace = error
 * discoverable con la lista de anchors válidos, resolución por nombre
 * case-insensitive, rollback con el guard V3/binding/undefined, y reset =
 * LIMPIAR el override (clearArrangementOverride), no [0,0,0] world.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';
import projectReducer, {
  setArrangement3D,
  setArrangementBinding,
  clearArrangementOverride,
  clearArrangementOverrides,
} from '../../../../../store/projectSlice';
import { registerAnchorMap } from '../../../../../utils/cloth/arrangement/anchorMap';
import type { AnchorMap, AnchorRing } from '../../../../../utils/cloth/arrangement/anchorMap';
import { resolveArrangementWithFrames } from '../../../../../utils/cloth/arrangement/arrangementBinding';
import type { ArrangementBinding, ArrangementOverride } from '../../../../../utils/cloth/arrangement/arrangementBinding';
import type { BodyMeasurements, PatternPiece } from '../../../../../types/types';
import { tools } from '../../definitions/simulationTools';

const MEAS = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } as BodyMeasurements;

// Mismos fixtures que placementContract.test.ts (rect 200×300 "Front" → front-torso).
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

const WAIST_RING = ring('front-torso', 1, [0, 0.924, 0]);

function mockState(overrides?: {
  pieces?: PatternPiece[];
  arrangementOverrides?: Record<string, ArrangementOverride>;
  hiddenPieceIds?: string[];
}): () => RootState {
  return () => ({
    project: {
      pieces: overrides?.pieces ?? [piece('p1', 'Front')],
      avatar: { measurements: MEAS },
      arrangementOverrides: overrides?.arrangementOverrides ?? {},
    },
    simulation: {
      armAxis: { left: null, right: null, ready: false },
      hiddenPieceIds: overrides?.hiddenPieceIds ?? [],
      hiddenLayerIds: [],
    },
  }) as unknown as RootState;
}

function tool(name: string) {
  const t = tools.find(t => t.name === name);
  expect(t, `tool ${name} registered`).toBeDefined();
  return t!;
}

function dispatchedActions(mockDispatch: AppDispatch): Array<{ type: string; payload?: unknown }> {
  return (mockDispatch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
}

beforeEach(() => {
  registerAnchorMap(null); // singleton de módulo — cada test parte limpio
});

describe('place_piece', () => {
  it('dispatches setArrangementBinding with the anchorId (grading-safe writer)', async () => {
    registerAnchorMap(mapOf(WAIST_RING));
    const mockDispatch = vi.fn() as unknown as AppDispatch;

    const result = await tool('place_piece').execute(
      { pieceId: 'p1', anchorId: 'front-torso.ring1.front' },
      mockDispatch, mockState(),
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ pieceId: 'p1', anchorId: 'front-torso.ring1.front', namespace: 'front-torso' });
    const actions = dispatchedActions(mockDispatch);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe(setArrangementBinding.type);
    const { binding } = actions[0].payload as { pieceId: string; binding: ArrangementBinding };
    expect(binding.space).toBe('frame');
    expect(binding.anchorId).toBe('front-torso.ring1.front');
  });

  it('the dispatched binding round-trips through resolveArrangement to the ring axisPoint', async () => {
    registerAnchorMap(mapOf(WAIST_RING));
    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const pieces = [piece('p1', 'Front')];

    await tool('place_piece').execute(
      { pieceId: 'p1', anchorId: 'front-torso.ring1.back' },
      mockDispatch, mockState({ pieces }),
    );

    const { binding } = dispatchedActions(mockDispatch)[0].payload as { binding: ArrangementBinding };
    const [moved] = resolveArrangementWithFrames(pieces, MEAS, { p1: binding }, { skeletonReady: false, axisHints: {} });
    for (let k = 0; k < 3; k++) {
      expect(moved.frame.point[k]).toBeCloseTo(WAIST_RING.axisPoint[k], 6);
    }
  });

  it('cross-namespace anchor → discoverable error listing the valid anchors', async () => {
    registerAnchorMap(mapOf(WAIST_RING, ring('left-sleeve', 0, [-0.3, 1.3, 0])));
    const mockDispatch = vi.fn() as unknown as AppDispatch;

    const result = await tool('place_piece').execute(
      { pieceId: 'p1', anchorId: 'left-sleeve.ring0.front' },
      mockDispatch, mockState(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('"front-torso"'); // el namespace de la pieza
    expect(result.error).toContain('front-torso.ring1.front'); // anchors válidos, autocorrección
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('resolves the piece by name, case-insensitive', async () => {
    registerAnchorMap(mapOf(WAIST_RING));
    const mockDispatch = vi.fn() as unknown as AppDispatch;

    const result = await tool('place_piece').execute(
      { pieceName: 'fRoNt', anchorId: 'front-torso.ring1.front' },
      mockDispatch, mockState(),
    );

    expect(result.success).toBe(true);
    expect((result.data as { pieceId: string }).pieceId).toBe('p1');
  });

  it('rollback restores a previous V3 legacy override via setArrangement3D', async () => {
    registerAnchorMap(mapOf(WAIST_RING));
    const mockDispatch = vi.fn() as unknown as AppDispatch;

    const result = await tool('place_piece').execute(
      { pieceId: 'p1', anchorId: 'front-torso.ring1.front' },
      mockDispatch, mockState({ arrangementOverrides: { p1: [1, 2, 3] } }),
    );

    (mockDispatch as unknown as ReturnType<typeof vi.fn>).mockClear();
    result.rollback!();
    const actions = dispatchedActions(mockDispatch);
    expect(actions[0].type).toBe(setArrangement3D.type);
    expect(actions[0].payload).toEqual({ pieceId: 'p1', position: [1, 2, 3] });
  });

  it('rollback restores a previous binding via setArrangementBinding', async () => {
    registerAnchorMap(mapOf(WAIST_RING));
    const prev: ArrangementBinding = { space: 'frame', posDelta: [0, 0, 0.01], rotDelta: [0, 0, 0, 1] };
    const mockDispatch = vi.fn() as unknown as AppDispatch;

    const result = await tool('place_piece').execute(
      { pieceId: 'p1', anchorId: 'front-torso.ring1.front' },
      mockDispatch, mockState({ arrangementOverrides: { p1: prev } }),
    );

    (mockDispatch as unknown as ReturnType<typeof vi.fn>).mockClear();
    result.rollback!();
    const actions = dispatchedActions(mockDispatch);
    expect(actions[0].type).toBe(setArrangementBinding.type);
    expect(actions[0].payload).toEqual({ pieceId: 'p1', binding: prev });
  });

  it('rollback with no previous override clears it (clearArrangementOverride)', async () => {
    registerAnchorMap(mapOf(WAIST_RING));
    const mockDispatch = vi.fn() as unknown as AppDispatch;

    const result = await tool('place_piece').execute(
      { pieceId: 'p1', anchorId: 'front-torso.ring1.front' },
      mockDispatch, mockState(),
    );

    (mockDispatch as unknown as ReturnType<typeof vi.fn>).mockClear();
    result.rollback!();
    const actions = dispatchedActions(mockDispatch);
    expect(actions[0].type).toBe(clearArrangementOverride.type);
    expect(actions[0].payload).toBe('p1');
  });

  it('no registered map and no bakeable avatar → clear "not ready" error', async () => {
    // Sin registerAnchorMap y sin render root registrado, el bake devuelve null.
    const mockDispatch = vi.fn() as unknown as AppDispatch;

    const result = await tool('place_piece').execute(
      { pieceId: 'p1', anchorId: 'front-torso.ring1.front' },
      mockDispatch, mockState(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not ready|no está listo/i);
  });

  it('unknown piece / missing args → error', async () => {
    registerAnchorMap(mapOf(WAIST_RING));
    const mockDispatch = vi.fn() as unknown as AppDispatch;

    const notFound = await tool('place_piece').execute(
      { pieceId: 'nope', anchorId: 'front-torso.ring1.front' }, mockDispatch, mockState(),
    );
    expect(notFound.success).toBe(false);
    expect(notFound.error).toMatch(/not found/i);

    const noArgs = await tool('place_piece').execute(
      { anchorId: 'front-torso.ring1.front' }, mockDispatch, mockState(),
    );
    expect(noArgs.success).toBe(false);
    expect(noArgs.error).toMatch(/pieceId or pieceName/);
  });
});

describe('list_anchor_points', () => {
  it('returns rings grouped by namespace + each active piece\'s compatible namespace', async () => {
    registerAnchorMap(mapOf(WAIST_RING, ring('left-sleeve', 0, [-0.3, 1.3, 0])));
    const mockDispatch = vi.fn() as unknown as AppDispatch;

    const result = await tool('list_anchor_points').execute({}, mockDispatch, mockState());

    expect(result.success).toBe(true);
    const data = result.data as {
      namespaces: Record<string, Array<{ ring: number; anchorIds: string[]; heightM: number }>>;
      pieces: Array<{ pieceId: string; namespace: string }>;
    };
    expect(Object.keys(data.namespaces).sort()).toEqual(['front-torso', 'left-sleeve']);
    expect(data.namespaces['front-torso'][0].anchorIds).toContain('front-torso.ring1.front');
    expect(data.namespaces['front-torso'][0].heightM).toBeCloseTo(0.924, 3);
    expect(data.pieces).toEqual([{ pieceId: 'p1', name: 'Front', namespace: 'front-torso' }]);
  });

  it('no map available → "not ready" error', async () => {
    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool('list_anchor_points').execute({}, mockDispatch, mockState());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not ready|no está listo/i);
  });
});

describe('reset3DArrangement (reset = limpiar, no [0,0,0] world)', () => {
  it('per-piece reset dispatches clearArrangementOverride, not setArrangement3D([0,0,0])', async () => {
    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const binding: ArrangementBinding = { space: 'frame', posDelta: [0, 0.1, 0], rotDelta: [0, 0, 0, 1], anchorId: 'front-torso.ring1.front' };

    const result = await tool('reset3DArrangement').execute(
      { pieceId: 'p1' }, mockDispatch, mockState({ arrangementOverrides: { p1: binding } }),
    );

    expect(result.success).toBe(true);
    const actions = dispatchedActions(mockDispatch);
    expect(actions[0].type).toBe(clearArrangementOverride.type);
    expect(actions[0].payload).toBe('p1');

    // Rollback restaura el binding previo con el guard.
    (mockDispatch as unknown as ReturnType<typeof vi.fn>).mockClear();
    result.rollback!();
    const rb = dispatchedActions(mockDispatch);
    expect(rb[0].type).toBe(setArrangementBinding.type);
    expect(rb[0].payload).toEqual({ pieceId: 'p1', binding });
  });

  it('reset-all rollback restores bindings as bindings (guard, not the V3 cast)', async () => {
    const mockDispatch = vi.fn() as unknown as AppDispatch;
    const binding: ArrangementBinding = { space: 'frame', posDelta: [0, 0.1, 0], rotDelta: [0, 0, 0, 1] };

    const result = await tool('reset3DArrangement').execute(
      {}, mockDispatch, mockState({ arrangementOverrides: { p1: binding, p2: [1, 2, 3] } }),
    );

    expect(result.success).toBe(true);
    expect(dispatchedActions(mockDispatch)[0].type).toBe(clearArrangementOverrides.type);

    (mockDispatch as unknown as ReturnType<typeof vi.fn>).mockClear();
    result.rollback!();
    const rb = dispatchedActions(mockDispatch);
    expect(rb).toHaveLength(2);
    expect(rb.find(a => a.type === setArrangementBinding.type)?.payload).toEqual({ pieceId: 'p1', binding });
    expect(rb.find(a => a.type === setArrangement3D.type)?.payload).toEqual({ pieceId: 'p2', position: [1, 2, 3] });
  });

  it('reducer: clearArrangementOverride deletes the entry and marks dirty', () => {
    const binding: ArrangementBinding = { space: 'frame', posDelta: [0, 0.1, 0], rotDelta: [0, 0, 0, 1] };
    const state = {
      arrangementOverrides: { p1: binding, p2: [1, 2, 3] as [number, number, number] },
      isDirty: false,
    } as unknown as ReturnType<typeof projectReducer>;

    const next = projectReducer(state, clearArrangementOverride('p1'));
    expect(next.arrangementOverrides.p1).toBeUndefined();
    expect(next.arrangementOverrides.p2).toEqual([1, 2, 3]);
    expect(next.isDirty).toBe(true);
  });
});
