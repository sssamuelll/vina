// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PatternPiece } from '../../../types/types';
import { setup, mouseAt, pieceLocalToPattern } from './useEditPattern.undo.test';
import { importDXFContent } from '../../../utils/dxf';
import { extractNodes, anchorGroupOf } from '../nodeEditorUtils';
import { classifyEditableAnchors } from '../anchorRoles';

function pieceWithDoubledCorner(): PatternPiece {
  return {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, internals: [],
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ],
  } as PatternPiece;
}

describe('useEditPattern — borrado de un grupo coincidente', () => {
  it('selects the whole group when one member is clicked', () => {
    const piece = pieceWithDoubledCorner();
    const { ref } = setup(piece);
    act(() => {
      ref.current!.handleMouseDown(
        mouseAt(pieceLocalToPattern({ x: 100, y: 0 }, piece)),
      );
    });
    expect([...ref.current!.selectedNodes].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('deletes both members so the corner really disappears', () => {
    const piece = pieceWithDoubledCorner();
    const { store, ref } = setup(piece);
    act(() => {
      ref.current!.handleMouseDown(
        mouseAt(pieceLocalToPattern({ x: 100, y: 0 }, piece)),
      );
    });
    act(() => {
      ref.current!.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'Delete' }),
      );
    });
    const outline = store.getState().project.pieces[0].outline;
    expect(outline).toHaveLength(5);
    expect(outline.some((c) => c.values[0] === 100 && c.values[1] === 0)).toBe(false);
  });

  it('deletes nothing when the group would drop the piece below three anchors', () => {
    const piece = {
      ...pieceWithDoubledCorner(),
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    } as PatternPiece;
    const { store, ref } = setup(piece);
    const before = store.getState().project.pieces[0].outline;
    act(() => {
      ref.current!.handleMouseDown(
        mouseAt(pieceLocalToPattern({ x: 100, y: 0 }, piece)),
      );
    });
    act(() => {
      ref.current!.handleKeyDown(
        new KeyboardEvent('keydown', { key: 'Delete' }),
      );
    });
    expect(store.getState().project.pieces[0].outline).toEqual(before);
  });
});

const MARIA_FIXTURE = resolve(
  __dirname,
  '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf',
);

it('deletes a real corner of María pattern, group and all', () => {
  const pieces = importDXFContent(readFileSync(MARIA_FIXTURE, 'utf8'), {
    unit: 'auto', autoDetect: true,
  }).pieces;
  const piece = pieces.find((item) => item.outline.length > 100)!;
  const corner = classifyEditableAnchors(piece, extractNodes(piece))
    .find((item) => item.role === 'corner')!;
  const group = anchorGroupOf(piece.outline, corner.node.ref.commandIndex);
  expect(group.length).toBeGreaterThanOrEqual(2);

  const { store, ref } = setup(piece);
  const before = store.getState().project.pieces[0].outline.length;

  act(() => {
    ref.current!.handleMouseDown(
      mouseAt(pieceLocalToPattern(corner.node.position, piece)),
    );
  });
  act(() => {
    ref.current!.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete' }));
  });

  expect(store.getState().project.pieces[0].outline).toHaveLength(before - group.length);
});
