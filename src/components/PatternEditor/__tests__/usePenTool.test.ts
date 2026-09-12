// @vitest-environment jsdom
/**
 * usePenTool — reset() clears an in-progress stroke. Nota de María #168:
 * an abandoned stroke reappeared "already placed" when re-activating the pen
 * after switching tools without pressing Esc.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { usePenTool } from '../usePenTool';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

afterEach(cleanup);

describe('usePenTool — bitácora de salidas mudas', () => {
  it('cada press deja si cierra y cuántos nodos; colocar desde el panel también', () => {
    clearJournal();
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));
    act(() => result.current.handleMouseDown(clickAt(10, 10)));
    act(() => result.current.handleMouseUp());
    act(() => result.current.placePolar(50, 0));
    const gestures = getJournal().events.filter((e) => e.kind === 'gesture').map((e) => [e.name, e.data]);
    expect(gestures).toEqual([
      // `snap` desde #1102: qué enganchó el clic, o `null` si cayó en el vacío.
      // Sin ese dato, un nodo que aterriza cuatro píxeles más allá de donde
      // María clicó es indistinguible en la bitácora de uno que aterriza donde
      // debía — y esa es exactamente la clase de fallo que la caja negra existe
      // para ver.
      ['pen:press', { closes: false, nodes: 1, snap: null }],
      ['pen:nextPoint', { op: 'place', length: 50, angle: 0, nodes: 2 }],
    ]);
  });
});

function clickAt(x: number, y: number) {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

describe('usePenTool reset', () => {
  it('clears in-progress nodes and preview', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));

    act(() => result.current.handleMouseDown(clickAt(10, 10)));
    act(() => result.current.handleMouseUp());
    expect(result.current.nodes).toHaveLength(1);

    act(() => result.current.reset());

    expect(result.current.nodes).toHaveLength(0);
    expect(result.current.previewPath).toBe('');
    expect(onComplete).not.toHaveBeenCalled();
  });
});

/**
 * Siguiente punto por largo y ángulo (spec 2026-08-29 § 7.2, María #195):
 * Tab abre el panel prefijado con la goma; `placePolar` coloca el nodo con
 * 0° a la derecha y 90° hacia ARRIBA en pantalla (y crece hacia abajo).
 */
describe('usePenTool — siguiente punto, Retroceso y doble clic', () => {
  const key = (k: string) => new KeyboardEvent('keydown', { key: k });

  function setup() {
    const onComplete = vi.fn();
    const hook = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));
    const tool = () => hook.result.current;
    const click = (x: number, y: number) => act(() => {
      tool().handleMouseDown(clickAt(x, y));
      tool().handleMouseUp();
    });
    return { tool, click, onComplete };
  }

  it('Tab sin nodos no abre nada ni se consume', () => {
    const { tool } = setup();
    let consumed = true;
    act(() => { consumed = tool().handleKeyDown(key('Tab')); });
    expect(consumed).toBe(false);
    expect(tool().nextPoint).toBeNull();
  });

  it('Tab con un nodo abre el panel prefijado con la goma', () => {
    const { tool, click } = setup();
    click(100, 100);
    act(() => tool().handleMouseMove(clickAt(150, 100)));
    let consumed = false;
    act(() => { consumed = tool().handleKeyDown(key('Tab')); });
    expect(consumed).toBe(true);
    expect(tool().nextPoint).toEqual({ from: { x: 100, y: 100 }, lengthMm: 50, angleDeg: 0 });
  });

  it('placePolar coloca el nodo: 90° hacia arriba, 0° a la derecha, encadenados', () => {
    const { tool, click } = setup();
    click(100, 100);
    act(() => tool().placePolar(80, 90));
    expect(tool().nodes[1].anchor.x).toBeCloseTo(100, 6);
    expect(tool().nodes[1].anchor.y).toBeCloseTo(20, 6);
    act(() => tool().placePolar(50, 0));
    expect(tool().nodes[2].anchor.x).toBeCloseTo(150, 6);
    expect(tool().nodes[2].anchor.y).toBeCloseTo(20, 6);
  });

  it('Retroceso quita el último nodo y se consume', () => {
    const { tool, click } = setup();
    click(100, 100); click(150, 100);
    let consumed = false;
    act(() => { consumed = tool().handleKeyDown(key('Backspace')); });
    expect(consumed).toBe(true);
    expect(tool().nodes).toHaveLength(1);
  });

  it('el doble clic termina abierta y cierra el panel', () => {
    const { tool, click, onComplete } = setup();
    click(100, 100); click(150, 100);
    act(() => { tool().handleKeyDown(key('Tab')); });
    expect(tool().nextPoint).not.toBeNull();
    act(() => tool().handleDoubleClick());
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Dos nodos no tienen área: desde la spec 2026-09-12 § 3.2 esto sale como
    // trazo, no como pieza abierta.
    const r = onComplete.mock.calls[0][0];
    expect(r.kind).toBe('trazo');
    expect(r.path.map((c: { type: string }) => c.type)).toEqual(['M', 'L']);
    expect(tool().nextPoint).toBeNull();
    expect(tool().nodes).toHaveLength(0);
  });
});

