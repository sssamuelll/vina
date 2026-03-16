import { describe, it, expect } from 'vitest';
import reducer, {
  createGroup, renameGroup, deleteGroup, setGroupColor,
  addPiecesToGroup, removePiecesFromGroup,
  removePiece,
} from '../projectSlice';

function stateWith(pieces: { id: string }[], groups: { id: string; name: string; pieceIds: string[]; color: string }[] = []) {
  return {
    id: 'test', name: 'Test', pieces: pieces as any, seams: [], fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    avatarMode: 'model' as const, avatarModelUrl: null, isDirty: false,
    arrangementOverrides: {}, groups: groups.map(g => ({ ...g, createdAt: 0, updatedAt: 0 })),
  };
}

describe('projectSlice — groups CRUD', () => {
  it('createGroup adds a group with given pieces', () => {
    const state = stateWith([{ id: 'p1' }, { id: 'p2' }]);
    const next = reducer(state, createGroup({ name: 'Bodice', pieceIds: ['p1', 'p2'] }));
    expect(next.groups).toHaveLength(1);
    expect(next.groups[0].name).toBe('Bodice');
    expect(next.groups[0].pieceIds).toEqual(['p1', 'p2']);
    expect(next.groups[0].color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(next.isDirty).toBe(true);
  });

  it('createGroup filters out invalid piece IDs', () => {
    const state = stateWith([{ id: 'p1' }]);
    const next = reducer(state, createGroup({ name: 'G', pieceIds: ['p1', 'nonexistent'] }));
    expect(next.groups[0].pieceIds).toEqual(['p1']);
  });

  it('renameGroup updates name', () => {
    const state = stateWith([], [{ id: 'g1', name: 'Old', pieceIds: [], color: '#ff0000' }]);
    const next = reducer(state, renameGroup({ groupId: 'g1', name: 'New' }));
    expect(next.groups[0].name).toBe('New');
  });

  it('deleteGroup removes group without affecting pieces', () => {
    const state = stateWith([{ id: 'p1' }], [{ id: 'g1', name: 'G', pieceIds: ['p1'], color: '#ff0000' }]);
    const next = reducer(state, deleteGroup({ groupId: 'g1' }));
    expect(next.groups).toHaveLength(0);
    expect(next.pieces).toHaveLength(1);
  });

  it('setGroupColor changes color', () => {
    const state = stateWith([], [{ id: 'g1', name: 'G', pieceIds: [], color: '#ff0000' }]);
    const next = reducer(state, setGroupColor({ groupId: 'g1', color: '#00ff00' }));
    expect(next.groups[0].color).toBe('#00ff00');
  });

  it('addPiecesToGroup adds without duplicates', () => {
    const state = stateWith([{ id: 'p1' }, { id: 'p2' }], [{ id: 'g1', name: 'G', pieceIds: ['p1'], color: '#ff0000' }]);
    const next = reducer(state, addPiecesToGroup({ groupId: 'g1', pieceIds: ['p1', 'p2'] }));
    expect(next.groups[0].pieceIds).toEqual(['p1', 'p2']);
  });

  it('removePiecesFromGroup removes specified pieces', () => {
    const state = stateWith([], [{ id: 'g1', name: 'G', pieceIds: ['p1', 'p2', 'p3'], color: '#ff0000' }]);
    const next = reducer(state, removePiecesFromGroup({ groupId: 'g1', pieceIds: ['p2'] }));
    expect(next.groups[0].pieceIds).toEqual(['p1', 'p3']);
  });

  it('removePiece auto-cleans piece from all groups', () => {
    const state = stateWith(
      [{ id: 'p1' }, { id: 'p2' }],
      [
        { id: 'g1', name: 'A', pieceIds: ['p1', 'p2'], color: '#ff0000' },
        { id: 'g2', name: 'B', pieceIds: ['p1'], color: '#00ff00' },
      ],
    );
    const next = reducer(state, removePiece('p1'));
    expect(next.groups[0].pieceIds).toEqual(['p2']);
    expect(next.groups[1].pieceIds).toEqual([]);
  });

  it('piece can belong to multiple groups', () => {
    let state = stateWith([{ id: 'p1' }]);
    state = reducer(state, createGroup({ name: 'A', pieceIds: ['p1'] }));
    state = reducer(state, createGroup({ name: 'B', pieceIds: ['p1'] }));
    expect(state.groups).toHaveLength(2);
    expect(state.groups[0].pieceIds).toContain('p1');
    expect(state.groups[1].pieceIds).toContain('p1');
  });
});
