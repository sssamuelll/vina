/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, {
  addSeam, updateSeam,
  setSeamTension, deactivateSeam, deactivatePiece,
  addSeamGroup, removeSeamGroup,
  loadProject,
} from '../projectSlice';
import type { Seam, SeamGroup } from '../../types/types';

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
  const baseProject = {
    id: 'proj-1', name: 'Test Project',
    createdAt: 0, updatedAt: 0,
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
  };

  it('backfills seam defaults on load', () => {
    const project = {
      ...baseProject,
      pieces: [],
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
    const project = {
      ...baseProject,
      pieces: [
        { id: 'p1', name: 'B', outline: [], internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0, createdAt: 0, updatedAt: 0 },
      ] as any,
      seams: [],
    };
    const next = reducer(undefined, loadProject(project));
    expect(next.pieces[0].active).toBe(true);
  });

  it('loads seamGroups from project', () => {
    const project = {
      ...baseProject,
      pieces: [],
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
