// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEdgeGesture } from '../useEdgeGesture';
import type { EdgeTarget, EdgeCommit } from '../edgeGesture';

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
});
