// @vitest-environment jsdom
/**
 * Sustitución automatizada de la comprobación manual de la tanda 2b.
 *
 * El DXF real no conserva comandos `C`: el importador entrega las sisas como
 * polilíneas densas. Por eso la curva real se identifica por su borde semántico
 * completo (77 segmentos `L`) y no se reemplaza por una Bézier sintética. Así
 * se ejerce el mismo press → drag → release que usa el editor sobre el archivo
 * que reprodujo #1026.
 */
import { createElement } from 'react';
import type React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import toolReducer from '../../../store/toolSlice';
import type { InternalLine, PathCommand, PatternPiece, Point2D, SemanticEdge } from '../../../types/types';
import { importDXFContent } from '../../../utils/dxf';
import { detectSemanticEdges } from '../../../utils/semanticEdges';
import { useNotchTool } from '../useNotchTool';

const REPO_ROOT = resolve(__dirname, '../../../..');
const FIXTURE = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';

const importedPieces = importDXFContent(
  readFileSync(resolve(REPO_ROOT, FIXTURE), 'utf8'),
  { unit: 'auto', autoDetect: true },
).pieces;

function commandEnd(command: PathCommand): Point2D | null {
  if (command.type === 'M' || command.type === 'L') {
    return { x: command.values[0], y: command.values[1] };
  }
  if (command.type === 'C') {
    return { x: command.values[4], y: command.values[5] };
  }
  if (command.type === 'Q') {
    return { x: command.values[2], y: command.values[3] };
  }
  return null;
}

/**
 * Punto a una distancia literal sobre la polilínea importada. Este oráculo
 * suma los `L` crudos del fixture; no usa `outlineRing`, que es parte del
 * camino de producción bajo prueba.
 */
function pointAtPolylineDistance(
  outline: PathCommand[],
  edge: SemanticEdge,
  distanceMm: number,
): Point2D {
  const [start, end] = edge.segmentRange;
  let previous = commandEnd(outline[start - 1]);
  if (!previous) throw new Error('el borde real no tiene punto inicial');
  let remaining = distanceMm;

  for (let index = start; index < end; index++) {
    const command = outline[index];
    if (command.type !== 'L') {
      throw new Error(`la sisa importada dejó de ser una polilínea en ${index}`);
    }
    const next = { x: command.values[0], y: command.values[1] };
    const length = Math.hypot(next.x - previous.x, next.y - previous.y);
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length;
      return {
        x: previous.x + (next.x - previous.x) * t,
        y: previous.y + (next.y - previous.y) * t,
      };
    }
    remaining -= length;
    previous = next;
  }

  throw new Error(`la distancia ${distanceMm} mm queda fuera de la sisa real`);
}

const mouseEvent = (point: Point2D) => ({
  button: 0,
  clientX: point.x,
  clientY: point.y,
  currentTarget: {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 1600,
      height: 2000,
      right: 1600,
      bottom: 2000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  },
}) as unknown as React.MouseEvent<SVGSVGElement>;

describe('useNotchTool — distancia sobre la sisa real de María', () => {
  it('guarda el arco recorrido y no la cuerda de la sisa', () => {
    const imported = importedPieces.find(piece => piece.name === 'PATRONES PARA SAMUEL-5');
    expect(imported).toBeDefined();

    const edges = detectSemanticEdges(imported!);
    const armhole = edges.find(edge => edge.name === 'rightEdge-2');
    expect(armhole).toBeDefined();
    expect(armhole!.segmentRange).toEqual([5, 82]);
    expect(armhole!.length).toBeCloseTo(230.61, 1);

    // El store añade los bordes tras importar; el hook recibe la misma forma
    // viva, no la pieza cruda cuyo `edges` todavía viene undefined del DXF.
    const piece: PatternPiece = { ...imported!, edges };
    const press = pointAtPolylineDistance(piece.outline, armhole!, 5);
    const release = pointAtPolylineDistance(piece.outline, armhole!, 220);
    const onAddNotch = vi.fn<(pieceId: string, notch: InternalLine) => void>();
    const store = configureStore({ reducer: { tools: toolReducer } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(Provider, { store, children });
    const { result } = renderHook(
      () => useNotchTool(1, { x: 0, y: 0 }, [piece], onAddNotch),
      { wrapper },
    );

    act(() => { result.current.handleMouseDown(mouseEvent(press)); });
    act(() => { result.current.handleMouseMove(mouseEvent(release)); });
    act(() => { result.current.handleMouseUp(mouseEvent(release)); });

    expect(onAddNotch).toHaveBeenCalledTimes(1);
    const notch = onAddNotch.mock.calls[0][1];
    expect(notch.notchAnchor).toBeDefined();
    const anchor = notch.notchAnchor!;
    const [entryX, entryY] = notch.path[0].values;
    const chordMm = Math.hypot(
      entryX - anchor.refPoint.x,
      entryY - anchor.refPoint.y,
    );

    // El nodo nombrable que ve el press está a 4,2457 mm del inicio del borde;
    // el release está a 220 mm. Por eso el arco guardado es 215,7543 mm.
    expect(anchor.refPoint.x).toBeCloseTo(251.5979, 3);
    expect(anchor.refPoint.y).toBeCloseTo(-1264.8972, 3);
    expect(anchor.distanceMm).toBeCloseTo(215.7543, 3);
    expect(chordMm).toBeCloseTo(194.9415, 3);
    // 20,81 mm separan ambas magnitudes: esta tolerancia sí detecta que el
    // arreglo de #1026 se cambie por una medición recta accidentalmente.
    expect(anchor.distanceMm - chordMm).toBeGreaterThan(20);
  });
});
