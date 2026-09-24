// @vitest-environment jsdom
/**
 * Editar patrón con internas (spec 2026-09-24, fase 2).
 *
 * María, 10-09 [10:05]: «el patrón lo puedo mover? no puedes editar las
 * internas, ok, así hay que arreglarlo».
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { restoreState, updateInternalLine } from '../../../store/projectSlice';
import editorReducer, { selectInternalLine } from '../../../store/editorSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { getUndoLength, undoMiddleware } from '../../../store/undoMiddleware';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
import { lineasDeHover, useEditPattern } from '../useEditPattern';
import type { InternalLine, PathCommand, PatternPiece } from '../../../types/types';

afterEach(cleanup);

// El historial de deshacer vive a nivel de módulo (`undoMiddleware`): sin
// vaciarlo, un `editor/undo` puede sacar la foto que dejó otro test, y lo que
// prueba cada uno dependería del orden. Una base nueva lo vacía, como la
// hidratación del autoguardado (`meta.resetUndoHistory`).
beforeEach(() => {
  const base = configureStore({
    reducer: { project: projectReducer },
    middleware: (gdm) => gdm({ serializableCheck: false }).concat(undoMiddleware),
  });
  base.dispatch({ ...restoreState(base.getState().project), meta: { resetUndoHistory: true } });
});

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
];
const ELE: InternalLine = {
  id: 'L', type: 'reference',
  path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }],
};
const PIQUETE: InternalLine = { id: 'N', type: 'notch', path: [{ type: 'M', values: [100, 0] }, { type: 'L', values: [100, 8] }] };

function pieza(internals: InternalLine[] = [ELE], extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p', name: 'P', outline: RECT, position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, seamAllowance: 0, edges: [], internals, ...extra,
  } as unknown as PatternPiece;
}

/** zoom 1, pan 0, rect en el origen: pantalla === patrón. */
function montarQ(pieces: PatternPiece[]) {
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer, copilotUI: copilotUIReducer },
    middleware: (gdm) => gdm({ serializableCheck: false }).concat(undoMiddleware),
  });
  store.dispatch(restoreState({ ...store.getState().project, pieces }));
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useEditPattern(1, { x: 0, y: 0 }), { wrapper });
  const internaDe = (id: string) => store.getState().project.pieces[0].internals.find(l => l.id === id)!;
  return { store, hook, internaDe };
}

describe('el estado de Q conoce las internas', () => {
  it('al entrar lee sus internas editables, sin piquetes', () => {
    const { hook } = montarQ([pieza([ELE, PIQUETE])]);
    act(() => hook.result.current.enterEdit('p'));
    expect(hook.result.current.internas.map(i => i.lineId)).toEqual(['L']);
  });

  it('un cambio externo en una interna (deshacer, el copiloto) relee sus puntos', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    const nuevo: PathCommand[] = [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 50] }, { type: 'L', values: [120, 120] }];
    act(() => { store.dispatch(updateInternalLine({ pieceId: 'p', lineId: 'L', path: nuevo })); });
    expect(hook.result.current.internas[0].nodes[1].position).toEqual({ x: 120, y: 50 });
  });

  it('un cambio en un piquete no suelta lo elegido del contorno', () => {
    const { store, hook } = montarQ([pieza([ELE, PIQUETE])]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown({ button: 0, shiftKey: false, clientX: 200, clientY: 0, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } } as unknown as React.MouseEvent<SVGSVGElement>); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect([...hook.result.current.selectedNodes]).toEqual([1]);
    act(() => { store.dispatch(updateInternalLine({ pieceId: 'p', lineId: 'N', path: [{ type: 'M', values: [101, 0] }, { type: 'L', values: [101, 8] }] })); });
    expect([...hook.result.current.selectedNodes]).toEqual([1]);
  });
});

const ev = (x: number, y: number, shift = false) => ({
  button: 0, shiftKey: shift, clientX: x, clientY: y,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
} as unknown as React.MouseEvent<SVGSVGElement>);

const tecla = (type: 'keydown' | 'keyup') =>
  act(() => { window.dispatchEvent(new KeyboardEvent(type, { key: 'Shift', shiftKey: type === 'keydown' })); });
const dosVeces = () => { tecla('keydown'); tecla('keyup'); tecla('keydown'); };

