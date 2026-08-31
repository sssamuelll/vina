// @vitest-environment jsdom
/**
 * #1096 — María, audio 2026-08-30 [09:05]: "ya me ha creado tipo bezier si yo
 * no he hecho nada… porque habré arrastrado sin querer."
 *
 * La pluma curvaba con CUALQUIER movimiento entre down y up: un píxel de
 * temblor ya era un arrastre. El resto de las herramientas (rectángulo,
 * línea interna, margen) usan `DRAG_THRESHOLD_PX` = 4 (`gestureConstants`,
 * spec 2026-08-11 § 3.5): por debajo es clic, `>=` es arrastre. La pluma
 * tiene que responder al mismo número — un umbral por herramienta enseñaría
 * "en esta hay que moverse más".
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePenTool } from '../usePenTool';
import { DRAG_THRESHOLD_PX } from '../gestureConstants';

function ev(x: number, y: number) {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

/** Un nodo con `dx` px de recorrido entre down y up, un segundo nodo limpio, Enter. */
function trazar(dx: number): string[] {
  const onComplete = vi.fn();
  const { result } = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));
  const tool = () => result.current;
  act(() => tool().handleMouseDown(ev(10, 10)));
  if (dx > 0) act(() => tool().handleMouseMove(ev(10 + dx, 10)));
  act(() => tool().handleMouseUp());
  act(() => { tool().handleMouseDown(ev(100, 10)); tool().handleMouseUp(); });
  act(() => { tool().handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' })); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  const outline = onComplete.mock.calls[0][0].outline as Array<{ type: string }>;
  return outline.map((c) => c.type);
}

describe('#1096 — la pluma respeta el umbral de arrastre', () => {
  it('sin moverse: tramo recto', () => {
    expect(trazar(0)).toEqual(['M', 'L']);
  });

  it('por debajo del umbral (3 px) sigue siendo un clic: tramo recto', () => {
    expect(trazar(DRAG_THRESHOLD_PX - 1)).toEqual(['M', 'L']);
  });

  it('justo en el umbral (4 px, `>=`) es arrastre: bezier', () => {
    expect(trazar(DRAG_THRESHOLD_PX)).toEqual(['M', 'C']);
  });

  it('un arrastre claro (12 px) curva, como antes', () => {
    expect(trazar(12)).toEqual(['M', 'C']);
  });

  it('tras cruzar el umbral, la manija sigue al ratón aunque vuelva cerca del ancla', () => {
    // Cruzar el umbral arma el arrastre; lo que cuenta después es dónde se
    // suelta, no cuánto se alejó en algún momento.
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));
    const tool = () => result.current;
    act(() => tool().handleMouseDown(ev(10, 10)));
    act(() => tool().handleMouseMove(ev(30, 10)));
    act(() => tool().handleMouseMove(ev(11, 10)));
    act(() => tool().handleMouseUp());
    expect(tool().nodes[0].handleOut).toEqual({ x: 11, y: 10 });
    expect(tool().nodes[0].handleIn).toEqual({ x: 9, y: 10 });
  });

  it('Supr a mitad de un press cierra el press: mover después no curva el nodo anterior', () => {
    // Review de codex (MEDIUM 9): down crea B y deja el press abierto; Supr
    // quitaba B sin cerrar el press, y el siguiente movimiento (pasado el
    // umbral) escribía las manijas de A.
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePenTool(1, { x: 0, y: 0 }, onComplete));
    const tool = () => result.current;
    act(() => { tool().handleMouseDown(ev(10, 10)); tool().handleMouseUp(); });
    act(() => tool().handleMouseDown(ev(100, 10)));
    act(() => { tool().handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete' })); });
    expect(tool().nodes).toHaveLength(1);
    act(() => tool().handleMouseMove(ev(130, 10)));
    act(() => tool().handleMouseUp());
    expect(tool().nodes[0].handleOut).toBeNull();
    expect(tool().nodes[0].handleIn).toBeNull();
  });
});
