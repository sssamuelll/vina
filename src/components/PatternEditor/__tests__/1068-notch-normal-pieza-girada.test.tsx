// @vitest-environment jsdom
/**
 * #1068 — el PUNTO del piquete giraba y su NORMAL no.
 *
 * Otra DIVISION que abri yo en el lote 1: gire `worldPoint` en
 * `resolveTargetOnRing` y deje `normal: resolved.normal` crudo, en local. El
 * objeto que devuelve esa funcion tiene DOS consumidores y los dos esperan
 * espacio de patron:
 *
 *  - `NotchToolOverlay` combina `point` (girado) con `normal` (sin girar) en la
 *    misma linea de hover, asi que la marca sale PARALELA al borde en vez de
 *    perpendicular.
 *  - `createNotchLine` documenta en su cuerpo que "Punto y normal llegan en
 *    espacio de patron" y le aplica `patternToPieceLocalDirection`. Con una
 *    normal que ya venia en local, le quita un giro que nadie le habia puesto:
 *    el piquete GUARDADO queda apuntando de lado.
 *
 * Lo segundo no es cosmetico — es geometria que se persiste.
 */
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import toolReducer from '../../../store/toolSlice';
import type { InternalLine, PatternPiece } from '../../../types/types';
import { useNotchTool } from '../useNotchTool';

/** 100 x 40 en local. Centro del bbox: (50, 20). */
const pieza = (rotation: number) => ({
  id: 'p1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 40] },
    { type: 'L', values: [0, 40] },
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 },
  rotation,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  active: true,
  createdAt: 0,
  updatedAt: 0,
}) as unknown as PatternPiece;

const ev = (x: number, y: number) => ({
  button: 0,
  clientX: x,
  clientY: y,
  currentTarget: {
    getBoundingClientRect: () => ({
      left: 0, top: 0, width: 800, height: 600,
      right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    }),
  },
}) as unknown as React.MouseEvent<SVGSVGElement>;

function setup(rotation: number) {
  const store = configureStore({ reducer: { tools: toolReducer } });
  const onAddNotch = vi.fn<(pieceId: string, notch: InternalLine) => void>();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
  const { result } = renderHook(
    () => useNotchTool(1, { x: 0, y: 0 }, [pieza(rotation)], onAddNotch),
    { wrapper },
  );
  return { result, onAddNotch };
}

describe('#1068 — la normal del piquete sobre una pieza girada', () => {
  it('la normal del hover apunta perpendicular al borde que SE VE', () => {
    // Sobre el borde local (0,0)->(100,0) la herramienta da la normal (0,1)
    // —medido a rotacion 0, no asumido: en SVG la y crece hacia abajo y ese
    // borde es el de arriba, asi que la normal entra en la pieza—. Girado 90
    // ese borde se ve como la vertical x=70, y su normal se ve como (-1,0).
    // Sin el fix sale (0,1): PARALELA al borde visible en vez de cruzarlo.
    const h = setup(90);
    act(() => { h.result.current.handleMouseMove(ev(70, 20)); });

    const hov = h.result.current.hoveredPoint;
    expect(hov).not.toBeNull();
    expect(hov!.normal.x).toBeCloseTo(-1, 3);
    expect(hov!.normal.y).toBeCloseTo(0, 3);
  });

  it('sin rotacion la normal es la de siempre', () => {
    const h = setup(0);
    act(() => { h.result.current.handleMouseMove(ev(50, 0)); });
    const hov = h.result.current.hoveredPoint!;
    expect(hov.normal.x).toBeCloseTo(0, 3);
    expect(hov.normal.y).toBeCloseTo(1, 3);
  });

  it('la normal del hover es perpendicular al borde, gire o no gire', () => {
    // La propiedad de verdad, sin numeros magicos: la marca de hover cruza el
    // borde. Producto escalar con la direccion del borde visible = 0.
    for (const rot of [0, 90]) {
      const h = setup(rot);
      act(() => { h.result.current.handleMouseMove(ev(rot === 0 ? 50 : 70, rot === 0 ? 0 : 20)); });
      const hov = h.result.current.hoveredPoint!;
      expect(hov).not.toBeNull();
      // Direccion del borde local (1,0) girada: (cos, sin) del angulo.
      const rad = (rot * Math.PI) / 180;
      const dir = { x: Math.cos(rad), y: Math.sin(rad) };
      expect(hov.normal.x * dir.x + hov.normal.y * dir.y).toBeCloseTo(0, 3);
    }
  });

  it('el piquete GUARDADO apunta igual gire o no gire la pieza', () => {
    // `path` se persiste en espacio local, asi que la misma posicion sobre el
    // mismo borde tiene que dar el mismo trazo con y sin rotacion. Sin el fix
    // `createNotchLine` le quita a la normal un giro que nadie le puso y el
    // piquete guardado sale apuntando de lado.
    const recto = setup(0);
    act(() => { recto.result.current.handleMouseDown(ev(50, 0)); });
    act(() => { recto.result.current.handleMouseUp(ev(50, 0)); });

    const girado = setup(90);
    act(() => { girado.result.current.handleMouseDown(ev(70, 20)); });
    act(() => { girado.result.current.handleMouseUp(ev(70, 20)); });

    expect(recto.onAddNotch).toHaveBeenCalledTimes(1);
    expect(girado.onAddNotch).toHaveBeenCalledTimes(1);
    const pathRecto = recto.onAddNotch.mock.calls[0][1].path;
    const pathGirado = girado.onAddNotch.mock.calls[0][1].path;
    expect(pathGirado).toEqual(pathRecto);
  });
});
