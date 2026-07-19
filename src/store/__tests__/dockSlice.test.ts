/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import dockReducer, {
  pinAuto, unpinAuto, persistDocks, loadDocks, toggleDockSignaling,
  rehydrateDocks, addDockTool, removeDockTool, resetDockTools,
  reorderDockTool, LEGACY_DEFAULT_DOCK_2D_IDS, DEFAULT_DOCK_2D_IDS,
  migrateDefaultDockTools,
} from '../dockSlice';

const initial = () => dockReducer(undefined, { type: '@@INIT' });

describe('dockSlice reducers', () => {
  it('pinAuto adds an id once (idempotent)', () => {
    let s = dockReducer(initial(), pinAuto({ side: 'left', id: 'grade' }));
    s = dockReducer(s, pinAuto({ side: 'left', id: 'grade' }));
    expect(s.pinnedExtra.left).toEqual(['grade']);
    expect(s.pinnedExtra.right).toEqual([]);
  });
  it('unpinAuto removes the id', () => {
    let s = dockReducer(initial(), pinAuto({ side: 'right', id: 'bom' }));
    s = dockReducer(s, unpinAuto({ side: 'right', id: 'bom' }));
    expect(s.pinnedExtra.right).toEqual([]);
  });
});

describe('dockSlice persistence', () => {
  beforeEach(() => localStorage.clear());
  it('persistDocks → loadDocks round-trips (incl. signaling + tools2d)', () => {
    const state = { pinnedExtra: { left: ['grade'], right: ['bom'] }, signaling: 'off' as const, tools2d: ['select', 'notch'] };
    persistDocks(state);
    expect(loadDocks()).toEqual(state);
  });
  it('loadDocks returns null when nothing stored', () => {
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for a corrupt envelope', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 99, data: { pinnedExtra: { left: [], right: [] } } }));
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for wrong-typed data', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: 'nope', right: [] } } }));
    expect(loadDocks()).toBeNull();
  });
});

describe('dockSlice signaling', () => {
  beforeEach(() => localStorage.clear());

  it('defaults signaling to subtle', () => {
    expect(initial().signaling).toBe('subtle');
  });

  it('toggleDockSignaling flips subtle → off → subtle', () => {
    let s = dockReducer(initial(), toggleDockSignaling());
    expect(s.signaling).toBe('off');
    s = dockReducer(s, toggleDockSignaling());
    expect(s.signaling).toBe('subtle');
  });

  it('rehydrateDocks sets signaling', () => {
    const s = dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'off', tools2d: [...DEFAULT_DOCK_2D_IDS] }));
    expect(s.signaling).toBe('off');
  });

  it('loadDocks defaults signaling to subtle for a pre-3c envelope (no signaling key)', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] } } }));
    const loaded = loadDocks();
    expect(loaded).not.toBeNull();
    expect(loaded!.signaling).toBe('subtle');
  });

  it('loadDocks discards an envelope with an invalid signaling value', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, signaling: 'loud' } }));
    expect(loadDocks()).toBeNull();
  });

  it('NEW_PROJECT does not reset signaling', () => {
    const off = dockReducer(initial(), toggleDockSignaling());
    const after = dockReducer(off, { type: 'global/newProject' });
    expect(after.signaling).toBe('off');
  });
});

