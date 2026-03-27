import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage before importing the slice
const mockStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
});

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => `test-uuid-${++uuidCounter}`),
});

import bomReducer, {
  populateBOM,
  addManualEntry,
  updateEntry,
  removeEntry,
  setCurrency,
  setColorwayOverride,
  clearBOM,
  rehydrateBOM,
  persistBOM,
  loadBOM,
  selectBOMEntries,
  selectBOMByCategory,
  selectTotalCost,
  selectTotalCostByColorway,
  selectBOMIsStale,
  selectBOMForColorway,
} from '../bomSlice';
import { NEW_PROJECT } from '../actions';
import type { BOMState, BOMEntry } from '../../types/bom';

function getInitialState(): BOMState {
  return bomReducer(undefined, { type: '@@INIT' });
}

function makeBOMEntry(overrides: Partial<BOMEntry> = {}): BOMEntry {
  return {
    id: overrides.id ?? 'entry-1',
    category: overrides.category ?? 'fabric',
    name: overrides.name ?? 'Cotton Poplin',
    description: overrides.description ?? 'Lightweight cotton',
    quantity: overrides.quantity ?? 2.5,
    unit: overrides.unit ?? 'meters',
    unitCost: overrides.unitCost ?? 12.0,
    currency: overrides.currency ?? 'USD',
    colorwayOverrides: overrides.colorwayOverrides ?? {},
    autoPopulated: overrides.autoPopulated ?? true,
    sourcePieceIds: overrides.sourcePieceIds ?? ['piece-1'],
  };
}

/** Build a minimal RootState-like object for selector tests */
function makeRootState(bomState: BOMState, projectUpdatedAt?: number) {
  return {
    bom: bomState,
    project: { updatedAt: projectUpdatedAt },
  } as unknown as import('../index').RootState;
}

