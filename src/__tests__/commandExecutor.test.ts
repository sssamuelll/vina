import { describe, it, expect } from 'vitest';
import { executeCommands } from '../copilot/commandExecutor';
import { PatternPiece } from '../types/types';

// Mock dispatch
function createMockDispatch() {
  const calls: any[] = [];
  const dispatch = (action: any) => { calls.push(action); return action; };
  return { dispatch: dispatch as any, calls };
}

function makePiece(id: string, name = 'Test'): PatternPiece {
  return {
    id,
    name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('executeCommands', () => {
  it('creates a piece', () => {
    const { dispatch, calls } = createMockDispatch();
    const cmds: any[] = [{
      type: 'create_piece',
      piece: {
        name: 'New Piece',
        outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
        internals: [],
        position: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
      },
    }];
    const result = executeCommands(cmds, dispatch, []);
    expect(result.executed).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(calls.length).toBe(2); // addPiece + selectPiece
  });

  it('moves a piece', () => {
    const { dispatch } = createMockDispatch();
    const pieces = [makePiece('p1')];
    const cmds: any[] = [{ type: 'move_piece', pieceId: 'p1', position: { x: 50, y: 50 } }];
    const result = executeCommands(cmds, dispatch, pieces);
    expect(result.executed).toBe(1);
  });

  it('renames a piece', () => {
    const { dispatch } = createMockDispatch();
    const pieces = [makePiece('p1')];
    const cmds: any[] = [{ type: 'rename_piece', pieceId: 'p1', name: 'Back Panel' }];
    const result = executeCommands(cmds, dispatch, pieces);
    expect(result.executed).toBe(1);
  });

  it('deletes a piece', () => {
    const { dispatch } = createMockDispatch();
    const cmds: any[] = [{ type: 'delete_piece', pieceId: 'p1' }];
    const result = executeCommands(cmds, dispatch, [makePiece('p1')]);
    expect(result.executed).toBe(1);
  });

  it('scales a piece', () => {
    const { dispatch, calls } = createMockDispatch();
    const pieces = [makePiece('p1')];
    const cmds: any[] = [{ type: 'scale_piece', pieceId: 'p1', factor: 1.5 }];
    const result = executeCommands(cmds, dispatch, pieces);
    expect(result.executed).toBe(1);
    // Check scaled values
    const updateAction = calls.find((c: any) => c.payload?.outline);
    if (updateAction) {
      const firstL = updateAction.payload.outline.find((c: any) => c.type === 'L');
      expect(firstL.values[0]).toBe(150); // 100 * 1.5
    }
  });

  it('sets seam allowance', () => {
    const { dispatch } = createMockDispatch();
    const pieces = [makePiece('p1')];
    const cmds: any[] = [{ type: 'set_seam_allowance', pieceId: 'p1', mm: 15 }];
    const result = executeCommands(cmds, dispatch, pieces);
    expect(result.executed).toBe(1);
  });

  it('adds internal line', () => {
    const { dispatch } = createMockDispatch();
    const cmds: any[] = [{
      type: 'add_internal',
      pieceId: 'p1',
      line: { type: 'grainline', path: [{ type: 'M', values: [50, 0] }, { type: 'L', values: [50, 100] }] },
    }];
    const result = executeCommands(cmds, dispatch, [makePiece('p1')]);
    expect(result.executed).toBe(1);
  });

  it('message command does not execute', () => {
    const { dispatch } = createMockDispatch();
    const cmds: any[] = [{ type: 'message', text: 'hello' }];
    const result = executeCommands(cmds, dispatch, []);
    expect(result.executed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('reports error for missing piece', () => {
    const { dispatch } = createMockDispatch();
    const cmds: any[] = [{ type: 'rename_piece', pieceId: 'nonexistent', name: 'X' }];
    const result = executeCommands(cmds, dispatch, []);
    expect(result.executed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not found');
  });

  it('reports error for unknown command type', () => {
    const { dispatch } = createMockDispatch();
    const cmds: any[] = [{ type: 'fly_to_moon' }];
    const result = executeCommands(cmds, dispatch, []);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Unknown');
  });

  it('handles multiple commands', () => {
    const { dispatch } = createMockDispatch();
    const pieces = [makePiece('p1'), makePiece('p2')];
    const cmds: any[] = [
      { type: 'rename_piece', pieceId: 'p1', name: 'A' },
      { type: 'rename_piece', pieceId: 'p2', name: 'B' },
      { type: 'delete_piece', pieceId: 'p1' },
    ];
    const result = executeCommands(cmds, dispatch, pieces);
    expect(result.executed).toBe(3);
    expect(result.errors).toHaveLength(0);
  });
});
