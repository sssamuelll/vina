// @vitest-environment jsdom
/**
 * El motor de "Línea interna" (spec 2026-08-29 § 4.3–§ 4.6, verificación
 * § 12.1 #2, #4, #5). Sin Redux: el hook recibe las piezas visibles en orden
 * de dibujo y devuelve el trazo por `onComplete`.
 *
 * Zoom 1 y paneo 0: pantalla = patrón, así que los píxeles de enganche
 * (`EDGE_HIT_PX` = 12) se leen directo en las coordenadas de los clics.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { usePolyPenTool, type InternalLineToolOptions } from '../usePolyPenTool';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
];

function pieza(id: string, x: number, y: number, extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id, outline: RECT, internals: [], position: { x, y }, rotation: 0,
    mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1,
    ...extra,
  } as PatternPiece;
}

/** A: 200×100 en (100,100). B: la misma, girada 90°, en (100,300). */
const A = pieza('A', 100, 100, {
  internals: [{ id: 'il1', type: 'reference', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [80, 20] }] }],
});
const B = pieza('B', 100, 300, { rotation: 90 });
const LOCKED = pieza('C', 400, 100, { locked: true });

const ev = (x: number, y: number, button = 0) => ({
  button, clientX: x, clientY: y,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) },
}) as unknown as React.MouseEvent<SVGSVGElement>;

const key = (k: string) => new KeyboardEvent('keydown', { key: k });

function setup(over: Partial<InternalLineToolOptions> = {}) {
  const onComplete = vi.fn();
  const onLockedPress = vi.fn();
  const opts: InternalLineToolOptions = { nodeType: 'straight', pieces: [A, B], onComplete, onLockedPress, ...over };
  const hook = renderHook(() => usePolyPenTool(1, { x: 0, y: 0 }, opts));
  const tool = () => hook.result.current;
  const click = (x: number, y: number) => act(() => {
    tool().handleMouseDown(ev(x, y));
    tool().handleMouseUp(ev(x, y));
  });
  const move = (x: number, y: number) => act(() => tool().handleMouseMove(ev(x, y)));
  return { hook, tool, click, move, onComplete, onLockedPress };
}

describe('usePolyPenTool — anfitriona y nodos', () => {
  it('press y release dentro de A crean un nodo recto y fijan A como anfitriona', () => {
    const { tool, click } = setup();
    click(150, 150);
    expect(tool().nodes).toEqual([{ point: { x: 150, y: 150 }, type: 'straight' }]);
    expect(tool().hostId).toBe('A');
  });

  it('un press fuera de toda pieza no arma nada', () => {
    const { tool, click } = setup();
    click(50, 50);
    expect(tool().nodes).toEqual([]);
    expect(tool().hostId).toBeNull();
  });

  it('una pieza bloqueada no es anfitriona: avisa y no arma', () => {
    const { tool, click, onLockedPress } = setup({ pieces: [A, LOCKED] });
    click(450, 150);
    expect(onLockedPress).toHaveBeenCalledWith('C');
    expect(tool().nodes).toEqual([]);
  });

  it('con dos piezas solapadas gana la de arriba (la última en orden de dibujo)', () => {
    const D = pieza('D', 150, 120);
    const { tool, click } = setup({ pieces: [A, D] });
    click(200, 150);
    expect(tool().hostId).toBe('D');
  });

  it('el tipo latcheado manda: curvePoints', () => {
    const { tool, click } = setup({ nodeType: 'curvePoints' });
    click(150, 150);
    expect(tool().nodes[0].type).toBe('curvePoints');
  });

  it('arrastrar ≥ 4 px crea un bezier con manejadores simétricos anclado en el press', () => {
    const { tool } = setup();
    act(() => tool().handleMouseDown(ev(120, 120)));
    act(() => tool().handleMouseMove(ev(130, 130)));
    expect(tool().isDragging).toBe(true);
    act(() => tool().handleMouseUp(ev(130, 130)));
    expect(tool().nodes[0]).toEqual({
      point: { x: 120, y: 120 }, type: 'bezier',
      handleOut: { x: 130, y: 130 }, handleIn: { x: 110, y: 110 },
    });
  });

  it('un press sobre el último nodo no arma (ningún tramo de largo cero)', () => {
    const { tool, click } = setup();
    click(150, 150);
    click(153, 152);
    expect(tool().nodes).toHaveLength(1);
  });

  it('el botón derecho no arma', () => {
    const { tool } = setup();
    act(() => tool().handleMouseDown(ev(150, 150, 2)));
    act(() => tool().handleMouseUp(ev(150, 150, 2)));
    expect(tool().nodes).toEqual([]);
  });
});