/**
 * Spec 2026-09-12 § 3: cerrado → pieza; abierto → trazo. Esc y el cambio de
 * herramienta TERMINAN el trazo (Illustrator/Figma), nunca lo tiran.
 */
describe('usePenTool — cerrado es pieza, abierto es trazo', () => {
  const key = (k: string) => new KeyboardEvent('keydown', { key: k });
  function setup() {
    const onComplete = vi.fn();
    const hook = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));
    const click = (x: number, y: number) => {
      act(() => hook.result.current.handleMouseDown(clickAt(x, y)));
      act(() => hook.result.current.handleMouseUp());
    };
    return { onComplete, hook, click };
  }

  it('Enter con dos nodos → trazo abierto, sin Z', () => {
    const { onComplete, hook, click } = setup();
    click(0, 0); click(100, 0);
    act(() => { hook.result.current.handleKeyDown(key('Enter')); });
    expect(onComplete).toHaveBeenCalledWith({ kind: 'trazo', path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }] });
    expect(hook.result.current.nodes).toHaveLength(0);
  });

  it('Enter con tres nodos → pieza cerrada (D4 del 09-09 se conserva)', () => {
    const { onComplete, click, hook } = setup();
    click(0, 0); click(100, 0); click(100, 100);
    act(() => { hook.result.current.handleKeyDown(key('Enter')); });
    const r = onComplete.mock.calls[0][0];
    expect(r.kind).toBe('pieza');
    expect(r.piece.outline.at(-1)).toEqual({ type: 'Z', values: [] });
  });

  it('el clic sobre el primer punto cierra: sale pieza, y la bitácora dice close', () => {
    clearJournal();
    const { onComplete, click, hook } = setup();
    click(0, 0); click(100, 0); click(100, 100);
    click(0, 0); // encima del primero: cierra
    const r = onComplete.mock.calls[0][0];
    expect(r.kind).toBe('pieza');
    expect(getJournal().events.find((e) => e.name === 'pen:complete')?.data)
      .toEqual({ kind: 'pieza', nodes: 3, via: 'close' });
    expect(hook.result.current.nodes).toHaveLength(0);
  });

  it('Esc con tres nodos → trazo; con uno → nada; con el chip abierto solo cierra el chip', () => {
    const { onComplete, click, hook } = setup();
    click(0, 0); click(100, 0); click(100, 100);
    act(() => { hook.result.current.openNextPoint(); });
    expect(hook.result.current.nextPoint).not.toBeNull();
    act(() => { hook.result.current.handleKeyDown(key('Escape')); });
    expect(hook.result.current.nextPoint).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();        // el primer Esc solo soltó el chip
    act(() => { hook.result.current.handleKeyDown(key('Escape')); });
    expect(onComplete).toHaveBeenCalledWith({ kind: 'trazo', path: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] },
    ] });

    const solo = setup();
    solo.click(5, 5);
    act(() => { solo.hook.result.current.handleKeyDown(key('Escape')); });
    expect(solo.onComplete).not.toHaveBeenCalled();
    expect(solo.hook.result.current.nodes).toHaveLength(0);
  });

  it('Esc sin nodos no consume la tecla', () => {
    const { hook, onComplete } = setup();
    let consumed = true;
    act(() => { consumed = hook.result.current.handleKeyDown(key('Escape')); });
    expect(consumed).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reset (cambio de herramienta) con dos nodos termina el trazo; con uno lo suelta', () => {
    clearJournal();
    const { onComplete, click, hook } = setup();
    click(0, 0); click(50, 0);
    act(() => hook.result.current.reset());
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'trazo' }));
    expect(getJournal().events.find((e) => e.name === 'pen:complete')?.data)
      .toEqual({ kind: 'trazo', nodes: 2, via: 'toolChange' });
  });

  it('la bitácora dice qué terminó y por dónde', () => {
    clearJournal();
    const { click, hook } = setup();
    click(0, 0); click(100, 0);
    act(() => { hook.result.current.handleKeyDown(key('Escape')); });
    const fin = getJournal().events.find((e) => e.name === 'pen:complete');
    expect(fin?.data).toEqual({ kind: 'trazo', nodes: 2, via: 'esc' });
  });

  it('el doble clic con tres nodos cierra la pieza y lo registra', () => {
    clearJournal();
    const { onComplete, click, hook } = setup();
    click(0, 0); click(100, 0); click(100, 100);
    act(() => hook.result.current.handleDoubleClick());
    expect(onComplete.mock.calls[0][0].kind).toBe('pieza');
    expect(getJournal().events.find((e) => e.name === 'pen:complete')?.data)
      .toEqual({ kind: 'pieza', nodes: 3, via: 'dblclick' });
    expect(hook.result.current.nodes).toHaveLength(0);
  });
});
