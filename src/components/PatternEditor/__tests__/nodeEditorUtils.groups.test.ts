import { describe, expect, it } from 'vitest';
import type { PathCommand } from '../../../types/types';
import { anchorGroupOf, applyNodeMove, coincidentAnchorGroups } from '../nodeEditorUtils';

const square: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

const doubledCorner: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

describe('coincidentAnchorGroups', () => {
  it('finds no group when every anchor is unique', () => {
    const groups = [...coincidentAnchorGroups(square).values()];
    expect(groups.filter((members) => members.length >= 2)).toEqual([]);
  });

  it('groups a doubled vertex and skips Z', () => {
    const groups = coincidentAnchorGroups(doubledCorner);
    const multi = [...groups.values()].filter((members) => members.length >= 2);
    expect(multi).toEqual([[1, 2]]);
    expect([...groups.values()].flat()).not.toContain(5);
  });

  it('returns a group of three in commandIndex order', () => {
    const tripled: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    expect(anchorGroupOf(tripled, 2)).toEqual([1, 2, 3]);
  });

  it('does not group anchors that are merely close', () => {
    const nearly: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100.001, 0] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    expect(anchorGroupOf(nearly, 1)).toEqual([1]);
  });

  it('groups the anchor of a C command by its endpoint', () => {
    const curved: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 10, 20, 20, 100, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    expect(anchorGroupOf(curved, 1)).toEqual([1, 2]);
  });

  it('returns an empty group for a Z command', () => {
    expect(anchorGroupOf(square, 4)).toEqual([]);
  });
});

describe('applyNodeMove sobre un grupo coincidente', () => {
  it('moves every member of the group to the same coordinate', () => {
    const moved = applyNodeMove(doubledCorner, 1, 'anchor', { x: 140, y: 40 });
    expect(moved[1].values).toEqual([140, 40]);
    expect(moved[2].values).toEqual([140, 40]);
    expect(moved).toHaveLength(doubledCorner.length);
  });

  it('keeps the group intact so a second drag still finds it', () => {
    const moved = applyNodeMove(doubledCorner, 1, 'anchor', { x: 140, y: 40 });
    expect(anchorGroupOf(moved, 2)).toEqual([1, 2]);
  });

  it('leaves untouched commands byte-identical', () => {
    const moved = applyNodeMove(doubledCorner, 1, 'anchor', { x: 140, y: 40 });
    expect(moved[0].values).toEqual([0, 0]);
    expect(moved[3].values).toEqual([100, 100]);
    expect(moved[4].values).toEqual([0, 100]);
  });

  it('moves a lone anchor exactly as before', () => {
    const moved = applyNodeMove(square, 1, 'anchor', { x: 140, y: 40 });
    expect(moved[1].values).toEqual([140, 40]);
    expect(moved[2].values).toEqual([100, 100]);
  });

  it('does not group control-point moves', () => {
    const curved: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 10, 20, 20, 100, 0] },
      { type: 'C', values: [30, 30, 40, 40, 100, 0] },
      { type: 'Z', values: [] },
    ];
    const moved = applyNodeMove(curved, 1, 'cp1', { x: 55, y: 55 });
    expect(moved[1].values.slice(0, 2)).toEqual([55, 55]);
    expect(moved[2].values.slice(0, 2)).toEqual([30, 30]);
  });
});
