/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, {
  addSeam, updateSeam,
  setSeamTension, deactivateSeam, deactivatePiece, reverseSeam,
  addSeamGroup, removeSeamGroup,
  loadProject,
} from '../projectSlice';
import type { Seam, SeamGroup } from '../../types/types';
import { detectSemanticEdges } from '../../utils/semanticEdges';

function baseState(overrides: Partial<any> = {}): any {
  return {
    id: 'test', name: 'Test',
    pieces: [],
    seams: [],
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    avatarMode: 'model' as const,
    avatarModelUrl: null,
    isDirty: false,
    groups: [],
    seamGroups: [],
    arrangementOverrides: {},
    ...overrides,
  };
}

function makeSeam(id: string, overrides: Partial<Seam> = {}): Seam {
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
    ...overrides,
  };
}

function makeSeamGroup(id: string, overrides: Partial<SeamGroup> = {}): SeamGroup {
  return {
    id,
    edgesA: [{ pieceId: 'p1', edgeName: 'sideSeam' }],
    edgesB: [{ pieceId: 'p2', edgeName: 'sideSeam' }],
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
    ...overrides,
  };
}

describe('projectSlice — addSeam provenance', () => {
  it('defaults createdBy to "human" when origin is omitted', () => {
    const next = reducer(baseState(), addSeam(makeSeam('s1')));
    expect(next.seams[0].createdBy).toBe('human');
  });

  it('preserves an explicit "ai" origin (agent / auto-sew)', () => {
    const next = reducer(baseState(), addSeam(makeSeam('s2', { createdBy: 'ai' })));
    expect(next.seams[0].createdBy).toBe('ai');
  });
});

describe('projectSlice — updateSeam', () => {
  it('replaces the seam with matching id', () => {
    const state = baseState({ seams: [makeSeam('s1'), makeSeam('s2')] });
    const updated = makeSeam('s1', { tension: 150, type: 'french' });
    const next = reducer(state, updateSeam(updated));
    expect(next.seams[0].tension).toBe(150);
    expect(next.seams[0].type).toBe('french');
    expect(next.seams[1].id).toBe('s2'); // other seam untouched
    expect(next.isDirty).toBe(true);
  });

  it('does nothing when id not found', () => {
    const state = baseState({ seams: [makeSeam('s1')] });
    const next = reducer(state, updateSeam(makeSeam('nonexistent')));
    expect(next.seams).toHaveLength(1);
    expect(next.isDirty).toBe(false);
  });
});

describe('projectSlice — setSeamTension', () => {
  it('sets tension within range', () => {
    const state = baseState({ seams: [makeSeam('s1', { tension: 100 })] });
    const next = reducer(state, setSeamTension({ seamId: 's1', tension: 150 }));
    expect(next.seams[0].tension).toBe(150);
    expect(next.isDirty).toBe(true);
  });

  it('clamps tension to minimum 10', () => {
    const state = baseState({ seams: [makeSeam('s1')] });
    const next = reducer(state, setSeamTension({ seamId: 's1', tension: 0 }));
    expect(next.seams[0].tension).toBe(10);
  });

  it('clamps tension to maximum 200', () => {
    const state = baseState({ seams: [makeSeam('s1')] });
    const next = reducer(state, setSeamTension({ seamId: 's1', tension: 999 }));
    expect(next.seams[0].tension).toBe(200);
  });

  it('sets strength when provided', () => {
    const state = baseState({ seams: [makeSeam('s1', { strength: 1.0 })] });
    const next = reducer(state, setSeamTension({ seamId: 's1', tension: 100, strength: 0.5 }));
    expect(next.seams[0].strength).toBe(0.5);
  });

  it('clamps strength to minimum 0.01', () => {
    const state = baseState({ seams: [makeSeam('s1')] });
    const next = reducer(state, setSeamTension({ seamId: 's1', tension: 100, strength: 0 }));
    expect(next.seams[0].strength).toBe(0.01);
  });

  it('clamps strength to maximum 1.0', () => {
    const state = baseState({ seams: [makeSeam('s1')] });
    const next = reducer(state, setSeamTension({ seamId: 's1', tension: 100, strength: 5.0 }));
    expect(next.seams[0].strength).toBe(1.0);
  });

  it('leaves strength unchanged when not provided', () => {
    const state = baseState({ seams: [makeSeam('s1', { strength: 0.7 })] });
    const next = reducer(state, setSeamTension({ seamId: 's1', tension: 120 }));
    expect(next.seams[0].strength).toBe(0.7);
  });

  it('does nothing when seamId not found', () => {
    const state = baseState({ seams: [makeSeam('s1')] });
    const next = reducer(state, setSeamTension({ seamId: 'nonexistent', tension: 50 }));
    expect(next.isDirty).toBe(false);
  });
});