const DIAG: InternalLine = { id: 'D', type: 'reference', path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [200, 150] }] };
const anclasDe = (l: InternalLine) => l.path.filter(c => c.type !== 'Z').map(c => c.values.slice(-2));

function arrastrar(hook: ReturnType<typeof montarQ>['hook'], desde: [number, number], hasta: [number, number], shift = false) {
  act(() => { hook.result.current.handleMouseDown(ev(desde[0], desde[1], shift)); });
  act(() => { hook.result.current.handleMouseMove(ev(hasta[0], hasta[1], shift)); });
  act(() => { hook.result.current.handleMouseUp(); });
}

describe('agarrar y arrastrar una interna en Q', () => {
  it('un punto de una interna: se elige, se publica y se mueve solo él', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(120, 20)); });
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L' });
    act(() => { hook.result.current.handleMouseMove(ev(120, 40)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(anclasDe(internaDe('L'))).toEqual([[20, 20], [120, 40], [120, 120]]);
    expect(store.getState().project.pieces[0].outline).toEqual(RECT);
  });

  it('un tramo: se elige con su tramo y se trasladan sus dos extremos', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [70, 20], [70, 30]);
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L', segmentIndex: 1 });
    expect(anclasDe(internaDe('L'))).toEqual([[20, 30], [120, 30], [120, 120]]);
  });

  it('esquina compartida sin la interna elegida: se mueve la esquina, la interna no', () => {
    const { store, hook, internaDe } = montarQ([pieza([DIAG])]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [0, 0], [10, 5]);
    expect(store.getState().project.pieces[0].outline[0].values).toEqual([10, 5]);
    expect(anclasDe(internaDe('D'))[0]).toEqual([0, 0]);
  });

  it('… con la interna elegida, el mismo clic mueve su extremo', () => {
    const { store, hook, internaDe } = montarQ([pieza([DIAG])]);
    act(() => { store.dispatch(selectInternalLine({ pieceId: 'p', lineId: 'D' })); });
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [0, 0], [40, 30]);
    expect(anclasDe(internaDe('D'))[0]).toEqual([40, 30]);
    expect(store.getState().project.pieces[0].outline[0].values).toEqual([0, 0]);
  });

  it('el extremo engancha exacto a la esquina al acercarlo, y se ve el anillo', () => {
    const lejos: InternalLine = { ...DIAG, path: [{ type: 'M', values: [40, 30] }, { type: 'L', values: [200, 150] }] };
    const { hook, internaDe } = montarQ([pieza([lejos])]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(40, 30)); });
    act(() => { hook.result.current.handleMouseMove(ev(3, 2)); });
    expect(hook.result.current.enganche).toEqual({ x: 0, y: 0 });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(anclasDe(internaDe('D'))[0]).toEqual([0, 0]);
    expect(hook.result.current.enganche).toBeNull();
  });

  it('con Shift manda Shift: no engancha', () => {
    const lejos: InternalLine = { ...DIAG, path: [{ type: 'M', values: [40, 30] }, { type: 'L', values: [200, 150] }] };
    const { hook, internaDe } = montarQ([pieza([lejos])]);
    act(() => hook.result.current.enterEdit('p'));
    tecla('keydown');
    arrastrar(hook, [40, 30], [3, 2], true);
    tecla('keyup');
    expect(anclasDe(internaDe('D'))[0]).not.toEqual([0, 0]);
    expect(hook.result.current.enganche).toBeNull();
  });

  it('pieza girada con enganche: engancha a la esquina girada y guarda el local correcto (Review Focus 2)', () => {
    // Girada 180° sobre el centro de su caja (100,75): local (x,y) → patrón (200−x, 150−y).
    const lejos: InternalLine = { ...DIAG, path: [{ type: 'M', values: [40, 30] }, { type: 'L', values: [100, 100] }] };
    const { hook, internaDe } = montarQ([pieza([lejos], { rotation: 180 })]);
    act(() => hook.result.current.enterEdit('p'));
    // Su extremo local (40,30) se ve en (160,120); la esquina local (0,0) se ve en (200,150).
    act(() => { hook.result.current.handleMouseDown(ev(160, 120)); });
    act(() => { hook.result.current.handleMouseMove(ev(197, 148)); });
    act(() => { hook.result.current.handleMouseUp(); });
    const [x, y] = anclasDe(internaDe('D'))[0];
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
  });

  it('pieza girada: el punto va adonde va el puntero', () => {
    const { hook, internaDe } = montarQ([pieza([ELE], { rotation: 180 })]);
    act(() => hook.result.current.enterEdit('p'));
    // ELE (120,20) local se ve en (80,130). +10 en pantalla hacia la derecha → local (110,20).
    arrastrar(hook, [80, 130], [90, 130]);
    const [x, y] = anclasDe(internaDe('L'))[1];
    expect(x).toBeCloseTo(110, 9);
    expect(y).toBeCloseTo(20, 9);
  });

  it('gemelas del DXF: agarrar una mueve el grupo entero (Review Focus 1)', () => {
    const gemelas: InternalLine = { ...ELE, path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] },
    ] };
    const { hook, internaDe } = montarQ([pieza([gemelas])]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [120, 20], [120, 30]);
    expect(anclasDe(internaDe('L'))).toEqual([[20, 20], [120, 30], [120, 30], [120, 120]]);
  });

  it('Shift+clic junta un punto del contorno y uno de la interna; un arrastre los mueve igual', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(200, 0)); });
    act(() => { hook.result.current.handleMouseUp(); });
    arrastrar(hook, [120, 20], [125, 25], true);
    expect(store.getState().project.pieces[0].outline[1].values).toEqual([205, 5]);
    expect(anclasDe(internaDe('L'))[1]).toEqual([125, 25]);
  });

  it('el marco coge puntos del contorno y de la interna', () => {
    const { hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(-20, -20)); });
    act(() => { hook.result.current.handleMouseMove(ev(130, 30)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect([...hook.result.current.selectedNodes]).toEqual([0]);
    expect([...hook.result.current.internas[0].selectedNodes]).toEqual([0, 1]);
  });

  it('Shift dos veces endereza respecto al tramo de la interna que llega al punto', () => {
    // El tramo que llega a (60,20) viene de (20,100): pendiente 2:1.
    const inclinada: InternalLine = { id: 'I', type: 'reference', path: [{ type: 'M', values: [20, 100] }, { type: 'L', values: [60, 20] }, { type: 'L', values: [140, 20] }] };
    const { hook, internaDe } = montarQ([pieza([inclinada])]);
    act(() => hook.result.current.enterEdit('p'));
    dosVeces();
    arrastrar(hook, [60, 20], [90, 20], true);
    tecla('keyup');
    const [x, y] = anclasDe(internaDe('I'))[1];
    const ang = Math.atan2(-(y - 20), x - 60) * 180 / Math.PI;
    const base = Math.atan2(80, 40) * 180 / Math.PI;
    const rel = (((ang - base) % 45) + 45) % 45;
    expect(Math.min(rel, 45 - rel)).toBeLessThan(1e-6);
    const relHoja = ((ang % 45) + 45) % 45;
    expect(Math.min(relHoja, 45 - relHoja)).toBeGreaterThan(1);
  });

  it('deshacer a mitad del arrastre cancela el gesto y relee los puntos (Review Focus 4)', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(120, 20)); });
    act(() => { hook.result.current.handleMouseMove(ev(120, 40)); });
    expect(anclasDe(internaDe('L'))[1]).toEqual([120, 40]);
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(anclasDe(internaDe('L'))[1]).toEqual([120, 20]);
    act(() => { hook.result.current.handleMouseMove(ev(120, 60)); });
    expect(anclasDe(internaDe('L'))[1]).toEqual([120, 20]);
    expect(hook.result.current.internas[0].nodes[1].position).toEqual({ x: 120, y: 20 });
  });

  it('la caja negra registra qué agarró el press y si movió', () => {
    clearJournal();
    const { hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [120, 20], [120, 30]);
    const eventos = getJournal().events.filter(e => e.kind === 'gesture').map(e => [e.name, e.data]);
    expect(eventos).toContainEqual(['edicion:agarre', { objeto: 'pieza', linea: 'interna', que: 'punto', lineId: 'L' }]);
    expect(eventos).toContainEqual(['edicion:suelta', { movio: true }]);
  });

  it('Esc suelta lo elegido, también la interna elegida', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(70, 20)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(store.getState().editor.selectedInternalLine).not.toBeNull();
    act(() => { hook.result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(store.getState().editor.selectedInternalLine).toBeNull();
    expect(hook.result.current.internas[0].selectedSegments.size).toBe(0);
  });

  it('el hover sobre un tramo de interna lo anuncia, antes y después de entrar', () => {
    const { hook } = montarQ([pieza()]);
    act(() => { hook.result.current.handleMouseMove(ev(70, 21)); });
    expect(hook.result.current.hoveredPieceId).toBe('p');
    expect(hook.result.current.internas[0].hoveredSegment).toBe(1);
    expect(hook.result.current.getCursor()).toBe('pointer');
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseMove(ev(70, 21)); });
    expect(hook.result.current.internas[0].hoveredSegment).toBe(1);
    expect(hook.result.current.getCursor()).toBe('cell');
  });
});