describe('usePolyPenTool — enganche', () => {
  it('a 5 px de un vértice de A el hover lo anuncia y el nodo cae exacto', () => {
    const { tool, click, move } = setup();
    move(104, 103);
    expect(tool().hover?.kind).toBe('vertex');
    click(104, 103);
    expect(tool().nodes[0].point).toEqual({ x: 100, y: 100 });
  });

  it('a 5 px del vértice de la pieza girada B el nodo coincide con el vértice y B es la anfitriona', () => {
    const { tool, click } = setup();
    const v = pieceLocalToPattern({ x: 0, y: 0 }, B);
    click(v.x + 4, v.y + 3);
    expect(tool().nodes[0].point.x).toBeCloseTo(v.x, 6);
    expect(tool().nodes[0].point.y).toBeCloseTo(v.y, 6);
    expect(tool().hostId).toBe('B');
  });

  it('a 6 px del borde superior de A el nodo cae sobre el borde', () => {
    const { tool, click } = setup();
    click(150, 106);
    expect(tool().nodes[0].point.y).toBeCloseTo(100, 6);
    expect(tool().nodes[0].point.x).toBeCloseTo(150, 6);
  });

  it('el extremo de una línea interna existente engancha exacto', () => {
    const { tool, click } = setup();
    click(183, 123);
    expect(tool().nodes[0].point).toEqual({ x: 180, y: 120 });
  });

  it('una pieza que no está en la lista (capa oculta) no es objetivo ni anfitriona', () => {
    const { tool, click } = setup({ pieces: [A] });
    const v = pieceLocalToPattern({ x: 0, y: 0 }, B);
    click(v.x + 4, v.y + 3);
    expect(tool().nodes).toEqual([]);
    expect(tool().hostId).toBeNull();
  });
});

describe('usePolyPenTool — terminar, cerrar, cancelar', () => {
  it('tres nodos y un press/release sobre el primero cierran y entregan el trazo con Z', () => {
    const { tool, click, onComplete } = setup();
    click(120, 120); click(150, 150); click(180, 120);
    click(122, 121);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [host, cmds, closed] = onComplete.mock.calls[0];
    expect(host).toBe('A');
    expect(closed).toBe(true);
    expect(cmds.map((c: PathCommand) => c.type)).toEqual(['M', 'L', 'L', 'Z']);
    expect(tool().nodes).toEqual([]);
  });

  it('Enter con dos nodos termina abierta y se consume', () => {
    const { tool, click, onComplete } = setup();
    click(120, 120); click(150, 150);
    let consumed = false;
    act(() => { consumed = tool().handleKeyDown(key('Enter')); });
    expect(consumed).toBe(true);
    expect(onComplete).toHaveBeenCalledWith('A', [
      { type: 'M', values: [120, 120] }, { type: 'L', values: [150, 150] },
    ], false);
  });

  it('Enter con un solo nodo no hace nada y no se consume', () => {
    const { tool, click, onComplete } = setup();
    click(120, 120);
    let consumed = true;
    act(() => { consumed = tool().handleKeyDown(key('Enter')); });
    expect(consumed).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(tool().nodes).toHaveLength(1);
  });

  it('Escape a mitad de press descarta solo ese press: los nodos quedan y el release no añade', () => {
    const { tool, click } = setup();
    click(120, 120);
    act(() => tool().handleMouseDown(ev(150, 150)));
    let consumed = false;
    act(() => { consumed = tool().handleKeyDown(key('Escape')); });
    expect(consumed).toBe(true);
    act(() => tool().handleMouseUp(ev(150, 150)));
    expect(tool().nodes).toHaveLength(1);
  });

  it('Escape con nodos y sin press descarta el trazo entero', () => {
    const { tool, click } = setup();
    click(120, 120); click(150, 150);
    let consumed = false;
    act(() => { consumed = tool().handleKeyDown(key('Escape')); });
    expect(consumed).toBe(true);
    expect(tool().nodes).toEqual([]);
    expect(tool().hostId).toBeNull();
  });

  it('sin trazo, Escape no se consume', () => {
    const { tool } = setup();
    let consumed = true;
    act(() => { consumed = tool().handleKeyDown(key('Escape')); });
    expect(consumed).toBe(false);
  });

  it('Retroceso quita el último nodo y con uno solo descarta el trazo', () => {
    const { tool, click } = setup();
    click(120, 120); click(150, 150);
    act(() => { tool().handleKeyDown(key('Backspace')); });
    expect(tool().nodes).toHaveLength(1);
    act(() => { tool().handleKeyDown(key('Delete')); });
    expect(tool().nodes).toEqual([]);
    expect(tool().isTracing()).toBe(false);
  });

  it('reset() con press vivo: el release posterior no añade', () => {
    const { tool } = setup();
    act(() => tool().handleMouseDown(ev(150, 150)));
    act(() => tool().reset());
    act(() => tool().handleMouseUp(ev(150, 150)));
    expect(tool().nodes).toEqual([]);
  });

  it('zona muerta tras un commit: un press en el mismo sitio no arma hasta alejarse', () => {
    const { tool, click, move } = setup();
    click(120, 120); click(150, 150);
    act(() => { tool().handleKeyDown(key('Enter')); });
    click(152, 151);
    expect(tool().nodes).toEqual([]);
    move(200, 200);
    click(150, 150);
    expect(tool().nodes).toHaveLength(1);
  });

  it('doble clic: el segundo par cae sobre el último nodo (no arma) y el dblclick termina abierta', () => {
    const { tool, click, onComplete } = setup();
    click(120, 120); click(150, 150); click(180, 120);
    click(180, 120);
    expect(tool().nodes).toHaveLength(3);
    act(() => tool().handleDoubleClick());
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [, cmds, closed] = onComplete.mock.calls[0];
    expect(cmds).toHaveLength(3);
    expect(closed).toBe(false);
    expect(tool().isTracing()).toBe(false);
  });
});
