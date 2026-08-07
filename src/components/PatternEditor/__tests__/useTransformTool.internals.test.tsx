// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InternalLine, PatternPiece } from '../../../types/types';
import { computeNotchAnchor } from '../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS, generateNotchPath } from '../../../utils/notches';
import { useTransformTool } from '../useTransformTool';

afterEach(cleanup);

// The transform box scales and rotates the piece as a plane. Before this, it
// rewrote the outline alone, so every internal — grainline, dart, piquete —
// stayed at its old coordinates while the outline moved out from under it.
// Same stranding as the nota de María #171, reached by a different handle.

const OUTLINE = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

function piece(): PatternPiece {
  const notch: InternalLine = {
    id: 'n1',
    type: 'notch',
    path: generateNotchPath({ x: 100, y: 0 }, { x: 0, y: 1 }, DEFAULT_NOTCH_OPTIONS),
    notchOptions: DEFAULT_NOTCH_OPTIONS,
    notchAnchor: computeNotchAnchor(OUTLINE, { x: 100, y: 0 })!,
  };
  const grainline: InternalLine = {
    id: 'g1',
    type: 'grainline',
    path: [{ type: 'M', values: [50, 20] }, { type: 'L', values: [50, 180] }],
  };
  return {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0,
    outline: OUTLINE, internals: [notch, grainline],
    mirrored: false, seamAllowance: 0, active: true,
  } as unknown as PatternPiece;
}

type Update = {
  id: string;
  outline: PatternPiece['outline'];
  position: { x: number; y: number };
  internals: InternalLine[];
};

function setup() {
  const onTransform = vi.fn();
  const hook = renderHook(() =>
    useTransformTool(1, { x: 0, y: 0 }, [piece()], ['p'], onTransform));
  return { hook, onTransform };
}

function pointer(x: number, y: number, shiftKey = false) {
  return {
    button: 0, shiftKey, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

/** Drag a handle from `from` to `to` and return the emitted update. */
function drag(
  hook: ReturnType<typeof setup>['hook'],
  onTransform: ReturnType<typeof setup>['onTransform'],
  from: [number, number],
  to: [number, number],
): Update {
  act(() => { hook.result.current.handleMouseDown(pointer(...from)); });
  act(() => { hook.result.current.handleMouseMove(pointer(...to)); });
  act(() => { hook.result.current.handleMouseUp(); });
  expect(onTransform).toHaveBeenCalledTimes(1);
  return (onTransform.mock.calls[0][0] as Update[])[0];
}

const byId = (internals: InternalLine[], id: string) => internals.find(l => l.id === id)!;

describe('useTransformTool carries the internals with the outline', () => {
  it('scales a grainline by the same factor as the outline', () => {
    const { hook, onTransform } = setup();
    // 'e' handle sits at (200,100) on a 200×200 box; the pivot is the
    // OPPOSITE side — the west edge x=0 (maria-198) — so the internals must
    // scale about it too. Anchor at x=0 → new x = old x × scaleX.
    const u = drag(hook, onTransform, [200, 100], [300, 100]);

    const scaleX = u.outline[1].values[0] / 200;
    expect(scaleX).toBeGreaterThan(1);
    expect(byId(u.internals, 'g1').path[0].values[0]).toBeCloseTo(50 * scaleX);
    expect(byId(u.internals, 'g1').path[0].values[1]).toBeCloseTo(20);
  });

  it('keeps the notch on its edge and re-derives its anchor', () => {
    const { hook, onTransform } = setup();
    const u = drag(hook, onTransform, [200, 100], [300, 100]);

    const scaleX = u.outline[1].values[0] / 200;
    const notch = byId(u.internals, 'n1');
    // The top edge y does not move under a horizontal scale; the notch x
    // scales about the west anchor like every other coordinate.
    expect(notch.path[0].values[0]).toBeCloseTo(100 * scaleX);
    expect(notch.path[0].values[1]).toBeCloseTo(0);
    // The anchor corner (0,0) IS the pivot side: it stays put, and the arc
    // distance to the notch scales.
    expect(notch.notchAnchor!.refPoint.x).toBeCloseTo(0);
    expect(notch.notchAnchor!.distanceMm).toBeCloseTo(100 * scaleX);
  });

  it('redraws the notch mark at its true size instead of stretching it', () => {
    const { hook, onTransform } = setup();
    const u = drag(hook, onTransform, [200, 100], [300, 100]);

    // A slit is base → base + normal × length. Scaling the piece must not
    // make the piquete itself longer: it is a mark, not pattern geometry.
    const [bx, by] = byId(u.internals, 'n1').path[0].values;
    const [tx, ty] = byId(u.internals, 'n1').path[1].values;
    expect(Math.hypot(tx - bx, ty - by)).toBeCloseTo(DEFAULT_NOTCH_OPTIONS.length);
  });

  it('rotates the internals with the outline', () => {
    const { hook, onTransform } = setup();
    // The rotate handle sits one arm above the box top (100,-25); swing it a
    // quarter turn, to straight-right of the center (100,100).
    const u = drag(hook, onTransform, [100, -25], [300, 100]);

    const grain = byId(u.internals, 'g1').path[0].values;
    // (50,20) about (100,100) by +90°: (100+80, 100-50) = (180,50).
    expect(grain[0]).toBeCloseTo(180);
    expect(grain[1]).toBeCloseTo(50);
  });
});
