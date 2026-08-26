// @vitest-environment jsdom
/**
 * #1068 — el tramo de margen se medía contra el fantasma sin girar.
 *
 * `resolveSeamAllowanceClick` ya viaja por el transform desde #1064, así que
 * QUE BORDE se engancha sale bien. Lo que seguía restando solo `position` era
 * el `t` a lo largo de ese borde: el del press y el del release. O sea, se
 * acierta el borde y se pinta el margen en OTRO pedazo de él.
 *
 * Es la queja del margen de costura de Maria (#220 / #1027) por el lado del
 * giro. Y no es cosmetico: `onApplySpan` escribe el patron.
 *
 * Rectangulo, no cuadrado: un cuadrado girado 90 ocupa el mismo sitio.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import type { PatternPiece, SemanticEdge } from '../../../types/types';
import { useSeamAllowanceTool } from '../useSeamAllowanceTool';

afterEach(cleanup);

/** 200 x 80 en local; centro del bbox (100, 40). */
const outline = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 80] },
  { type: 'L', values: [0, 80] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

const edges: SemanticEdge[] = [
  { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: 'p:right', name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
  { id: 'p:bottom', name: 'bottom', segmentRange: [3, 4], edgeType: 'hem' },
];

function pieza(rotation: number): PatternPiece {
  return {
    id: 'p', name: 'p', outline,
    position: { x: 0, y: 0 }, rotation,
    mirrored: false, active: true, seamAllowance: 0,
    internals: [], edges,
  } as unknown as PatternPiece;
}

function mouseAt(x: number, y: number) {
  return {
    button: 0, shiftKey: false, clientX: x, clientY: y, pointerId: 7,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function setup(piece: PatternPiece) {
  const callbacks = {
    onApply: vi.fn(), onApplyAll: vi.fn(), onApplySpan: vi.fn(),
    onSelectEdge: vi.fn(), onSelectVertex: vi.fn(),
  };
  const store = configureStore({ reducer: { editor: editorReducer } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    () => useSeamAllowanceTool([piece], 1, { x: 0, y: 0 }, callbacks),
    { wrapper },
  );
  return { hook, ...callbacks };
}

// Girado 90 sobre (100,40), el borde local (0,0)->(200,0) se VE como la
// vertical x=140, de y=-60 a y=140. El 25% y el 75% de ese recorrido caen en
// y=-10 e y=90.
const AL_25 = { x: 140, y: -10 };
const AL_75 = { x: 140, y: 90 };

describe('#1068 — el tramo de margen sobre una pieza girada', () => {
  it('el arrastre escribe el tramo que la mano recorrio', () => {
    const { hook, onApplySpan } = setup(pieza(90));

    act(() => hook.result.current.handleMouseDown(mouseAt(AL_25.x, AL_25.y)));
    act(() => hook.result.current.handleMouseMove(mouseAt(AL_75.x, AL_75.y)));
    act(() => hook.result.current.handleMouseUp(mouseAt(AL_75.x, AL_75.y)));

    expect(onApplySpan).toHaveBeenCalledTimes(1);
    const [pieceId, edgeId, range] = onApplySpan.mock.calls[0];
    expect(pieceId).toBe('p');
    expect(edgeId).toBe('p:top');
    expect(range[0]).toBeCloseTo(0.25, 2);
    expect(range[1]).toBeCloseTo(0.75, 2);
  });

  it('engancha el borde que se VE, no el que estaba antes de girar', () => {
    // Sin el fix este mismo clic ya acertaba el borde (eso lo arreglo #1064);
    // el test esta aqui para que arreglar el `t` no rompa la clasificacion.
    const { hook, onSelectEdge } = setup(pieza(90));

    act(() => hook.result.current.handleMouseDown(mouseAt(AL_25.x, AL_25.y)));
    act(() => hook.result.current.handleMouseUp(mouseAt(AL_25.x, AL_25.y)));

    expect(onSelectEdge).toHaveBeenCalledWith('p', 'p:top', false);
  });

  it('sin rotacion se comporta igual que siempre', () => {
    // El mismo 25%-75% sobre el borde sin girar: (50,0) -> (150,0).
    const { hook, onApplySpan } = setup(pieza(0));

    act(() => hook.result.current.handleMouseDown(mouseAt(50, 0)));
    act(() => hook.result.current.handleMouseMove(mouseAt(150, 0)));
    act(() => hook.result.current.handleMouseUp(mouseAt(150, 0)));

    const [, edgeId, range] = onApplySpan.mock.calls[0];
    expect(edgeId).toBe('p:top');
    expect(range[0]).toBeCloseTo(0.25, 2);
    expect(range[1]).toBeCloseTo(0.75, 2);
  });
});
