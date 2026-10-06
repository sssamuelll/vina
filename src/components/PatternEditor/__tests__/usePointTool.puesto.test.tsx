// @vitest-environment jsdom
/**
 * El punto recién puesto trae su cota (spec 2026-10-02 § 5.2, P3b): la
 * distancia a la esquina, escribible, que vive hasta el siguiente clic o Esc.
 * Es terminar de ponerlo, no editar un punto que ya existía: moverlo es volver
 * a ponerlo desde la pieza de antes, y todo cabe en un solo deshacer.
 */
import React, { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import editorReducer, { setActiveTool } from '../../../store/editorSlice';
import projectReducer, { setLayerLocked } from '../../../store/projectSlice';
import { undoMiddleware } from '../../../store/undoMiddleware';
import { usePointTool } from '../usePointTool';
import { splitSegmentAt } from '../nodeEditorUtils';
import { suscribirNoPasoNada, type AvisoMudo } from '../noPasoNada';
import type { PatternPiece, Point2D, Tool2D } from '../../../types/types';

afterEach(cleanup);

type PointApi = ReturnType<typeof usePointTool>;
interface Accion { type: string; payload?: unknown }

const cuadrado = (over: Partial<PatternPiece> = {}): PatternPiece => ({
  id: 'p1', name: 'P1',
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
  ],
  internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
  layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0, ...over,
} as PatternPiece);