const tecleo = (key: string) => new KeyboardEvent('keydown', { key });

describe('la interna elegida se va con lo elegido en Q (§ 3.5)', () => {
  it('elegir un punto de una interna y deshacer desde fuera la suelta (§ 4.7)', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    // Un cambio cualquiera en el historial, antes de elegir: el deshacer lo revierte.
    const otra: PathCommand[] = [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 110] }];
    act(() => { store.dispatch(updateInternalLine({ pieceId: 'p', lineId: 'L', path: otra })); });
    act(() => { hook.result.current.handleMouseDown(ev(120, 20)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L' });
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(hook.result.current.internas[0].selectedNodes.size).toBe(0);
    expect(store.getState().editor.selectedInternalLine).toBeNull();
    expect(store.getState().editor.selectedPieceIds).toEqual(['p']);
  });

  it('arrastrar un punto de interna, deshacer desde fuera y Supr: nada deja la línea entera en la puerta global', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [120, 20], [120, 40]);
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(anclasDe(internaDe('L'))[1]).toEqual([120, 20]);
    let consumida = true;
    act(() => { consumida = hook.result.current.handleKeyDown(tecleo('Delete')); });
    expect(consumida).toBe(false);
    expect(store.getState().editor.selectedInternalLine).toBeNull();
  });

  it('entrar en otra pieza suelta la interna elegida de la anterior; la de la pieza que entra se queda (§ 5.3)', () => {
    const otra = { ...pieza(), id: 'q', position: { x: 400, y: 0 } } as PatternPiece;
    const { store, hook } = montarQ([pieza(), otra]);
    act(() => { store.dispatch(selectInternalLine({ pieceId: 'p', lineId: 'L' })); });
    act(() => hook.result.current.enterEdit('q'));
    expect(store.getState().editor.selectedInternalLine).toBeNull();
    expect(store.getState().editor.selectedPieceIds).toEqual(['q']);

    act(() => { store.dispatch(selectInternalLine({ pieceId: 'q', lineId: 'L' })); });
    act(() => hook.result.current.enterEdit('q'));
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'q', lineId: 'L' });

    // El primer press que entra y coge el contorno de la otra también la suelta.
    act(() => hook.result.current.exitEdit());
    act(() => { store.dispatch(selectInternalLine({ pieceId: 'p', lineId: 'L' })); });
    act(() => { hook.result.current.enterEditActuando('q', ev(600, 0)); });
    expect(hook.result.current.selectedNodes.has(1)).toBe(true);
    expect(store.getState().editor.selectedInternalLine).toBeNull();
  });

  it('Esc con el arrastre de un punto de interna vivo la suelta', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(ev(120, 20)); });
    act(() => { hook.result.current.handleMouseMove(ev(120, 40)); });
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L' });
    act(() => { hook.result.current.handleKeyDown(tecleo('Escape')); });
    expect(hook.result.current.isEditing).toBe(false);
    expect(store.getState().editor.selectedInternalLine).toBeNull();
  });

  it('el marco publica la interna si solo coge puntos de ella, y la suelta si coge de varias líneas', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    // Solo L: (120,20) y (120,120).
    act(() => { hook.result.current.handleMouseDown(ev(110, 10)); });
    act(() => { hook.result.current.handleMouseMove(ev(130, 130)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L' });
    // El contorno y L: ya no hay UNA interna que publicar.
    act(() => { hook.result.current.handleMouseDown(ev(-20, -20)); });
    act(() => { hook.result.current.handleMouseMove(ev(130, 30)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(store.getState().editor.selectedInternalLine).toBeNull();
  });

  it('un Shift+clic que quita un tramo vuelve a publicar lo que queda', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    const clic = (x: number, y: number, shift = false) => {
      act(() => { hook.result.current.handleMouseDown(ev(x, y, shift)); });
      act(() => { hook.result.current.handleMouseUp(); });
    };
    clic(70, 20);
    clic(121, 70, true);
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L' });
    clic(121, 70, true);
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L', segmentIndex: 1 });
    clic(70, 20, true);
    expect(store.getState().editor.selectedInternalLine).toBeNull();
  });
});

describe('el hover antes de entrar, precalculado por identidad de la pieza (§ 13)', () => {
  it('tras un cambio de fuera que mueve la interna, el hover mira la geometría nueva', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => { hook.result.current.handleMouseMove(ev(70, 21)); });
    expect(hook.result.current.internas[0].hoveredSegment).toBe(1);
    const bajada: PathCommand[] = [{ type: 'M', values: [20, 60] }, { type: 'L', values: [120, 60] }, { type: 'L', values: [120, 140] }];
    act(() => { store.dispatch(updateInternalLine({ pieceId: 'p', lineId: 'L', path: bajada })); });
    act(() => { hook.result.current.handleMouseMove(ev(70, 21)); });
    expect(hook.result.current.hoveredPieceId).toBeNull();
    expect(hook.result.current.getCursor()).toBe('default');
    act(() => { hook.result.current.handleMouseMove(ev(70, 61)); });
    expect(hook.result.current.hoveredPieceId).toBe('p');
    expect(hook.result.current.internas[0].hoveredSegment).toBe(1);
  });

  it('el hover no escribe en las líneas precalculadas de la pieza', () => {
    const { store, hook } = montarQ([pieza()]);
    const piece = store.getState().project.pieces[0];
    const lineas = lineasDeHover(piece);
    const conConjuntos = (_: string, v: unknown) => (v instanceof Set ? [...v] : v);
    const foto = JSON.stringify(lineas, conConjuntos);
    Object.freeze(lineas);
    Object.freeze(lineas.nodes);
    Object.freeze(lineas.internas);
    lineas.internas.forEach(i => { Object.freeze(i); Object.freeze(i.nodes); });
    act(() => { hook.result.current.handleMouseMove(ev(70, 21)); });
    act(() => { hook.result.current.handleMouseMove(ev(120, 20)); });
    act(() => { hook.result.current.handleMouseMove(ev(0, 0)); });
    act(() => { hook.result.current.handleMouseMove(ev(500, 500)); });
    act(() => { hook.result.current.limpiarHover(); });
    expect(lineasDeHover(store.getState().project.pieces[0])).toBe(lineas);
    expect(JSON.stringify(lineas, conConjuntos)).toBe(foto);
  });

  it('perdido el hover sin pieza en edición, el hook deja de devolver las internas de la pieza de debajo', () => {
    const { hook } = montarQ([pieza()]);
    act(() => { hook.result.current.handleMouseMove(ev(70, 21)); });
    expect(hook.result.current.internas).toHaveLength(1);
    act(() => { hook.result.current.handleMouseMove(ev(500, 500)); });
    expect(hook.result.current.internas).toHaveLength(0);
    act(() => { hook.result.current.handleMouseMove(ev(70, 21)); });
    act(() => { hook.result.current.limpiarHover(); });
    expect(hook.result.current.internas).toHaveLength(0);
  });
});