describe('dockSlice tools2d', () => {
  beforeEach(() => localStorage.clear());

  it('defaults tools2d to the 8 ids with editPattern immediately after select', () => {
    expect(initial().tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
    expect(DEFAULT_DOCK_2D_IDS).toEqual([
      'select', 'editPattern', 'pen', 'line',
      'rectangle', 'scissors', 'measure', 'seam',
    ]);
  });

  it('migrates only the exact ordered historical default', () => {
    expect(migrateDefaultDockTools(LEGACY_DEFAULT_DOCK_2D_IDS)).toEqual(DEFAULT_DOCK_2D_IDS);
    expect(migrateDefaultDockTools([...LEGACY_DEFAULT_DOCK_2D_IDS].reverse()))
      .toEqual([...LEGACY_DEFAULT_DOCK_2D_IDS].reverse());
    expect(migrateDefaultDockTools(['select', 'pen', 'notch']))
      .toEqual(['select', 'pen', 'notch']);
  });

  it('does not duplicate editPattern in an already-current or customized dock', () => {
    expect(migrateDefaultDockTools(DEFAULT_DOCK_2D_IDS))
      .toEqual(DEFAULT_DOCK_2D_IDS);
    expect(migrateDefaultDockTools(DEFAULT_DOCK_2D_IDS)
      .filter((id) => id === 'editPattern')).toHaveLength(1);
  });

  it('loadDocks migrates a persisted historical default and round-trips it as v1', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({
      version: 1,
      data: {
        pinnedExtra: { left: [], right: [] },
        signaling: 'subtle',
        tools2d: [...LEGACY_DEFAULT_DOCK_2D_IDS],
      },
    }));
    const loaded = loadDocks();
    expect(loaded?.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
    persistDocks(loaded!);
    expect(loadDocks()?.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('addDockTool appends a new id once (idempotent)', () => {
    let s = dockReducer(initial(), addDockTool('notch'));
    s = dockReducer(s, addDockTool('notch'));
    expect(s.tools2d.filter((x) => x === 'notch')).toEqual(['notch']);
    expect(s.tools2d).toContain('notch');
  });

  it('removeDockTool removes an id', () => {
    const s = dockReducer(initial(), removeDockTool('pen'));
    expect(s.tools2d).not.toContain('pen');
  });

  it('removeDockTool is a no-op when it would empty the set', () => {
    let s = dockReducer(initial(), resetDockTools());
    for (const id of [...s.tools2d].filter((x) => x !== 'select')) s = dockReducer(s, removeDockTool(id));
    expect(s.tools2d).toEqual(['select']);
    s = dockReducer(s, removeDockTool('select'));
    expect(s.tools2d).toEqual(['select']); // last one stays
  });

  it('resetDockTools restores the defaults', () => {
    let s = dockReducer(initial(), addDockTool('notch'));
    s = dockReducer(s, removeDockTool('pen'));
    s = dockReducer(s, resetDockTools());
    expect(s.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('rehydrateDocks sets tools2d', () => {
    const s = dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: ['select', 'seam'] }));
    expect(s.tools2d).toEqual(['select', 'seam']);
  });

  it('loadDocks defaults tools2d for a pre-slice-4 envelope (no tools2d key)', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, signaling: 'subtle' } }));
    const loaded = loadDocks();
    expect(loaded).not.toBeNull();
    expect(loaded!.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('loadDocks discards an envelope with a non-array tools2d', () => {
    localStorage.setItem('openclo-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: 'nope' } }));
    expect(loadDocks()).toBeNull();
  });

  it('NEW_PROJECT does not reset tools2d', () => {
    const added = dockReducer(initial(), addDockTool('notch'));
    const after = dockReducer(added, { type: 'global/newProject' });
    expect(after.tools2d).toContain('notch');
  });
});

describe('dockSlice reorderDockTool', () => {
  const seed = (ids: string[]) => dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: ids }));

  it('up-move: dragging a lower tool onto a higher one lands it before the target', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'line', toId: 'select' }));
    expect(s.tools2d).toEqual(['line', 'select', 'pen']);
  });

  it('down-move: dragging a higher tool onto a lower one lands it immediately before the target', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'select', toId: 'line' }));
    expect(s.tools2d).toEqual(['pen', 'select', 'line']);
  });

  it('fromId === toId is a no-op', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'pen', toId: 'pen' }));
    expect(s.tools2d).toEqual(['select', 'pen', 'line']);
  });

  it('an absent id is a no-op', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'zzz', toId: 'select' }));
    expect(s.tools2d).toEqual(['select', 'pen', 'line']);
  });

  it('preserves length', () => {
    const s = dockReducer(seed(['select', 'pen', 'line']), reorderDockTool({ fromId: 'pen', toId: 'select' }));
    expect(s.tools2d).toHaveLength(3);
  });
});