function montar(inicial: PatternPiece = cuadrado(), opciones: { capaBloqueada?: boolean } = {}) {
  const acciones: Accion[] = [];
  const captura: Middleware = () => next => action => {
    acciones.push(action as Accion);
    return next(action);
  };
  const store = configureStore({
    reducer: { tools: toolReducer, editor: editorReducer, project: projectReducer },
    middleware: gDM => gDM({ serializableCheck: false }).concat(captura, undoMiddleware),
  });
  store.dispatch(setActiveTool('point' as Tool2D));
  if (opciones.capaBloqueada) store.dispatch(setLayerLocked({ layer: 1, locked: true }));
  // Como Redux: lo que escribe el verbo está en el render siguiente.
  let piezas = [inicial];
  const verbs = {
    addPointOnSegment: vi.fn((k: number, t: number, _pieceId?: string, _lote?: string) => {
      const outline = splitSegmentAt(piezas[0].outline, k, t);
      piezas = [{ ...piezas[0], outline }];
      return outline;
    }),
    reinsertarPunto: vi.fn((base: PatternPiece, k: number, t: number, _lote?: string) => {
      const outline = splitSegmentAt(base.outline, k, t);
      piezas = [{ ...base, outline }];
      return outline;
    }),
    convertSegment: vi.fn(),
    convertSegmentToPoints: vi.fn(),
  };
  const Harness = forwardRef<PointApi>(function Harness(_props, r) {
    const api = usePointTool(1, { x: 0, y: 0 }, piezas, verbs);
    useImperativeHandle(r, () => api, [api]);
    return <svg />;
  });
  const ref = React.createRef<PointApi>();
  const view = render(<Provider store={store}><Harness ref={ref} /></Provider>);
  const cambiaPiezas = (nuevas: PatternPiece[]) => {
    piezas = nuevas;
    view.rerender(<Provider store={store}><Harness ref={ref} /></Provider>);
  };
  return { store, ref, verbs, acciones, cambiaPiezas };
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

const arrastre = (ref: React.RefObject<PointApi | null>, desde: Point2D, hasta: Point2D) => {
  act(() => ref.current!.handleMouseDown(mouseAt(desde)));
  act(() => ref.current!.handleMouseMove(mouseAt(hasta)));
  act(() => ref.current!.handleMouseUp(mouseAt(hasta)));
};

const tipos = (acciones: Accion[]) => acciones.map(a => a.type);

describe('el punto recién puesto trae su cota', () => {
  it('el clic pone el punto y abre su cota: a la esquina más cercana, con el lado de techo', () => {
    const h = montar();
    click(h.ref, { x: 30, y: 0 });
    expect(h.verbs.addPointOnSegment).toHaveBeenCalledTimes(1);
    const [k, t, pieceId, lote] = h.verbs.addPointOnSegment.mock.calls[0];
    expect([k, pieceId]).toEqual([1, 'p1']);
    expect(t).toBeCloseTo(0.3, 6);
    expect(typeof lote).toBe('string');
    const p = h.ref.current!.puesto!;
    expect(p.distanciaMm).toBeCloseTo(30, 6);
    expect(p.ladoMm).toBeCloseTo(100, 6);
    expect(p.cuenta).toEqual({ refPoint: { x: 0, y: 0 }, direction: 'cw' });
    expect(p.vertice.x).toBeCloseTo(30, 6);
    expect(p.esperado).toBe(h.verbs.addPointOnSegment.mock.results[0].value);
  });

  it('mover es volver a ponerlo desde la pieza de antes, en el mismo lote', () => {
    const h = montar();
    const antes = cuadrado();
    click(h.ref, { x: 30, y: 0 });
    act(() => h.ref.current!.moverPuesto(70));
    expect(h.verbs.reinsertarPunto).toHaveBeenCalledTimes(1);
    const [base, k, t, lote] = h.verbs.reinsertarPunto.mock.calls[0];
    expect(base.outline).toEqual(antes.outline);
    expect(k).toBe(1);
    expect(t).toBeCloseTo(0.7, 6);
    expect(lote).toBe(h.verbs.addPointOnSegment.mock.calls[0][3]);
    expect(h.ref.current!.puesto!.distanciaMm).toBe(70);
    expect(h.ref.current!.puesto!.vertice.x).toBeCloseTo(70, 6);
  });

  it('sobre un punto que ya existe no se mueve y lo dice', () => {
    const avisos: AvisoMudo[] = [];
    const cancelar = suscribirNoPasoNada(a => { avisos.push(a); });
    try {
      const h = montar();
      click(h.ref, { x: 30, y: 0 });
      act(() => h.ref.current!.moverPuesto(100));
      expect(h.verbs.reinsertarPunto).not.toHaveBeenCalled();
      expect(avisos.map(a => a.razon)).toContain('point:sobre-un-punto');
      expect(h.ref.current!.puesto!.distanciaMm).toBeCloseTo(30, 6);
    } finally {
      cancelar();
    }
  });

  it('si el contorno vivo ya no es el que se escribió, la cota se va sin escribir', () => {
    const h = montar();
    click(h.ref, { x: 30, y: 0 });
    h.cambiaPiezas([cuadrado()]); // otro contorno: un deshacer, o un cambio que no es nuestro
    act(() => h.ref.current!.moverPuesto(70));
    expect(h.verbs.reinsertarPunto).not.toHaveBeenCalled();
    expect(h.ref.current!.puesto).toBeNull();
    expect(tipos(h.acciones)).toContain('undo/endBatch');
  });

  it('terminar cierra el lote una sola vez', () => {
    const h = montar();
    click(h.ref, { x: 30, y: 0 });
    act(() => h.ref.current!.terminarPuesto());
    act(() => h.ref.current!.terminarPuesto());
    const lote = h.verbs.addPointOnSegment.mock.calls[0][3];
    expect(h.acciones.filter(a => a.type === 'undo/endBatch' && a.payload === lote)).toHaveLength(1);
    expect(h.ref.current!.puesto).toBeNull();
  });

  it('el siguiente clic cierra el lote del anterior antes de abrir el suyo', () => {
    const h = montar();
    click(h.ref, { x: 30, y: 0 });
    click(h.ref, { x: 100, y: 50 });
    const [primero, segundo] = h.verbs.addPointOnSegment.mock.calls.map(c => c[3]);
    expect(primero).not.toBe(segundo);
    const orden = h.acciones
      .filter(a => a.type === 'undo/startBatch' || a.type === 'undo/endBatch')
      .map(a => [a.type, a.type === 'undo/endBatch' ? a.payload : (a.payload as { token: string }).token]);
    expect(orden).toEqual([
      ['undo/startBatch', primero], ['undo/endBatch', primero], ['undo/startBatch', segundo],
    ]);
    expect(h.ref.current!.puesto!.distanciaMm).toBeCloseTo(50, 6);
  });

  it('el arrastre también deja su cota', () => {
    const h = montar();
    arrastre(h.ref, { x: 30, y: 0 }, { x: 60, y: 0 });
    // Suelto en x = 60: la esquina más cercana es la de (100, 0), a 40 hacia atrás.
    expect(h.ref.current!.puesto!.cuenta).toEqual({ refPoint: { x: 100, y: 0 }, direction: 'ccw' });
    expect(h.ref.current!.puesto!.distanciaMm).toBeCloseTo(40, 6);
  });

  it('una pieza bloqueada: el verbo avisa, y no hay cota ni lote', () => {
    const h = montar(cuadrado({ locked: true }));
    click(h.ref, { x: 30, y: 0 });
    expect(h.verbs.addPointOnSegment).toHaveBeenCalledTimes(1);
    expect(h.verbs.addPointOnSegment.mock.calls[0][3]).toBeUndefined();
    expect(h.ref.current!.puesto).toBeNull();
    expect(tipos(h.acciones)).not.toContain('undo/startBatch');
  });

  it('una pieza de capa bloqueada tampoco abre cota ni lote: el candado de capa pesa igual (#1136)', () => {
    const h = montar(cuadrado(), { capaBloqueada: true });
    click(h.ref, { x: 30, y: 0 });
    expect(h.verbs.addPointOnSegment.mock.calls[0][3]).toBeUndefined();
    expect(h.ref.current!.puesto).toBeNull();
    expect(tipos(h.acciones)).not.toContain('undo/startBatch');
  });

  it('curva por puntos y bezier no abren cota', () => {
    const h = montar();
    act(() => { h.store.dispatch(setToolOption({ toolId: 'point', optionId: 'mode', value: 'curvePoints' })); });
    click(h.ref, { x: 30, y: 0 });
    expect(h.verbs.convertSegmentToPoints).toHaveBeenCalledTimes(1);
    expect(h.ref.current!.puesto).toBeNull();
  });

  it('salir de Punto cierra la cota y su lote', () => {
    const h = montar();
    click(h.ref, { x: 30, y: 0 });
    act(() => { h.store.dispatch(setActiveTool('select' as Tool2D)); });
    expect(h.ref.current!.puesto).toBeNull();
    expect(tipos(h.acciones)).toContain('undo/endBatch');
  });
});