describe('§ 10.2: lo que faltaba de los hooks', () => {
  it('enganche sin la propia línea: sus puntas no enganchan, las de otra interna sí (§ 4.3)', () => {
    const OTRA: InternalLine = { id: 'O', type: 'reference', path: [{ type: 'M', values: [60, 100] }, { type: 'L', values: [60, 140] }] };
    // La punta (120,120) de L, junto a su propia punta (20,20): no engancha.
    const a = montarQ([pieza([ELE, OTRA])]);
    act(() => a.hook.result.current.enterEdit('p'));
    act(() => { a.hook.result.current.handleMouseDown(ev(120, 120)); });
    act(() => { a.hook.result.current.handleMouseMove(ev(23, 22)); });
    expect(a.hook.result.current.enganche).toBeNull();
    act(() => { a.hook.result.current.handleMouseUp(); });
    expect(anclasDe(a.internaDe('L'))[2]).toEqual([23, 22]);
    cleanup();
    // La misma punta junto a la punta (60,100) de OTRA: engancha exacto.
    const b = montarQ([pieza([ELE, OTRA])]);
    act(() => b.hook.result.current.enterEdit('p'));
    act(() => { b.hook.result.current.handleMouseDown(ev(120, 120)); });
    act(() => { b.hook.result.current.handleMouseMove(ev(62, 103)); });
    expect(b.hook.result.current.enganche).toEqual({ x: 60, y: 100 });
    act(() => { b.hook.result.current.handleMouseUp(); });
    expect(anclasDe(b.internaDe('L'))[2]).toEqual([60, 100]);
  });

  it('el primer press que entra en la pieza ya agarra y arrastra el punto de la interna (enterEditActuando)', () => {
    clearJournal();
    const { store, hook, internaDe } = montarQ([pieza()]);
    let actuo = false;
    act(() => { actuo = hook.result.current.enterEditActuando('p', ev(120, 20)); });
    expect(actuo).toBe(true);
    expect(hook.result.current.isEditing).toBe(true);
    expect(hook.result.current.editingPieceId).toBe('p');
    expect([...hook.result.current.internas[0].selectedNodes]).toEqual([1]);
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L' });
    act(() => { hook.result.current.handleMouseMove(ev(120, 40)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(anclasDe(internaDe('L'))[1]).toEqual([120, 40]);
    expect(store.getState().project.pieces[0].outline).toEqual(RECT);
    const eventos = getJournal().events.filter(e => e.kind === 'gesture').map(e => [e.name, e.data]);
    expect(eventos).toContainEqual(['edicion:agarre', { objeto: 'pieza', linea: 'interna', que: 'punto', lineId: 'L' }]);
  });

  it('… y sobre un tramo de interna entra con ese tramo elegido', () => {
    const { store, hook } = montarQ([pieza()]);
    act(() => { hook.result.current.enterEditActuando('p', ev(70, 20)); });
    expect([...hook.result.current.internas[0].selectedSegments]).toEqual([1]);
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L', segmentIndex: 1 });
  });

  it('un gesto, una entrada de deshacer, aunque el ratón se mueva varias veces (§ 4.7)', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    const antes = getUndoLength();
    act(() => { hook.result.current.handleMouseDown(ev(120, 20)); });
    act(() => { hook.result.current.handleMouseMove(ev(120, 30)); });
    act(() => { hook.result.current.handleMouseMove(ev(125, 40)); });
    act(() => { hook.result.current.handleMouseMove(ev(130, 50)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(anclasDe(internaDe('L'))[1]).toEqual([130, 50]);
    expect(getUndoLength()).toBe(antes + 1);
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(anclasDe(internaDe('L'))).toEqual([[20, 20], [120, 20], [120, 120]]);
  });
});

const supr = (hook: ReturnType<typeof montarQ>['hook']) =>
  act(() => { hook.result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete' })); });
const clic = (hook: ReturnType<typeof montarQ>['hook'], x: number, y: number, shift = false) => {
  act(() => { hook.result.current.handleMouseDown(ev(x, y, shift)); });
  act(() => { hook.result.current.handleMouseUp(); });
};

describe('los verbos de Q sobre una interna', () => {
  it('Supr sobre un punto lo quita y los vecinos se unen', () => {
    const { hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 20);
    supr(hook);
    expect(anclasDe(internaDe('L'))).toEqual([[20, 20], [120, 120]]);
  });

  it('una interna que se queda con un punto se va', () => {
    const corta: InternalLine = { ...ELE, path: ELE.path.slice(0, 2) };
    const { store, hook } = montarQ([pieza([corta])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 20);
    supr(hook);
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
  });

  it('una cerrada no baja de tres puntos: avisa y no toca nada (Review Focus 3)', () => {
    const cerrada: InternalLine = { id: 'C', type: 'reference', path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [80, 20] }, { type: 'L', values: [50, 70] }, { type: 'Z', values: [] },
    ] };
    const { store, hook, internaDe } = montarQ([pieza([cerrada])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 80, 20);
    supr(hook);
    expect(internaDe('C').path).toEqual(cerrada.path);
    const toasts = (store.getState() as unknown as { copilotUI: { toasts: { message: string }[] } }).copilotUI.toasts;
    expect(toasts.at(-1)?.message).toBe('No se puede borrar: la forma necesita al menos 3 puntos');
  });

  it('el punto de cierre de una cerrada mueve juntos la M y el último (Review Focus 3)', () => {
    const cerrada: InternalLine = { id: 'C', type: 'reference', path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [80, 20] }, { type: 'L', values: [50, 70] }, { type: 'L', values: [20, 20] }, { type: 'Z', values: [] },
    ] };
    const { hook, internaDe } = montarQ([pieza([cerrada])]);
    act(() => hook.result.current.enterEdit('p'));
    arrastrar(hook, [20, 20], [25, 30]);
    expect(anclasDe(internaDe('C'))[0]).toEqual([25, 30]);
    expect(anclasDe(internaDe('C'))[3]).toEqual([25, 30]);
  });

  it('una mezcla con el contorno es todo o nada', () => {
    const { store, hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    // Tres puntos del contorno (dejarían uno) y uno de la interna.
    clic(hook, 200, 0); clic(hook, 200, 150, true); clic(hook, 0, 150, true); clic(hook, 120, 20, true);
    supr(hook);
    expect(store.getState().project.pieces[0].outline).toEqual(RECT);
    expect(internaDe('L').path).toEqual(ELE.path);
  });

  it('gemelas: Supr sobre una quita el grupo, no deja un gemelo (Review Focus 1)', () => {
    const gemelas: InternalLine = { ...ELE, path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] },
    ] };
    const { hook, internaDe } = montarQ([pieza([gemelas])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 20);
    supr(hook);
    expect(anclasDe(internaDe('L'))).toEqual([[20, 20], [120, 120]]);
  });

  it('Supr sobre un tramo del medio parte la interna en dos', () => {
    const tres: InternalLine = { ...ELE, path: [...ELE.path, { type: 'L', values: [20, 120] }] };
    const { store, hook } = montarQ([pieza([tres])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 70);
    supr(hook);
    const internas = store.getState().project.pieces[0].internals;
    expect(internas.map(l => l.path.length)).toEqual([2, 2]);
    expect(internas[0].id).toBe('L');
  });

  it('Supr sobre un tramo de pinza se la lleva entera: no se parte', () => {
    const pinza: InternalLine = { id: 'P', type: 'dart', path: [
      { type: 'M', values: [20, 20] }, { type: 'L', values: [40, 90] }, { type: 'L', values: [60, 20] },
    ] };
    const { store, hook } = montarQ([pieza([pinza])]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 30, 55);
    supr(hook);
    expect(store.getState().project.pieces[0].internals).toHaveLength(0);
  });

  it('doble clic en un tramo de interna inserta un punto marcado; sobre un punto, nada', () => {
    const { hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleDoubleClick(ev(70, 20)); });
    expect(internaDe('L').path).toHaveLength(4);
    expect(internaDe('L').path[1]).toMatchObject({ type: 'L', values: [70, 20], authoredAnchor: true });
    act(() => { hook.result.current.handleDoubleClick(ev(120, 20)); });
    expect(internaDe('L').path).toHaveLength(4);
  });

  it('convertir un tramo de interna: a curva, a curva por puntos, y mover un punto con número', () => {
    const { hook, internaDe } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    act(() => hook.result.current.convertSegment(1, true, 'p', 'L'));
    expect(internaDe('L').path[1]).toMatchObject({ type: 'C', manualBezier: true });
    act(() => hook.result.current.convertSegment(1, false, 'p', 'L'));
    expect(internaDe('L').path[1].type).toBe('L');
    act(() => hook.result.current.convertSegmentToPoints(1, 'p', 'L'));
    expect(internaDe('L').path.filter(c => c.type === 'C').length).toBeGreaterThan(1);
    act(() => hook.result.current.moveNodeTo('p', 0, { x: 0, y: 0 }, 'L'));
    expect(internaDe('L').path[0].values).toEqual([0, 0]);
  });

  it('el punto elegido de una interna es el sujeto de las cotas', () => {
    const { hook } = montarQ([pieza()]);
    act(() => hook.result.current.enterEdit('p'));
    clic(hook, 120, 20);
    expect(hook.result.current.puntoElegido).toEqual({ pieceId: 'p', commandIndex: 1, lineId: 'L' });
    expect(hook.result.current.hayPuntosElegidos).toBe(true);
  });
});
