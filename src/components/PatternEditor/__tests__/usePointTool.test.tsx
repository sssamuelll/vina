// @vitest-environment jsdom
/**
 * usePointTool — la gramática del tool Punto (maria-203):
 * press-track-release con el release mandando, guard de ancla, curva solo
 * con el chip 'point', Esc cancela la colocación armada, y el candado se
 * delega al verbo (una sola puerta).
 */
import React, { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import editorReducer, { setActiveTool } from '../../../store/editorSlice';
import { usePointTool } from '../usePointTool';
import type { PatternPiece, Point2D, Tool2D } from '../../../types/types';

type PointApi = ReturnType<typeof usePointTool>;

const verbs = {
  addPointOnSegment: vi.fn(),
  convertSegment: vi.fn(),
  convertSegmentToPoints: vi.fn(),
};

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p1',
    name: 'P1',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },    // 1: top
      { type: 'L', values: [100, 100] },  // 2: right
      { type: 'L', values: [0, 100] },    // 3: bottom
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as PatternPiece;
}

const curvedPiece = makePiece({
  id: 'curved',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'C', values: [30, -40, 70, -40, 100, 0] }, // 1: curva (t=0.5 → (50,-30))
    { type: 'L', values: [100, 100] },                 // 2
    { type: 'L', values: [0, 100] },                   // 3
    { type: 'Z', values: [] },
  ],
});

const Harness = forwardRef<PointApi, { pieces: PatternPiece[] }>(function Harness({ pieces }, ref) {
  const api = usePointTool(1, { x: 0, y: 0 }, pieces, verbs);
  useImperativeHandle(ref, () => api, [api]);
  return <svg />;
});

function setup(pieces: PatternPiece[]) {
  const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
  store.dispatch(setActiveTool('point' as Tool2D));
  const ref = React.createRef<PointApi>();
  render(<Provider store={store}><Harness ref={ref} pieces={pieces} /></Provider>);
  return { store, ref };
}

const mouseAt = (point: Point2D): React.MouseEvent<SVGSVGElement> =>
  ({
    button: 0, clientX: point.x, clientY: point.y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>);

const click = (ref: React.RefObject<PointApi | null>, at: Point2D) => {
  act(() => ref.current!.handleMouseDown(mouseAt(at)));
  act(() => ref.current!.handleMouseUp(mouseAt(at)));
};

beforeEach(() => {
  verbs.addPointOnSegment.mockClear();
  verbs.convertSegment.mockClear();
  verbs.convertSegmentToPoints.mockClear();
});

describe('usePointTool — chip "point" (default)', () => {
  it('clic sobre un lado recto despacha addPointOnSegment con commandIndex y t', () => {
    const { ref } = setup([makePiece()]);
    click(ref, { x: 50, y: 0 });
    expect(verbs.addPointOnSegment).toHaveBeenCalledTimes(1);
    const [cmdIdx, t, pieceId] = verbs.addPointOnSegment.mock.calls[0];
    expect(cmdIdx).toBe(1);
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.6);
    expect(pieceId).toBe('p1');
  });

  it('clic sobre un lado curvo también inserta (subdivide la curva)', () => {
    const { ref } = setup([curvedPiece]);
    click(ref, { x: 50, y: -30 });
    expect(verbs.addPointOnSegment).toHaveBeenCalledTimes(1);
    expect(verbs.addPointOnSegment.mock.calls[0][0]).toBe(1);
  });

  it('un ancla existente dentro del radio NO es objetivo (el guard que refuta el doble clic)', () => {
    const { ref } = setup([makePiece()]);
    act(() => ref.current!.handleMouseMove(mouseAt({ x: 0, y: 0 })));
    expect(ref.current!.hover?.reason).toBe('anchor');
    click(ref, { x: 0, y: 0 });
    expect(verbs.addPointOnSegment).not.toHaveBeenCalled();
  });

  it('mouseup sin mousedown previo (sin armar) no despacha nada', () => {
    const { ref } = setup([makePiece()]);
    act(() => ref.current!.handleMouseUp(mouseAt({ x: 50, y: 0 })));
    expect(verbs.addPointOnSegment).not.toHaveBeenCalled();
  });

  it('Esc con la colocación armada la cancela — el release posterior no escribe', () => {
    const { ref } = setup([makePiece()]);
    act(() => ref.current!.handleMouseDown(mouseAt({ x: 50, y: 0 })));
    expect(ref.current!.armed).toBe(true);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => ref.current!.handleKeyDown(esc));
    expect(ref.current!.armed).toBe(false);
    act(() => ref.current!.handleMouseUp(mouseAt({ x: 50, y: 0 })));
    expect(verbs.addPointOnSegment).not.toHaveBeenCalled();
  });

  it('pieza bloqueada: el clic llega al verbo — el candado y el toast viven en la puerta común', () => {
    const { ref } = setup([makePiece({ locked: true })]);
    act(() => ref.current!.handleMouseMove(mouseAt({ x: 50, y: 0 })));
    expect(ref.current!.hover?.reason).toBe('locked');
    expect(ref.current!.getCursor()).toBe('not-allowed');
    click(ref, { x: 50, y: 0 });
    expect(verbs.addPointOnSegment).toHaveBeenCalledTimes(1);
  });
});

describe('usePointTool — chips de conversión', () => {
  it('chip curvePoints sobre un lado recto despacha convertSegmentToPoints', () => {
    const { store, ref } = setup([makePiece()]);
    act(() => { store.dispatch(setToolOption({ toolId: 'point', optionId: 'mode', value: 'curvePoints' })); });
    click(ref, { x: 50, y: 0 });
    expect(verbs.convertSegmentToPoints).toHaveBeenCalledWith(1, 'p1');
    expect(verbs.addPointOnSegment).not.toHaveBeenCalled();
  });

  it('chip bezier sobre un lado recto despacha convertSegment(…, true)', () => {
    const { store, ref } = setup([makePiece()]);
    act(() => { store.dispatch(setToolOption({ toolId: 'point', optionId: 'mode', value: 'bezier' })); });
    click(ref, { x: 50, y: 0 });
    expect(verbs.convertSegment).toHaveBeenCalledWith(1, true, 'p1');
  });

  it('chip de conversión sobre un lado YA curvo: not-allowed y sin despacho', () => {
    const { store, ref } = setup([curvedPiece]);
    act(() => { store.dispatch(setToolOption({ toolId: 'point', optionId: 'mode', value: 'curvePoints' })); });
    act(() => ref.current!.handleMouseMove(mouseAt({ x: 50, y: -30 })));
    expect(ref.current!.hover?.reason).toBe('curveMode');
    expect(ref.current!.getCursor()).toBe('not-allowed');
    click(ref, { x: 50, y: -30 });
    expect(verbs.convertSegmentToPoints).not.toHaveBeenCalled();
  });
});
