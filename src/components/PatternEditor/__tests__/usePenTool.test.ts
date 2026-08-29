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
      ['pen:press', { closes: false, nodes: 1 }],
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
    const outline = onComplete.mock.calls[0][0].outline;
    expect(outline.map((c: { type: string }) => c.type)).toEqual(['M', 'L']);
    expect(tool().nextPoint).toBeNull();
    expect(tool().nodes).toHaveLength(0);
  });
});
