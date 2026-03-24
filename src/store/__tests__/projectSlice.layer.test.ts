/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, {
  addPiece, setLayer, setSublayer, cloneToLayer, superimposePiece,
  renameLayer, deleteLayerName, setLayerLocked, addLayer, removeLayer, loadProject,
} from '../projectSlice';
import type { PatternPiece } from '../../types/types';

function basePiece(overrides?: Partial<PatternPiece>): PatternPiece {
  return {
    id: 'p1',
    name: 'Test Piece',
    outline: [],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function emptyState() {
  return {
    id: 'test',
    name: 'Test',
    pieces: [] as PatternPiece[],
    seams: [],
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: { height: 170, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } },
    avatarMode: 'model' as const,
    avatarModelUrl: null,
    isDirty: false,
    groups: [],
    seamGroups: [],
    arrangementOverrides: {},
    poms: [],
    referenceImages: [],
    layerNames: {},
    layerLocked: {},
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
  };
}

describe('PatternPiece layer auto-detection', () => {
  it('assigns layer 0 for lining', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'lining', layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(0);
  });

  it('assigns layer 0 for facing', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'facing', layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(0);
  });

  it('assigns layer 1 for bodice', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'bodice', layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(1);
  });

  it('assigns layer 2 for collar', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'collar', layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(2);
  });

  it('assigns layer 1 for undefined category', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: undefined, layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(1);
  });

  it('preserves explicitly provided layer', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'collar', layer: 5 });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(5);
  });

  it('defaults sublayer to 0', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', sublayer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].sublayer).toBe(0);
  });
});

describe('setLayer reducer', () => {
  it('sets layer on piece', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, setLayer({ pieceId: 'p1', layer: 3 }));
    expect(next.pieces[0].layer).toBe(3);
  });

  it('clamps layer to minimum 0', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, setLayer({ pieceId: 'p1', layer: -2 }));
    expect(next.pieces[0].layer).toBe(0);
  });

  it('does nothing if piece not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, setLayer({ pieceId: 'nonexistent', layer: 5 }));
    expect(next.pieces[0].layer).toBe(1);
  });
});

describe('setSublayer reducer', () => {
  it('sets sublayer on piece', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', sublayer: 0 })] };
    const next = reducer(state, setSublayer({ pieceId: 'p1', sublayer: 7 }));
    expect(next.pieces[0].sublayer).toBe(7);
  });

  it('does nothing if piece not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', sublayer: 3 })] };
    const next = reducer(state, setSublayer({ pieceId: 'nonexistent', sublayer: 10 }));
    expect(next.pieces[0].sublayer).toBe(3);
  });

  it('clamps sublayer to minimum 0', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', sublayer: 3 })] };
    const next = reducer(state, setSublayer({ pieceId: 'p1', sublayer: -5 }));
    expect(next.pieces[0].sublayer).toBe(0);
  });
});

describe('cloneToLayer reducer', () => {
  it('sets isDirty when cloning', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'over' }));
    expect(next.isDirty).toBe(true);
  });

  it('creates clone one layer above with direction=over', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'over' }));
    expect(next.pieces).toHaveLength(2);
    expect(next.pieces[1].layer).toBe(2);
    expect(next.pieces[1].name).toBe('Test Piece (clone)');
  });

  it('creates clone one layer below with direction=under', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 2 })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'under' }));
    expect(next.pieces).toHaveLength(2);
    expect(next.pieces[1].layer).toBe(1);
  });

  it('clamps clone layer to 0 when cloning under from layer 0', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 0 })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'under' }));
    expect(next.pieces).toHaveLength(2);
    expect(next.pieces[1].layer).toBe(0);
  });

  it('copies arrangement override to clone', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 })],
      arrangementOverrides: { p1: [0.5, 1.0, 0.2] as [number, number, number] },
    };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'over' }));
    const cloneId = next.pieces[1].id;
    expect(next.arrangementOverrides[cloneId]).toEqual([0.5, 1.0, 0.2]);
  });

  it('does nothing if piece not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1' })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'nonexistent', direction: 'over' }));
    expect(next.pieces).toHaveLength(1);
  });
});

describe('superimposePiece reducer', () => {
  it('sets isDirty when superimposing', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 }), basePiece({ id: 'p2', layer: 2 })],
      arrangementOverrides: { p2: [0, 0.5, 0] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'over' }));
    expect(next.isDirty).toBe(true);
  });

  it('copies target position and sets layer above for mode=over', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 }), basePiece({ id: 'p2', layer: 2 })],
      arrangementOverrides: { p2: [1, 2, 3] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'over' }));
    expect(next.pieces[0].layer).toBe(3);
    expect(next.arrangementOverrides.p1).toEqual([1, 2, 3]);
  });

  it('copies target position and sets layer below for mode=under', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 3 }), basePiece({ id: 'p2', layer: 2 })],
      arrangementOverrides: { p2: [1, 2, 3] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'under' }));
    expect(next.pieces[0].layer).toBe(1);
    expect(next.arrangementOverrides.p1).toEqual([1, 2, 3]);
  });

  it('applies side offset for mode=side without changing layer', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 }), basePiece({ id: 'p2', layer: 2 })],
      arrangementOverrides: { p2: [1, 2, 3] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'side' }));
    expect(next.pieces[0].layer).toBe(1); // unchanged
    expect(next.arrangementOverrides.p1).toEqual([1.1, 2, 3]);
  });

  it('clamps layer to 0 when superimposing under target at layer 0', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 2 }), basePiece({ id: 'p2', layer: 0 })],
      arrangementOverrides: { p2: [0, 0, 0] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'under' }));
    expect(next.pieces[0].layer).toBe(0);
  });

  it('does not copy position when target has no arrangement override', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 }), basePiece({ id: 'p2', layer: 2 })],
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'over' }));
    expect(next.pieces[0].layer).toBe(3); // layer still updated
    expect(next.arrangementOverrides.p1).toBeUndefined(); // no position set
  });

  it('does nothing if piece not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, superimposePiece({ pieceId: 'ghost', targetPieceId: 'p1', mode: 'over' }));
    expect(next.pieces[0].layer).toBe(1);
  });

  it('does nothing if target not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'ghost', mode: 'over' }));
    expect(next.pieces[0].layer).toBe(1);
  });
});