describe('projectSlice — deactivateSeam', () => {
  it('sets active to false', () => {
    const state = baseState({ seams: [makeSeam('s1', { active: true })] });
    const next = reducer(state, deactivateSeam({ seamId: 's1', active: false }));
    expect(next.seams[0].active).toBe(false);
    expect(next.isDirty).toBe(true);
  });

  it('sets active to true (re-activate)', () => {
    const state = baseState({ seams: [makeSeam('s1', { active: false })] });
    const next = reducer(state, deactivateSeam({ seamId: 's1', active: true }));
    expect(next.seams[0].active).toBe(true);
    expect(next.isDirty).toBe(true);
  });

  it('does nothing when seamId not found', () => {
    const state = baseState({ seams: [makeSeam('s1')] });
    const next = reducer(state, deactivateSeam({ seamId: 'nonexistent', active: false }));
    expect(next.isDirty).toBe(false);
  });
});

describe('projectSlice — deactivatePiece', () => {
  it('sets active to false on piece', () => {
    const state = baseState({
      pieces: [{ id: 'p1', active: true, name: 'Bodice', outline: [], internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, createdAt: 0, updatedAt: 0 }],
    });
    const next = reducer(state, deactivatePiece({ pieceId: 'p1', active: false }));
    expect(next.pieces[0].active).toBe(false);
    expect(next.isDirty).toBe(true);
  });

  it('sets active to true (re-activate piece)', () => {
    const state = baseState({
      pieces: [{ id: 'p1', active: false, name: 'Bodice', outline: [], internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, createdAt: 0, updatedAt: 0 }],
    });
    const next = reducer(state, deactivatePiece({ pieceId: 'p1', active: true }));
    expect(next.pieces[0].active).toBe(true);
    expect(next.isDirty).toBe(true);
  });

  it('does nothing when pieceId not found', () => {
    const state = baseState({ pieces: [] });
    const next = reducer(state, deactivatePiece({ pieceId: 'nonexistent', active: false }));
    expect(next.isDirty).toBe(false);
  });
});

describe('projectSlice — addSeam backfills defaults', () => {
  it('backfills all defaults when payload omits them', () => {
    const state = baseState();
    const minimalSeam = {
      id: 's1',
      pieceA: { pieceId: 'p1', edgeName: 'sideSeam' },
      pieceB: { pieceId: 'p2', edgeName: 'sideSeam' },
      type: 'standard',
    } as any;
    const next = reducer(state, addSeam(minimalSeam));
    expect(next.seams[0].tension).toBe(100);
    expect(next.seams[0].strength).toBe(1.0);
    expect(next.seams[0].active).toBe(true);
    expect(next.seams[0].taped).toBe(false);
    expect(next.seams[0].tapeWidth).toBe(10);
  });

  it('does not override explicit values in payload', () => {
    const state = baseState();
    const next = reducer(state, addSeam(makeSeam('s1', { tension: 150, strength: 0.5, active: false, taped: true, tapeWidth: 20 })));
    expect(next.seams[0].tension).toBe(150);
    expect(next.seams[0].strength).toBe(0.5);
    expect(next.seams[0].active).toBe(false);
    expect(next.seams[0].taped).toBe(true);
    expect(next.seams[0].tapeWidth).toBe(20);
  });
});

describe('projectSlice — addSeamGroup / removeSeamGroup', () => {
  it('addSeamGroup appends a seam group', () => {
    const state = baseState();
    const group = makeSeamGroup('sg1');
    const next = reducer(state, addSeamGroup(group));
    expect(next.seamGroups).toHaveLength(1);
    expect(next.seamGroups[0].id).toBe('sg1');
    expect(next.isDirty).toBe(true);
  });

  it('addSeamGroup can add multiple groups', () => {
    let state: any = baseState();
    state = reducer(state, addSeamGroup(makeSeamGroup('sg1')));
    state = reducer(state, addSeamGroup(makeSeamGroup('sg2')));
    expect(state.seamGroups).toHaveLength(2);
  });

  it('removeSeamGroup removes by id', () => {
    const state = baseState({ seamGroups: [makeSeamGroup('sg1'), makeSeamGroup('sg2')] });
    const next = reducer(state, removeSeamGroup('sg1'));
    expect(next.seamGroups).toHaveLength(1);
    expect(next.seamGroups[0].id).toBe('sg2');
    expect(next.isDirty).toBe(true);
  });

  it('removeSeamGroup is a no-op for unknown id', () => {
    const state = baseState({ seamGroups: [makeSeamGroup('sg1')] });
    const next = reducer(state, removeSeamGroup('nonexistent'));
    expect(next.seamGroups).toHaveLength(1);
  });
});

