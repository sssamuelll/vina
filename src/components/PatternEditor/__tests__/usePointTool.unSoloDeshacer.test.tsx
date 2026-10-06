// @vitest-environment jsdom
/**
 * Poner un punto y terminar de ponerlo con su cota es UNA entrada de deshacer
 * (spec 2026-10-02 § 5.2, P3b; decisión 5 del plan). Con los verbos de verdad
 * de `useEditPattern`, el store de verdad y el middleware de deshacer: los
 * tests de la herramienta usan verbos de mentira y no podían caer si el lote
 * dejaba de viajar (revisión final de P3b, hallazgo 4).
 *
 * El reloj va de por medio a propósito: dos `updatePiece` a menos de 500 ms se
 * funden solos (`UNDO_BATCH_MS`), y así un e2e rápido pasaba aunque el lote no
 * existiera. A los 2 s solo el lote los mantiene juntos.
 */
import React, { forwardRef, useImperativeHandle } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import editorReducer, { setActiveTool } from '../../../store/editorSlice';
import toolReducer from '../../../store/toolSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { undoMiddleware, getUndoLength } from '../../../store/undoMiddleware';
import { useEditPattern } from '../useEditPattern';
import { usePointTool } from '../usePointTool';
import type { PatternPiece, Point2D, Tool2D } from '../../../types/types';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type PointApi = ReturnType<typeof usePointTool>;

const cuadrado: PatternPiece = {
  id: 'p1', name: 'P1',
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
  ],
  internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
} as PatternPiece;

interface Estado { project: { pieces: PatternPiece[] } }

const Herramientas = forwardRef<PointApi>(function Herramientas(_props, ref) {
  const pieces = useSelector((s: Estado) => s.project.pieces);
  const edit = useEditPattern(1, { x: 0, y: 0 });
  const point = usePointTool(1, { x: 0, y: 0 }, pieces, {
    addPointOnSegment: edit.addPointOnSegment,
    reinsertarPunto: edit.reinsertarPunto,
    convertSegment: edit.convertSegment,
    convertSegmentToPoints: edit.convertSegmentToPoints,
  });
  useImperativeHandle(ref, () => point, [point]);
  return <svg />;
});

function montar() {
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer, tools: toolReducer, copilotUI: copilotUIReducer },
    middleware: (gDM) => gDM({ serializableCheck: false }).concat(undoMiddleware),
  });
  store.dispatch(loadProject({
    ...store.getState().project, id: 't', name: 't', pieces: [cuadrado], seams: [], fabrics: [],
    createdAt: 0, updatedAt: 0,
  }));
  store.dispatch(setActiveTool('point' as Tool2D));
  const ref = React.createRef<PointApi>();
  render(<Provider store={store}><Herramientas ref={ref} /></Provider>);
  return { store, ref };
}

const mouseAt = (p: Point2D) => ({
  button: 0, clientX: p.x, clientY: p.y,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
}) as unknown as React.MouseEvent<SVGSVGElement>;

describe('poner el punto y terminar de ponerlo: un solo deshacer', () => {
  it('aunque pasen 2 s entre el clic y el número, Ctrl+Z quita el punto entero', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const { store, ref } = montar();
    const contorno = () => store.getState().project.pieces[0].outline;
    const antes = getUndoLength();

    act(() => ref.current!.handleMouseDown(mouseAt({ x: 30, y: 0 })));
    act(() => ref.current!.handleMouseUp(mouseAt({ x: 30, y: 0 })));
    expect(contorno()).toHaveLength(6);

    vi.setSystemTime(1_002_000);
    act(() => ref.current!.moverPuesto(70));
    expect(contorno()[1].values).toEqual([70, 0]);
    act(() => ref.current!.terminarPuesto());

    expect(getUndoLength()).toBe(antes + 1);
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(contorno()).toHaveLength(5);
  });
});