describe('renameLayer reducer', () => {
  it('sets a custom layer name', () => {
    const state = emptyState();
    const next = reducer(state, renameLayer({ layer: 1, name: 'Outer Shell' }));
    expect(next.layerNames[1]).toBe('Outer Shell');
    expect(next.isDirty).toBe(true);
  });

  it('is idempotent — overwrites existing name', () => {
    const state = { ...emptyState(), layerNames: { 1: 'Old Name' } };
    const next = reducer(state, renameLayer({ layer: 1, name: 'New Name' }));
    expect(next.layerNames[1]).toBe('New Name');
  });
});

describe('deleteLayerName reducer', () => {
  it('removes a custom layer name', () => {
    const state = { ...emptyState(), layerNames: { 1: 'Shell', 2: 'Trims' } };
    const next = reducer(state, deleteLayerName({ layer: 1 }));
    expect(next.layerNames[1]).toBeUndefined();
    expect(next.layerNames[2]).toBe('Trims');
    expect(next.isDirty).toBe(true);
  });
});

describe('setLayerLocked reducer', () => {
  it('locks a layer', () => {
    const state = emptyState();
    const next = reducer(state, setLayerLocked({ layer: 2, locked: true }));
    expect(next.layerLocked[2]).toBe(true);
    expect(next.isDirty).toBe(true);
  });

  it('unlocks a layer', () => {
    const state = { ...emptyState(), layerLocked: { 2: true } };
    const next = reducer(state, setLayerLocked({ layer: 2, locked: false }));
    expect(next.layerLocked[2]).toBe(false);
  });
});

describe('addLayer reducer', () => {
  it('adds a layer with a name', () => {
    const state = emptyState();
    const next = reducer(state, addLayer({ layer: 5, name: 'Interlining' }));
    expect(next.layerNames[5]).toBe('Interlining');
    expect(next.isDirty).toBe(true);
  });

  it('overwrites name if layer already has one', () => {
    const state = { ...emptyState(), layerNames: { 5: 'Old' } };
    const next = reducer(state, addLayer({ layer: 5, name: 'New' }));
    expect(next.layerNames[5]).toBe('New');
  });

  it('adds layer without name', () => {
    const state = emptyState();
    const next = reducer(state, addLayer({ layer: 3 }));
    expect(next.layerNames[3]).toBeUndefined();
    expect(next.isDirty).toBe(true);
  });
});

describe('removeLayer reducer', () => {
  it('moves pieces from removed layer to layer 1 and cleans metadata', () => {
    const state = {
      ...emptyState(),
      pieces: [
        basePiece({ id: 'p1', layer: 3 }),
        basePiece({ id: 'p2', layer: 1 }),
        basePiece({ id: 'p3', layer: 3 }),
      ],
      layerNames: { 3: 'Custom' },
      layerLocked: { 3: true },
    };
    const next = reducer(state, removeLayer({ layer: 3 }));
    expect(next.pieces[0].layer).toBe(1);
    expect(next.pieces[1].layer).toBe(1);
    expect(next.pieces[2].layer).toBe(1);
    expect(next.layerNames[3]).toBeUndefined();
    expect(next.layerLocked[3]).toBeUndefined();
    expect(next.isDirty).toBe(true);
  });

  it('does not remove layer 1', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 })],
      layerNames: { 1: 'Shell' },
    };
    const next = reducer(state, removeLayer({ layer: 1 }));
    expect(next.layerNames[1]).toBe('Shell');
    expect(next.isDirty).toBe(false);
  });
});

describe('loadProject backfills layer metadata', () => {
  it('backfills layerNames and layerLocked from older projects', () => {
    const state = emptyState();
    const oldProject = {
      id: 'old',
      name: 'Old Project',
      pieces: [basePiece({ id: 'p1' })],
      seams: [],
      fabrics: [],
      avatar: state.avatar,
      groups: [],
      poms: [],
      // no layerNames or layerLocked
    };
    const next = reducer(state, loadProject(oldProject as any));
    expect(next.layerNames).toEqual({});
    expect(next.layerLocked).toEqual({});
  });

  it('preserves layerNames and layerLocked when present', () => {
    const state = emptyState();
    const project = {
      id: 'new',
      name: 'New Project',
      pieces: [basePiece({ id: 'p1' })],
      seams: [],
      fabrics: [],
      avatar: state.avatar,
      groups: [],
      poms: [],
      layerNames: { 1: 'Shell', 2: 'Trims' },
      layerLocked: { 0: true },
    };
    const next = reducer(state, loadProject(project as any));
    expect(next.layerNames).toEqual({ 1: 'Shell', 2: 'Trims' });
    expect(next.layerLocked).toEqual({ 0: true });
  });
});
