/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import dockReducer, { pinAuto, unpinAuto, persistDocks, loadDocks, toggleDockSignaling, rehydrateDocks } from '../dockSlice';

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
  it('persistDocks → loadDocks round-trips (incl. signaling)', () => {
    const state = { pinnedExtra: { left: ['grade'], right: ['bom'] }, signaling: 'off' as const };
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
    const s = dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'off' }));
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
