// @vitest-environment jsdom
/**
 * La herramienta Punto entra en la ley del gesto de borde (#1029, tanda 2b).
 *
 * El press fija la pieza, el borde y el comando; el release solo aporta una
 * posición de arco dentro de ese borde. Esto cambia a propósito la regla vieja
 * de `usePointTool`: incluso bajo el umbral manda el press, no el release.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md
 * § 2 (el press manda el objeto) y § 3.2 (distancia por arco).
 */
import React, { forwardRef, useImperativeHandle } from 'react';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import editorReducer, { setActiveTool } from '../../../store/editorSlice';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import type { PatternPiece, Point2D, Tool2D } from '../../../types/types';
import { usePointTool, type PointToolMode } from '../usePointTool';

type PointApi = ReturnType<typeof usePointTool>;

const verbs = {
  addPointOnSegment: vi.fn(),
  convertSegment: vi.fn(),
  convertSegmentToPoints: vi.fn(),
};

function recta(id: string, position: Point2D = { x: 0, y: 0 }): PatternPiece {
  return {
    id,
    name: id,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position,
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  } as PatternPiece;
}

const CURVA_ASIMETRICA: PatternPiece = {
  ...recta('curva'),
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'C', values: [20, 60, 60, 110, 110, 130] },
    { type: 'L', values: [0, 130] },
    { type: 'Z', values: [] },
  ],
};

const Harness = forwardRef<PointApi, { pieces: PatternPiece[] }>(function Harness({ pieces }, ref) {
  const api = usePointTool(1, { x: 0, y: 0 }, pieces, verbs);
  useImperativeHandle(ref, () => api, [api]);
  return <svg />;
});

function setup(pieces: PatternPiece[]) {
  const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
  store.dispatch(setActiveTool('point' as Tool2D));
  const ref = React.createRef<PointApi>();
  render(<Provider store={store}><Harness ref={ref} pieces={pieces} /></Provider>);
  return { store, ref };
}

const mouseAt = (point: Point2D): React.MouseEvent<SVGSVGElement> => ({
  button: 0,
  clientX: point.x,
  clientY: point.y,
  currentTarget: {
    getBoundingClientRect: () => ({
      left: 0, top: 0, width: 800, height: 600,
      right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    }),
  },
} as unknown as React.MouseEvent<SVGSVGElement>);

function gesto(
  ref: React.RefObject<PointApi | null>,
  press: Point2D,
  release: Point2D = press,
) {
  act(() => ref.current!.handleMouseDown(mouseAt(press)));
  if (release !== press) act(() => ref.current!.handleMouseMove(mouseAt(release)));
  act(() => ref.current!.handleMouseUp(mouseAt(release)));
}

beforeEach(() => {
  verbs.addPointOnSegment.mockClear();
  verbs.convertSegment.mockClear();
  verbs.convertSegmentToPoints.mockClear();
});

describe('usePointTool — distancia y propiedad del press', () => {
  it('bajo el umbral inserta en el punto del PRESS, no donde se suelta', () => {
    // Esta diferencia de 2 mm es menor que los 4 px del gesto, pero no es cero.
    // La regla anterior despachaba 0,42; la ley nueva conserva el 0,40 del press.
    const { ref } = setup([recta('p1')]);
    gesto(ref, { x: 40, y: 0 }, { x: 42, y: 0 });

    expect(verbs.addPointOnSegment).toHaveBeenCalledWith(1, 0.4, 'p1');
  });

  it('el press fija la pieza aunque el release caiga sobre otra', () => {
    // Re-resolver al soltar escribiría en p2. El release puede clampear el
    // valor al extremo de p1, pero nunca cambiar el objeto dueño del gesto.
    const { ref } = setup([recta('p1'), recta('p2', { x: 200, y: 0 })]);
    gesto(ref, { x: 50, y: 0 }, { x: 250, y: 0 });

    expect(verbs.addPointOnSegment).toHaveBeenCalledWith(1, 1, 'p1');
  });

  it('el press fija el borde aunque el release caiga sobre otro de la pieza', () => {
    // En el rectángulo, el borde de arriba es el comando 1 y el de abajo el 3.
    // Cambiar el comando a 3 sería volver a la filosofía vieja del release.
    const { ref } = setup([recta('p1')]);
    gesto(ref, { x: 50, y: 0 }, { x: 50, y: 100 });

    expect(verbs.addPointOnSegment).toHaveBeenCalledWith(1, 1, 'p1');
  });

  it('sobre una curva despacha t NATIVO, no fracción de arco', () => {
    // Oráculo independiente: integración con 4.000.000 muestras.
    // Arco total = 175,558688 mm. En 65 % del arco:
    //   t nativo = 0,6291614705; punto = (59,009839, 96,392742).
    // Despachar 0,65 partiría la Bézier 3,7 mm más adelante.
    const { ref } = setup([CURVA_ASIMETRICA]);
    gesto(
      ref,
      { x: 13.255499, y: 32.485779 }, // 20 % del arco; lejos de las anclas.
      { x: 59.009839, y: 96.392742 }, // 65 % del arco.
    );

    const [commandIndex, nativeT, pieceId] = verbs.addPointOnSegment.mock.calls[0];
    expect(commandIndex).toBe(1);
    expect(nativeT).toBeCloseTo(0.6291614705, 5);
    expect(nativeT).not.toBeCloseTo(0.65, 2);
    expect(pieceId).toBe('curva');
  });

  it.each(['curvePoints', 'bezier'] as const)(
    'un arrastre en modo %s convierte el segmento del PRESS',
    (mode: PointToolMode) => {
    // Estos verbos convierten el comando entero: el arrastre no les añade una
    // cantidad. Aun así, cruzar el umbral debe cerrar como clic sobre el press.
    const { store, ref } = setup([recta('p1')]);
    act(() => {
      store.dispatch(setToolOption({ toolId: 'point', optionId: 'mode', value: mode }));
    });
    gesto(ref, { x: 30, y: 0 }, { x: 50, y: 100 });

    if (mode === 'curvePoints') {
      expect(verbs.convertSegmentToPoints).toHaveBeenCalledWith(1, 'p1');
      expect(verbs.convertSegment).not.toHaveBeenCalled();
    } else {
      expect(verbs.convertSegment).toHaveBeenCalledWith(1, true, 'p1');
      expect(verbs.convertSegmentToPoints).not.toHaveBeenCalled();
    }
    },
  );
});
