// @vitest-environment jsdom
/**
 * #1068 — los campos `*World` del piquete se construian sumando solo
 * `piece.position`, sin aplicar `piece.rotation`.
 *
 * `NotchToolOverlay` los pinta como `cx`/`cy` directos y cuelga de
 * `ToolOverlay`, que vive en espacio de patron (`data-pan-zoom-group` solo
 * lleva pan y zoom). O sea: sobre una pieza girada, los marcadores de
 * refinamiento se dibujan donde la pieza estaria SIN girar.
 *
 * La forma es un rectangulo, no un cuadrado, a proposito: un cuadrado girado
 * 90 ocupa exactamente el mismo sitio y el test pasaria con el fallo dentro.
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
const GIRADA: PatternPiece = {
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
  rotation: 90,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  active: true,
  createdAt: 0,
  updatedAt: 0,
} as unknown as PatternPiece;

// Girado 90 sobre (50,20): la esquina local (0,0) se ve en (70,-30), y el
// borde (0,0)->(100,0) se ve como la vertical x=70 entre y=-30 e y=70.
const ESQUINA_VISIBLE = { x: 70, y: -30 };

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

function setup() {
  const store = configureStore({ reducer: { tools: toolReducer } });
  const onAddNotch = vi.fn<(pieceId: string, notch: InternalLine) => void>();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
  const { result } = renderHook(
    () => useNotchTool(1, { x: 0, y: 0 }, [GIRADA], onAddNotch),
    { wrapper },
  );
  return { result, onAddNotch };
}

describe('#1068 — el piquete sobre una pieza girada', () => {
  it('la esquina de referencia cae donde la esquina se VE', () => {
    const h = setup();
    // Sobre el borde tal y como se ve: la vertical x=70.
    act(() => { h.result.current.handleMouseDown(ev(70, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(70, 30)); });

    const preview = h.result.current.dragPreview;
    expect(preview).not.toBeNull();
    // Sin el fix sale (0,0) — la esquina sin girar, a 76 unidades de donde se ve.
    expect(preview!.refWorld.x).toBeCloseTo(ESQUINA_VISIBLE.x, 3);
    expect(preview!.refWorld.y).toBeCloseTo(ESQUINA_VISIBLE.y, 3);
  });

  it('el punto vivo sigue al cursor, no a su sombra sin girar', () => {
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(70, 0)); });
    act(() => { h.result.current.handleMouseMove(ev(70, 30)); });

    const preview = h.result.current.dragPreview;
    expect(preview!.currentWorld.x).toBeCloseTo(70, 3);
    expect(preview!.currentWorld.y).toBeCloseTo(30, 3);
  });
});
