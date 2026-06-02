/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import dockReducer, { pinAuto, unpinAuto, persistDocks, loadDocks } from '../dockSlice';

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
  it('persistDocks → loadDocks round-trips', () => {
    const state = { pinnedExtra: { left: ['grade'], right: ['bom'] } };
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
