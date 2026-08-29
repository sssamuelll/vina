// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEdgeGesture } from '../useEdgeGesture';
import type { EdgeTarget, EdgeCommit } from '../edgeGesture';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

describe('useEdgeGesture — bitácora de salidas mudas', () => {
  it('el press que encuentra borde deja el objetivo; el que no, deja el fallo', () => {
    clearJournal();
    const hit = renderHook(() => useEdgeGesture({
      resolveTarget: () => ({ pieceId: 'p1', edgeIndex: 1, edgeRange: [1, 2], t: 0.2, point: { x: 0, y: 0 } }),
      resolveReleaseT: () => 0.8,
      onCommit: vi.fn(),
    }));
    const miss = renderHook(() => useEdgeGesture({ resolveTarget: () => null, resolveReleaseT: () => null, onCommit: vi.fn() }));
    act(() => { hit.result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { miss.result.current.handleMouseDown(mouseEvent(100, 100)); });
    expect(getJournal().events.map((e) => [e.name, e.data])).toEqual([
      ['edge:press', { pieceId: 'p1', edgeIndex: 1, t: 0.2 }],
      ['edge:miss', undefined],
    ]);
  });
});

const target: EdgeTarget = {
  pieceId: 'p1', edgeIndex: 1, edgeRange: [1, 2], t: 0.2, point: { x: 0, y: 0 },
};

/** Un MouseEvent de React lo bastante real para el hook: coordenadas, botón y
 *  el currentTarget con la API de captura de puntero. */
function mouseEvent(clientX: number, clientY: number, button = 0) {
  return {
    button,
    clientX,
    clientY,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    },
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function setup(releaseT: number | null, onCommit: (c: EdgeCommit) => void) {
  return renderHook(() => useEdgeGesture({
    resolveTarget: () => target,
    resolveReleaseT: () => releaseT,
    onCommit,
  }));
}

describe('useEdgeGesture', () => {
  it('arranca en idle', () => {
    const { result } = setup(0.8, vi.fn());
    expect(result.current.phase).toBe('idle');
  });

  it('el press arma el gesto y guarda el objetivo', () => {
    const { result } = setup(0.8, vi.fn());
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    expect(result.current.phase).toBe('armed');
    expect(result.current.press).toEqual(target);
  });

  it('moverse sobre el umbral pasa a dragging', () => {
    const { result } = setup(0.8, vi.fn());
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(110, 100)); });
    expect(result.current.phase).toBe('dragging');
  });

  it('moverse por debajo del umbral NO pasa a dragging', () => {
    const { result } = setup(0.8, vi.fn());
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(102, 100)); });
    expect(result.current.phase).toBe('armed');
  });

  it('soltar sin moverse commitea un CLIC y vuelve a idle', () => {
    const onCommit = vi.fn();
    const { result } = setup(0.8, onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseUp(mouseEvent(100, 100)); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].kind).toBe('click');
    expect(result.current.phase).toBe('idle');
  });

  it('soltar tras moverse commitea un ARRASTRE con su rango', () => {
    const onCommit = vi.fn();
    const { result } = setup(0.8, onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); });
    act(() => { result.current.handleMouseUp(mouseEvent(140, 100)); });
    const commit = onCommit.mock.calls[0][0];
    expect(commit.kind).toBe('drag');
    expect(commit.range[0]).toBeCloseTo(0.2, 5);
    expect(commit.range[1]).toBeCloseTo(0.8, 5);
  });

  it('cancel() a mitad de arrastre no commitea nada', () => {
    const onCommit = vi.fn();
    const { result } = setup(0.8, onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); });
    act(() => { result.current.cancel(); });
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('el botón derecho no arma nada', () => {
    const onCommit = vi.fn();
    const { result } = setup(0.8, onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100, 2)); });
    expect(result.current.phase).toBe('idle');
  });

  it('el press sin objetivo válido no arma', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useEdgeGesture({
      resolveTarget: () => null,
      resolveReleaseT: () => 0.8,
      onCommit,
    }));
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    expect(result.current.phase).toBe('idle');
  });

  it('captura el puntero en el press para que el release fuera del lienzo llegue', () => {
    const { result } = setup(0.8, vi.fn());
    const e = mouseEvent(100, 100);
    act(() => { result.current.handleMouseDown(e); });
    expect((e.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> })
      .setPointerCapture).toHaveBeenCalled();
  });

  it('mientras arrastra publica el rango en vivo', () => {
    const { result } = setup(0.8, vi.fn());
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); });
    expect(result.current.liveRange).not.toBeNull();
    expect(result.current.liveRange![1]).toBeCloseTo(0.8, 5);
  });

  it('cruzó el umbral, vuelve cerca del press y suelta ahí: sigue siendo ARRASTRE (borde curvo)', () => {
    // resolveReleaseT fijo en 0.8 a propósito: en un borde curvo la cuerda en
    // pantalla puede volver casi al origen mientras el arco sigue lejísimos.
    // El umbral, una vez cruzado, no se re-evalúa (spec § 6, conflicto 2).
    const onCommit = vi.fn();
    const { result } = renderHook(() => useEdgeGesture({
      resolveTarget: () => target,
      resolveReleaseT: () => 0.8,
      onCommit,
    }));
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); }); // cruza el umbral
    act(() => { result.current.handleMouseUp(mouseEvent(101, 100)); }); // vuelve a 1px del press
    const commit = onCommit.mock.calls[0][0];
    expect(commit.kind).toBe('drag');
    expect(commit.range[0]).toBeCloseTo(0.2, 5);
    expect(commit.range[1]).toBeCloseTo(0.8, 5);
  });

  // ─── El primer cruce del umbral (familia DISTANCIA, tanda 2b) ────────────
  // Spec § 3.2: la dirección la fijan "los primeros 4 px de recorrido
  // proyectados sobre el borde". El hook tiene que RECORDAR ese instante: al
  // soltar ya no se puede reconstruir.

  /** `resolveReleaseT` que va devolviendo una lista, un valor por llamada. */
  function setupSecuencia(ts: number[], onCommit: (c: EdgeCommit) => void) {
    let i = 0;
    return renderHook(() => useEdgeGesture({
      resolveTarget: () => target,
      resolveReleaseT: () => ts[Math.min(i++, ts.length - 1)],
      onCommit,
    }));
  }

  it('guarda el t del instante en que se cruzó el umbral', () => {
    const onCommit = vi.fn();
    // Al cruzar devuelve 0.35; después el cursor sigue hasta 0.9.
    const { result } = setupSecuencia([0.35, 0.6, 0.9], onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); }); // cruza
    act(() => { result.current.handleMouseMove(mouseEvent(200, 100)); });
    act(() => { result.current.handleMouseUp(mouseEvent(260, 100)); });
    const commit = onCommit.mock.calls[0][0];
    expect(commit.firstDragT).toBeCloseTo(0.35, 6);
  });

  it('el primer cruce NO se re-escribe en los movimientos siguientes', () => {
    // Es el fallo que este campo existe para evitar: si se sobrescribiera, al
    // volverse el cursor la dirección cambiaría a mitad de gesto.
    const onCommit = vi.fn();
    const { result } = setupSecuencia([0.35, 0.1, 0.05], onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); }); // cruza en 0.35
    act(() => { result.current.handleMouseMove(mouseEvent(160, 100)); }); // se vuelve
    act(() => { result.current.handleMouseUp(mouseEvent(180, 100)); });   // suelta antes del press
    const commit = onCommit.mock.calls[0][0];
    expect(commit.firstDragT).toBeCloseTo(0.35, 6);
    expect(commit.releaseT).toBeCloseTo(0.05, 6);
    // Arrancó hacia arriba del press (0.2) y soltó por debajo: los dos signos
    // discrepan, y ese es justo el caso en que el spec manda el del arranque.
    expect(commit.firstDragT).toBeGreaterThan(target.t);
    expect(commit.releaseT).toBeLessThan(target.t);
  });

  it('si el cursor se sale del borde al cruzar, el primer cruce queda sin fijar', () => {
    // `resolveReleaseT` null = fuera del borde. No hay proyección, así que no
    // hay dirección todavía; la fija el primer movimiento que sí proyecte.
    const onCommit = vi.fn();
    let i = 0;
    const ts: (number | null)[] = [null, 0.7, 0.9];
    const { result } = renderHook(() => useEdgeGesture({
      resolveTarget: () => target,
      resolveReleaseT: () => ts[Math.min(i++, ts.length - 1)],
      onCommit,
    }));
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseMove(mouseEvent(140, 100)); }); // cruza, pero fuera
    act(() => { result.current.handleMouseMove(mouseEvent(160, 100)); }); // ya proyecta: 0.7
    act(() => { result.current.handleMouseUp(mouseEvent(180, 100)); });
    const commit = onCommit.mock.calls[0][0];
    expect(commit.firstDragT).toBeCloseTo(0.7, 6);
  });

  it('un clic no produce primer cruce', () => {
    const onCommit = vi.fn();
    const { result } = setupSecuencia([0.8], onCommit);
    act(() => { result.current.handleMouseDown(mouseEvent(100, 100)); });
    act(() => { result.current.handleMouseUp(mouseEvent(101, 100)); });
    expect(onCommit.mock.calls[0][0].kind).toBe('click');
  });
});