describe('bomSlice', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    vi.clearAllMocks();
    uuidCounter = 0;
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('has correct initial state', () => {
    const state = getInitialState();
    expect(state.entries).toEqual([]);
    expect(state.currency).toBe('USD');
    expect(state.lastExtractedAt).toBeNull();
    expect(state.extractedProjectVersion).toBeNull();
  });

  // -------------------------------------------------------------------------
  // populateBOM
  // -------------------------------------------------------------------------

  describe('populateBOM', () => {
    it('replaces entries and sets extraction metadata', () => {
      const entries = [makeBOMEntry({ id: 'e1' }), makeBOMEntry({ id: 'e2' })];
      const before = Date.now();
      const state = bomReducer(getInitialState(), populateBOM({ entries, projectVersion: 42 }));
      expect(state.entries).toHaveLength(2);
      expect(state.entries[0].id).toBe('e1');
      expect(state.entries[1].id).toBe('e2');
      expect(state.extractedProjectVersion).toBe(42);
      expect(state.lastExtractedAt).toBeGreaterThanOrEqual(before);
    });

    it('replaces auto-populated entries but keeps manual ones', () => {
      const manual = makeBOMEntry({ id: 'manual-1', autoPopulated: false, name: 'Button' });
      let state = getInitialState();
      state = { ...state, entries: [makeBOMEntry({ id: 'auto-1', autoPopulated: true }), manual] };
      const newEntries = [makeBOMEntry({ id: 'auto-new', autoPopulated: true, name: 'Silk' })];
      state = bomReducer(state, populateBOM({ entries: newEntries, projectVersion: 5 }));
      expect(state.entries).toHaveLength(2);
      expect(state.entries.find(e => e.id === 'manual-1')).toBeTruthy();
      expect(state.entries.find(e => e.id === 'auto-new')).toBeTruthy();
      expect(state.entries.find(e => e.id === 'auto-1')).toBeUndefined();
    });

    it('persists to localStorage', () => {
      const entries = [makeBOMEntry()];
      bomReducer(getInitialState(), populateBOM({ entries, projectVersion: 1 }));
      expect(localStorage.setItem).toHaveBeenCalledWith('openclo-bom', expect.any(String));
    });
  });

  // -------------------------------------------------------------------------
  // addManualEntry
  // -------------------------------------------------------------------------

  describe('addManualEntry', () => {
    it('adds entry with generated id and autoPopulated=false', () => {
      const state = bomReducer(
        getInitialState(),
        addManualEntry({
          category: 'trim',
          name: 'Button',
          description: 'Pearl button',
          quantity: 6,
          unit: 'pieces',
          unitCost: 0.5,
          currency: 'USD',
          colorwayOverrides: {},
          sourcePieceIds: [],
        })
      );
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].id).toBe('test-uuid-1');
      expect(state.entries[0].autoPopulated).toBe(false);
      expect(state.entries[0].name).toBe('Button');
      expect(state.entries[0].category).toBe('trim');
    });

    it('persists to localStorage', () => {
      bomReducer(
        getInitialState(),
        addManualEntry({
          category: 'label',
          name: 'Brand Label',
          description: '',
          quantity: 1,
          unit: 'pieces',
          unitCost: 0.25,
          currency: 'USD',
          colorwayOverrides: {},
          sourcePieceIds: [],
        })
      );
      expect(localStorage.setItem).toHaveBeenCalledWith('openclo-bom', expect.any(String));
    });
  });

  // -------------------------------------------------------------------------
  // updateEntry
  // -------------------------------------------------------------------------

  describe('updateEntry', () => {
    it('updates fields on an existing entry', () => {
      const initial = {
        ...getInitialState(),
        entries: [makeBOMEntry({ id: 'e1', name: 'Cotton', unitCost: 10 })],
      };
      const state = bomReducer(initial, updateEntry({ id: 'e1', changes: { name: 'Silk', unitCost: 25 } }));
      expect(state.entries[0].name).toBe('Silk');
      expect(state.entries[0].unitCost).toBe(25);
    });

    it('is a no-op when entry not found', () => {
      const initial = {
        ...getInitialState(),
        entries: [makeBOMEntry({ id: 'e1' })],
      };
      const state = bomReducer(initial, updateEntry({ id: 'nonexistent', changes: { name: 'X' } }));
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].name).toBe('Cotton Poplin');
    });

    it('persists to localStorage', () => {
      const initial = { ...getInitialState(), entries: [makeBOMEntry({ id: 'e1' })] };
      bomReducer(initial, updateEntry({ id: 'e1', changes: { name: 'Linen' } }));
      expect(localStorage.setItem).toHaveBeenCalledWith('openclo-bom', expect.any(String));
    });
  });

  // -------------------------------------------------------------------------
  // removeEntry
  // -------------------------------------------------------------------------

  describe('removeEntry', () => {
    it('removes entry by id', () => {
      const initial = {
        ...getInitialState(),
        entries: [makeBOMEntry({ id: 'e1' }), makeBOMEntry({ id: 'e2' })],
      };
      const state = bomReducer(initial, removeEntry('e1'));
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].id).toBe('e2');
    });

    it('is safe when id not found', () => {
      const initial = { ...getInitialState(), entries: [makeBOMEntry({ id: 'e1' })] };
      const state = bomReducer(initial, removeEntry('nonexistent'));
      expect(state.entries).toHaveLength(1);
    });

    it('persists to localStorage', () => {
      const initial = { ...getInitialState(), entries: [makeBOMEntry({ id: 'e1' })] };
      bomReducer(initial, removeEntry('e1'));
      expect(localStorage.setItem).toHaveBeenCalledWith('openclo-bom', expect.any(String));
    });
  });

  // -------------------------------------------------------------------------
  // setCurrency
  // -------------------------------------------------------------------------

  describe('setCurrency', () => {
    it('sets the default currency', () => {
      const state = bomReducer(getInitialState(), setCurrency('EUR'));
      expect(state.currency).toBe('EUR');
    });

    it('persists to localStorage', () => {
      bomReducer(getInitialState(), setCurrency('GBP'));
      expect(localStorage.setItem).toHaveBeenCalledWith('openclo-bom', expect.any(String));
    });
  });

  // -------------------------------------------------------------------------
  // setColorwayOverride
  // -------------------------------------------------------------------------

  describe('setColorwayOverride', () => {
    it('sets a colorway override on an entry', () => {
      const initial = { ...getInitialState(), entries: [makeBOMEntry({ id: 'e1' })] };
      const state = bomReducer(
        initial,
        setColorwayOverride({
          entryId: 'e1',
          colorwayId: 'cw-red',
          override: { name: 'Red Cotton', unitCost: 14.0 },
        })
      );
      expect(state.entries[0].colorwayOverrides['cw-red']).toEqual({
        name: 'Red Cotton',
        unitCost: 14.0,
      });
    });

    it('is a no-op when entry not found', () => {
      const initial = { ...getInitialState(), entries: [makeBOMEntry({ id: 'e1' })] };
      const state = bomReducer(
        initial,
        setColorwayOverride({
          entryId: 'nonexistent',
          colorwayId: 'cw-1',
          override: { name: 'X' },
        })
      );
      expect(state.entries[0].colorwayOverrides).toEqual({});
    });

    it('persists to localStorage', () => {
      const initial = { ...getInitialState(), entries: [makeBOMEntry({ id: 'e1' })] };
      bomReducer(
        initial,
        setColorwayOverride({
          entryId: 'e1',
          colorwayId: 'cw-1',
          override: { unitCost: 15 },
        })
      );
      expect(localStorage.setItem).toHaveBeenCalledWith('openclo-bom', expect.any(String));
    });
  });

  // -------------------------------------------------------------------------
  // clearBOM
  // -------------------------------------------------------------------------

  describe('clearBOM', () => {
    it('resets to initial state', () => {
      let state = getInitialState();
      state = { ...state, entries: [makeBOMEntry()], currency: 'EUR', lastExtractedAt: 123, extractedProjectVersion: 5 };
      state = bomReducer(state, clearBOM());
      expect(state.entries).toEqual([]);
      expect(state.currency).toBe('USD');
      expect(state.lastExtractedAt).toBeNull();
      expect(state.extractedProjectVersion).toBeNull();
    });

    it('persists to localStorage', () => {
      bomReducer(getInitialState(), clearBOM());
      expect(localStorage.setItem).toHaveBeenCalledWith('openclo-bom', expect.any(String));
    });
  });

  // -------------------------------------------------------------------------
  // rehydrateBOM
  // -------------------------------------------------------------------------

  describe('rehydrateBOM', () => {
    it('restores full state from a saved snapshot', () => {
      const saved: BOMState = {
        entries: [makeBOMEntry({ id: 'saved-1' })],
        currency: 'JPY',
        lastExtractedAt: 999,
        extractedProjectVersion: 7,
      };
      const state = bomReducer(getInitialState(), rehydrateBOM(saved));
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].id).toBe('saved-1');
      expect(state.currency).toBe('JPY');
      expect(state.lastExtractedAt).toBe(999);
      expect(state.extractedProjectVersion).toBe(7);
    });

    it('overwrites existing state fully', () => {
      let state = getInitialState();
      state = { ...state, entries: [makeBOMEntry()], currency: 'EUR' };
      const restored: BOMState = {
        entries: [],
        currency: 'USD',
        lastExtractedAt: null,
        extractedProjectVersion: null,
      };
      state = bomReducer(state, rehydrateBOM(restored));
      expect(state.entries).toEqual([]);
      expect(state.currency).toBe('USD');
    });
  });

  // -------------------------------------------------------------------------
  // persistBOM / loadBOM
  // -------------------------------------------------------------------------

  describe('persistBOM', () => {
    it('writes a versioned envelope to localStorage', () => {
      const bomState: BOMState = {
        entries: [makeBOMEntry()],
        currency: 'USD',
        lastExtractedAt: 100,
        extractedProjectVersion: 3,
      };
      persistBOM(bomState);
      expect(localStorage.setItem).toHaveBeenCalledWith('openclo-bom', expect.any(String));
      const stored = JSON.parse(mockStorage['openclo-bom']);
      expect(stored.version).toBe(1);
      expect(stored.data).toEqual(bomState);
    });

    it('does not throw when localStorage is unavailable', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new Error('storage unavailable');
        }),
        removeItem: vi.fn(),
      });
      expect(() => persistBOM(getInitialState())).not.toThrow();
      // Restore mock
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
      });
    });
  });

  describe('loadBOM', () => {
    it('returns null when localStorage has no entry', () => {
      expect(loadBOM()).toBeNull();
    });

    it('returns the saved state when the envelope is valid', () => {
      const bomState: BOMState = {
        entries: [makeBOMEntry()],
        currency: 'EUR',
        lastExtractedAt: 200,
        extractedProjectVersion: 4,
      };
      persistBOM(bomState);
      const loaded = loadBOM();
      expect(loaded).toEqual(bomState);
    });

    it('returns null for corrupt JSON', () => {
      mockStorage['openclo-bom'] = 'not-valid-json{{{';
      expect(loadBOM()).toBeNull();
    });

    it('returns null when version does not match', () => {
      mockStorage['openclo-bom'] = JSON.stringify({
        version: 99,
        data: { entries: [], currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null },
      });
      expect(loadBOM()).toBeNull();
    });

    it('returns null when data field is missing', () => {
      mockStorage['openclo-bom'] = JSON.stringify({ version: 1 });
      expect(loadBOM()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // NEW_PROJECT action
  // -------------------------------------------------------------------------

  describe('NEW_PROJECT', () => {
    it('resets to initial state', () => {
      let state = getInitialState();
      state = { ...state, entries: [makeBOMEntry()], currency: 'EUR', lastExtractedAt: 100, extractedProjectVersion: 5 };
      state = bomReducer(state, NEW_PROJECT());
      expect(state.entries).toEqual([]);
      expect(state.currency).toBe('USD');
      expect(state.lastExtractedAt).toBeNull();
      expect(state.extractedProjectVersion).toBeNull();
    });

    it('persists the reset state', () => {
      const state = { ...getInitialState(), entries: [makeBOMEntry()] };
      bomReducer(state, NEW_PROJECT());
      expect(localStorage.setItem).toHaveBeenCalledWith('openclo-bom', expect.any(String));
    });
  });

  // -------------------------------------------------------------------------
  // Selectors
  // -------------------------------------------------------------------------

  describe('selectors', () => {
    describe('selectBOMEntries', () => {
      it('returns the entries array', () => {
        const entries = [makeBOMEntry({ id: 'e1' }), makeBOMEntry({ id: 'e2' })];
        const root = makeRootState({ entries, currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null });
        expect(selectBOMEntries(root)).toEqual(entries);
      });

      it('returns empty array for initial state', () => {
        const root = makeRootState(getInitialState());
        expect(selectBOMEntries(root)).toEqual([]);
      });
    });

    describe('selectBOMByCategory', () => {
      it('filters entries by category', () => {
        const entries = [
          makeBOMEntry({ id: 'e1', category: 'fabric' }),
          makeBOMEntry({ id: 'e2', category: 'trim' }),
          makeBOMEntry({ id: 'e3', category: 'fabric' }),
        ];
        const root = makeRootState({ entries, currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null });
        const fabrics = selectBOMByCategory(root, 'fabric');
        expect(fabrics).toHaveLength(2);
        expect(fabrics[0].id).toBe('e1');
        expect(fabrics[1].id).toBe('e3');
      });

      it('returns empty array when no entries match', () => {
        const entries = [makeBOMEntry({ id: 'e1', category: 'fabric' })];
        const root = makeRootState({ entries, currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null });
        expect(selectBOMByCategory(root, 'trim')).toEqual([]);
      });
    });

    describe('selectTotalCost', () => {
      it('sums quantity * unitCost for all entries', () => {
        const entries = [
          makeBOMEntry({ id: 'e1', quantity: 2, unitCost: 10 }),
          makeBOMEntry({ id: 'e2', quantity: 5, unitCost: 3 }),
        ];
        const root = makeRootState({ entries, currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null });
        expect(selectTotalCost(root)).toBe(35); // 2*10 + 5*3
      });

      it('returns 0 for empty BOM', () => {
        const root = makeRootState(getInitialState());
        expect(selectTotalCost(root)).toBe(0);
      });
    });

    describe('selectTotalCostByColorway', () => {
      it('uses base cost when no colorway override exists', () => {
        const entries = [
          makeBOMEntry({ id: 'e1', quantity: 2, unitCost: 10, colorwayOverrides: {} }),
        ];
        const root = makeRootState({ entries, currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null });
        expect(selectTotalCostByColorway(root, 'cw-1')).toBe(20);
      });

      it('uses override unitCost when available', () => {
        const entries = [
          makeBOMEntry({
            id: 'e1',
            quantity: 2,
            unitCost: 10,
            colorwayOverrides: { 'cw-red': { unitCost: 15 } },
          }),
          makeBOMEntry({ id: 'e2', quantity: 3, unitCost: 5, colorwayOverrides: {} }),
        ];
        const root = makeRootState({ entries, currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null });
        expect(selectTotalCostByColorway(root, 'cw-red')).toBe(45); // 2*15 + 3*5
      });
    });

    describe('selectBOMIsStale', () => {
      it('returns true when extractedProjectVersion is null', () => {
        const root = makeRootState({
          entries: [],
          currency: 'USD',
          lastExtractedAt: null,
          extractedProjectVersion: null,
        }, 100);
        expect(selectBOMIsStale(root)).toBe(true);
      });

      it('returns true when versions differ', () => {
        const root = makeRootState({
          entries: [],
          currency: 'USD',
          lastExtractedAt: 100,
          extractedProjectVersion: 5,
        }, 10);
        expect(selectBOMIsStale(root)).toBe(true);
      });

      it('returns false when versions match', () => {
        const root = makeRootState({
          entries: [],
          currency: 'USD',
          lastExtractedAt: 100,
          extractedProjectVersion: 42,
        }, 42);
        expect(selectBOMIsStale(root)).toBe(false);
      });
    });

    describe('selectBOMForColorway', () => {
      it('resolves names and costs using colorway overrides', () => {
        const entries = [
          makeBOMEntry({
            id: 'e1',
            name: 'Cotton',
            unitCost: 10,
            quantity: 2,
            colorwayOverrides: { 'cw-red': { name: 'Red Cotton', unitCost: 14 } },
          }),
          makeBOMEntry({
            id: 'e2',
            name: 'Thread',
            unitCost: 2,
            quantity: 3,
            colorwayOverrides: {},
          }),
        ];
        const root = makeRootState({ entries, currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null });
        const resolved = selectBOMForColorway(root, 'cw-red');
        expect(resolved).toHaveLength(2);

        expect(resolved[0].resolvedName).toBe('Red Cotton');
        expect(resolved[0].resolvedUnitCost).toBe(14);
        expect(resolved[0].totalCost).toBe(28); // 2 * 14

        expect(resolved[1].resolvedName).toBe('Thread');
        expect(resolved[1].resolvedUnitCost).toBe(2);
        expect(resolved[1].totalCost).toBe(6); // 3 * 2
      });

      it('falls back to base values when no override exists', () => {
        const entries = [
          makeBOMEntry({ id: 'e1', name: 'Silk', unitCost: 20, quantity: 1 }),
        ];
        const root = makeRootState({ entries, currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null });
        const resolved = selectBOMForColorway(root, 'nonexistent-cw');
        expect(resolved[0].resolvedName).toBe('Silk');
        expect(resolved[0].resolvedUnitCost).toBe(20);
        expect(resolved[0].totalCost).toBe(20);
      });

      it('handles partial overrides (name only, cost only)', () => {
        const entries = [
          makeBOMEntry({
            id: 'e1',
            name: 'Cotton',
            unitCost: 10,
            quantity: 2,
            colorwayOverrides: { 'cw-1': { name: 'Navy Cotton' } },
          }),
        ];
        const root = makeRootState({ entries, currency: 'USD', lastExtractedAt: null, extractedProjectVersion: null });
        const resolved = selectBOMForColorway(root, 'cw-1');
        expect(resolved[0].resolvedName).toBe('Navy Cotton');
        expect(resolved[0].resolvedUnitCost).toBe(10); // fallback to base
        expect(resolved[0].totalCost).toBe(20);
      });
    });
  });
});
