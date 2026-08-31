// @vitest-environment jsdom
/**
 * #1107 — "no hay mucha información, ahí parece que es un atajo pero no se
 * ve… podría indicarme, por ejemplo, que yo pudiera escribir los grados a
 * cero… ¿cómo sé que este es cero?" (María, 32:47).
 *
 * Hallazgo del review adversarial de la tanda 1 (#1096, la pluma sin
 * umbral): el hilo arma y confirma el trazo con
 * `Math.hypot(dx,dy) > 5` en unidades de PATRÓN, contra los 4px de
 * PANTALLA de todas las demás herramientas — a zoom alto, 5mm de patrón son
 * muchos píxeles (un arrastre real no cuenta); a zoom bajo, casi ninguno
 * (un temblor accidental sí cuenta).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGrainlineTool } from '../useGrainlineTool';
import type { PatternPiece } from '../../../types/types';

const pieza: PatternPiece = {
  id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  active: true, locked: false, seamAllowance: 0,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [1000, 0] },
    { type: 'L', values: [1000, 1000] }, { type: 'L', values: [0, 1000] }, { type: 'Z', values: [] },
  ],
  internals: [], edges: [],
} as unknown as PatternPiece;

const rect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
const ev = (clientX: number, clientY: number, extra: Record<string, unknown> = {}) => ({
  button: 0, clientX, clientY, currentTarget: { getBoundingClientRect: () => rect },
  shiftKey: false, ...extra,
} as unknown as React.MouseEvent<SVGSVGElement>);

describe('#1107 — el umbral clic/arrastre del hilo es de PANTALLA, no de patrón', () => {
  it('a zoom alto (10×), 20px de pantalla SÍ arman el hilo (antes: 20px/10 = 2mm < 5, no armaba)', () => {
    const onSetGrainline = vi.fn();
    const { result } = renderHook(() => useGrainlineTool(10, { x: 0, y: 0 }, [pieza], onSetGrainline));
    act(() => result.current.handleMouseDown(ev(100, 100)));
    act(() => result.current.handleMouseMove(ev(120, 100)));
    act(() => result.current.handleMouseUp());
    expect(onSetGrainline).toHaveBeenCalledTimes(1);
  });

  it('a zoom bajo (0,1×), 2px de pantalla NO arman el hilo (antes: 2px/0.1 = 20mm > 5, armaba con un temblor)', () => {
    const onSetGrainline = vi.fn();
    const { result } = renderHook(() => useGrainlineTool(0.1, { x: 0, y: 0 }, [pieza], onSetGrainline));
    act(() => result.current.handleMouseDown(ev(100, 100)));
    act(() => result.current.handleMouseMove(ev(102, 100)));
    act(() => result.current.handleMouseUp());
    expect(onSetGrainline).not.toHaveBeenCalled();
  });

  it('el umbral es el mismo DRAG_THRESHOLD_PX (4px) que pluma, rectángulo y línea interna', () => {
    const onSetGrainline = vi.fn();
    const { result } = renderHook(() => useGrainlineTool(1, { x: 0, y: 0 }, [pieza], onSetGrainline));
    act(() => result.current.handleMouseDown(ev(100, 100)));
    act(() => result.current.handleMouseMove(ev(103, 100))); // 3px: no arma
    act(() => result.current.handleMouseUp());
    expect(onSetGrainline).not.toHaveBeenCalled();
  });
});

describe('#1107 — Shift engancha el ángulo del hilo a 0°/45°/90°', () => {
  it('sin Shift: el ángulo del hilo creado es el real del arrastre, sin enganchar', () => {
    const onSetGrainline = vi.fn();
    const { result } = renderHook(() => useGrainlineTool(1, { x: 0, y: 0 }, [pieza], onSetGrainline));
    act(() => result.current.handleMouseDown(ev(100, 100)));
    act(() => result.current.handleMouseMove(ev(150, 130))); // ángulo oblicuo, no 0/45/90
    act(() => result.current.handleMouseUp());
    const [, grainline] = onSetGrainline.mock.calls[0];
    const [x0, y0] = grainline.path[0].values;
    const [x1, y1] = grainline.path[1].values;
    const angulo = (Math.atan2(-(y1 - y0), x1 - x0) * 180) / Math.PI;
    expect(Math.abs(angulo)).toBeGreaterThan(1);
    expect(Math.abs(angulo % 45)).toBeGreaterThan(1);
  });

  it('con Shift sostenido durante el arrastre: el hilo sale horizontal (0°) para un trazo casi horizontal', () => {
    const onSetGrainline = vi.fn();
    const { result } = renderHook(() => useGrainlineTool(1, { x: 0, y: 0 }, [pieza], onSetGrainline));
    act(() => result.current.handleMouseDown(ev(100, 100)));
    act(() => result.current.handleMouseMove(ev(150, 108), { shiftKey: true })); // casi horizontal, con ruido
    act(() => result.current.handleMouseUp());
    const [, grainline] = onSetGrainline.mock.calls[0];
    const [x0, y0] = grainline.path[0].values;
    const [x1, y1] = grainline.path[1].values;
    expect(y1).toBeCloseTo(y0, 6); // enderezado a 0°
    expect(x1).not.toBeCloseTo(x0, 6); // conserva el largo real, no lo colapsa
  });
});
