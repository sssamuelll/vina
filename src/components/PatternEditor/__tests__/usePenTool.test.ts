// @vitest-environment jsdom
/**
 * usePenTool — reset() clears an in-progress stroke. Nota de María #168:
 * an abandoned stroke reappeared "already placed" when re-activating the pen
 * after switching tools without pressing Esc.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { usePenTool } from '../usePenTool';

afterEach(cleanup);

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