describe('projectSlice — loadProject backfills', () => {
  const validPiece = (id: string) => ({
    id, name: id,
    outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] }, { type: 'Z', values: [] }],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10,
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  });
  const baseProject = {
    id: 'proj-1', name: 'Test Project',
    createdAt: 0, updatedAt: 0,
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
  };

  it('backfills seam defaults on load', () => {
    const project = {
      ...baseProject,
      pieces: [validPiece('p1'), validPiece('p2')] as any,
      seams: [
        { id: 's1', pieceA: { pieceId: 'p1', edgeName: 'e' }, pieceB: { pieceId: 'p2', edgeName: 'e' }, type: 'standard' },
      ] as any,
    };
    const next = reducer(undefined, loadProject(project));
    expect(next.seams[0].tension).toBe(100);
    expect(next.seams[0].strength).toBe(1.0);
    expect(next.seams[0].active).toBe(true);
    expect(next.seams[0].taped).toBe(false);
    expect(next.seams[0].tapeWidth).toBe(10);
  });

  it('backfills piece.active on load', () => {
    const p = validPiece('p1');
    delete (p as any).active; // remove so backfill kicks in
    const project = {
      ...baseProject,
      pieces: [p] as any,
      seams: [],
    };
    const next = reducer(undefined, loadProject(project));
    expect(next.pieces[0].active).toBe(true);
  });

  it('loads seamGroups from project', () => {
    const project = {
      ...baseProject,
      pieces: [validPiece('p1'), validPiece('p2')] as any,
      seams: [],
      seamGroups: [makeSeamGroup('sg1')],
    };
    const next = reducer(undefined, loadProject(project));
    expect(next.seamGroups).toHaveLength(1);
    expect(next.seamGroups[0].id).toBe('sg1');
  });

  it('defaults seamGroups to [] when absent in project', () => {
    const project = { ...baseProject, pieces: [], seams: [] };
    const next = reducer(undefined, loadProject(project));
    expect(next.seamGroups).toEqual([]);
  });
});

// ─── reverseSeam (parity plan Fase 5 — direction toggle) ─────────────────────

describe('reverseSeam', () => {
  it('toggles pieceB.reversed (NOT a pieceA↔pieceB swap — that was a physical no-op)', () => {
    const state = baseState({ seams: [makeSeam('s1')] });

    const once = reducer(state, reverseSeam('s1'));
    expect(once.seams[0].pieceB.reversed).toBe(true);
    // Las mitades NO se intercambian: A sigue siendo la referencia.
    expect(once.seams[0].pieceA.pieceId).toBe('p1');
    expect(once.seams[0].pieceB.pieceId).toBe('p2');
    expect(once.isDirty).toBe(true);

    // Ctrl+B dos veces = identidad (criterio done de la fase).
    const twice = reducer(once, reverseSeam('s1'));
    expect(twice.seams[0].pieceB.reversed).toBe(false);
  });

  it('is a no-op for unknown seam ids', () => {
    const state = baseState({ seams: [makeSeam('s1')] });
    const next = reducer(state, reverseSeam('ghost'));
    expect(next.seams[0].pieceB.reversed).toBeUndefined();
    expect(next.isDirty).toBe(false);
  });
});

// ─── Per-edge SA widths sobreviven el generative load (Fase 6) ───────────────

describe('loadProject preserves per-edge SA widths (re-key por nombre)', () => {
  it('a width set with the SA tool survives the generative edge re-detection', () => {
    // Pieza con categoría ≠ 'other' → loadProject re-detecta edges
    // (projectSlice applyProjectPayload, rama generative). Antes del fix,
    // detectSemanticEdges reemplazaba piece.edges sin copiar
    // seamAllowanceWidth → pérdida silenciosa en cada load.
    const piece: any = {
      id: 'bf', name: 'Bodice Front', category: 'bodice',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [200, 0] },
        { type: 'C', values: [220, 0, 220, 150, 200, 200] },
        { type: 'L', values: [200, 500] },
        { type: 'L', values: [0, 500] },
        { type: 'Z', values: [] },
      ],
      internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
      seamAllowance: 10, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
    };
    const detected = detectSemanticEdges(piece);
    expect(detected.length).toBeGreaterThan(0);
    const targetName = detected[0].name;
    piece.edges = detected.map((e: any, i: number) =>
      i === 0 ? { ...e, seamAllowanceWidth: 40 } : e,
    );

    const next = reducer(undefined, loadProject({
      id: 'proj-w', name: 'Widths', createdAt: 0, updatedAt: 0,
      fabrics: [],
      avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} },
      pieces: [piece],
      seams: [],
    } as any));

    const loaded = next.pieces.find(p => p.id === 'bf');
    const target = loaded?.edges?.find(e => e.name === targetName);
    expect(target?.seamAllowanceWidth).toBe(40);
  });
});
