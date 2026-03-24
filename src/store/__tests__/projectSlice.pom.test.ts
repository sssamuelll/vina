/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, {
  addPOM, updatePOM, removePOM, recomputePOMValues,
  removePiece, loadProject,
} from '../projectSlice';
import { PointOfMeasure } from '../../types/types';

function makePOM(id: string, overrides: Partial<PointOfMeasure> = {}): PointOfMeasure {
  return {
    id, name: 'Test', category: 'custom', method: 'straight',
    pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
    pointB: { pieceId: 'p2', localPosition: { x: 100, y: 0 } },
    value: 100, createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

function baseState(overrides: Record<string, any> = {}) {
  return {
    id: 'test', name: 'Test', pieces: [] as any[], seams: [], pleats: [], fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    avatarMode: 'model' as const, avatarModelUrl: null, isDirty: false,
    arrangementOverrides: {}, groups: [], seamGroups: [], poms: [] as PointOfMeasure[],
    layerNames: {}, layerLocked: {},
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    ...overrides,
  };
}

describe('projectSlice — POM CRUD', () => {
  it('addPOM adds a POM and sets isDirty', () => {
    const state = baseState();
    const pom = makePOM('pom-1');
    const next = reducer(state, addPOM(pom));
    expect(next.poms).toHaveLength(1);
    expect(next.poms[0].id).toBe('pom-1');
    expect(next.isDirty).toBe(true);
  });

  it('updatePOM replaces POM by id', () => {
    const state = baseState({ poms: [makePOM('pom-1')] });
    const updated = makePOM('pom-1', { name: 'Updated', value: 42 });
    const next = reducer(state, updatePOM(updated));
    expect(next.poms).toHaveLength(1);
    expect(next.poms[0].name).toBe('Updated');
    expect(next.poms[0].value).toBe(42);
    expect(next.isDirty).toBe(true);
  });

  it('updatePOM is no-op for unknown id', () => {
    const state = baseState({ poms: [makePOM('pom-1')] });
    const unknown = makePOM('pom-unknown');
    const next = reducer(state, updatePOM(unknown));
    expect(next.poms).toHaveLength(1);
    expect(next.poms[0].id).toBe('pom-1');
    expect(next.isDirty).toBe(false);
  });

  it('removePOM removes by id', () => {
    const state = baseState({ poms: [makePOM('pom-1'), makePOM('pom-2')] });
    const next = reducer(state, removePOM('pom-1'));
    expect(next.poms).toHaveLength(1);
    expect(next.poms[0].id).toBe('pom-2');
    expect(next.isDirty).toBe(true);
  });

  it('recomputePOMValues batch updates values', () => {
    const state = baseState({ poms: [makePOM('pom-1', { value: 100 }), makePOM('pom-2', { value: 200 })] });
    const next = reducer(state, recomputePOMValues([
      { id: 'pom-1', value: 55 },
      { id: 'pom-2', value: 77 },
    ]));
    expect(next.poms[0].value).toBe(55);
    expect(next.poms[1].value).toBe(77);
  });
});

describe('projectSlice — POM cleanup on removePiece', () => {
  it('removePiece removes POMs referencing deleted piece', () => {
    const state = baseState({
      pieces: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      poms: [
        makePOM('pom-1', { pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } } }),
        makePOM('pom-2', { pointA: { pieceId: 'p3', localPosition: { x: 0, y: 0 } }, pointB: { pieceId: 'p3', localPosition: { x: 10, y: 0 } } }),
        makePOM('pom-3', { pointB: { pieceId: 'p1', localPosition: { x: 50, y: 0 } } }),
      ],
    });
    const next = reducer(state, removePiece('p1'));
    // pom-1 references p1 in pointA, pom-3 references p1 in pointB — both removed
    expect(next.poms).toHaveLength(1);
    expect(next.poms[0].id).toBe('pom-2');
  });
});

describe('projectSlice — loadProject backfills poms', () => {
  it('loadProject backfills poms to [] for old projects without poms', () => {
    const state = baseState();
    const oldProject = {
      id: 'old', name: 'Old Project', pieces: [], seams: [], fabrics: [],
      avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} },
      createdAt: 0, updatedAt: 0,
      // No poms field — simulates old project format
    } as any;
    const next = reducer(state, loadProject(oldProject));
    expect(next.poms).toEqual([]);
  });

  it('loadProject preserves existing poms', () => {
    const state = baseState();
    const minPiece = (id: string) => ({
      id, name: id, outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }, { type: 'L', values: [10, 10] }, { type: 'Z', values: [] }],
      internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
      seamAllowance: 10, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
    });
    const project = {
      id: 'new', name: 'New Project',
      pieces: [minPiece('p1'), minPiece('p2')], seams: [], fabrics: [],
      avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} },
      poms: [makePOM('pom-1')],
      createdAt: 0, updatedAt: 0,
    } as any;
    const next = reducer(state, loadProject(project));
    expect(next.poms).toHaveLength(1);
    expect(next.poms[0].id).toBe('pom-1');
  });
});
