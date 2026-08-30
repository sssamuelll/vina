import { describe, it, expect } from 'vitest';
import { resizePieceTo, scalePiecesAroundAnchor } from '../pieceResize';
import { computeBoundingBox, scaleAnchorForHandle } from '../../../utils/geometry/transform';
import { pieceLocalToPattern } from '../pieceTransform';
import { resolveNotchAnchor } from '../../../utils/notchAnchor';
import type { PatternPiece, PathCommand } from '../../../types/types';

/**
 * Cotas vivas, PR A (spec 2026-08-30 § 4.3): "Ancho = 300" y arrastrar el
 * manejador inferior derecho son la MISMA operación. El bloque de escala que
 * vivía en `useTransformTool.handleMouseUp` se extrae a `pieceResize.ts` y los
 * dos caminos lo comparten; este archivo fija que la extracción no cambió nada.
 */
const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] },
  { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const pieza = (over: Partial<PatternPiece> = {}): PatternPiece => ({
  id: 'p1', name: 'P1', outline: rect(100, 100), internals: [], position: { x: 50, y: 50 },
  rotation: 0, mirrored: false, seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0,
  ...over,
} as PatternPiece);
const bboxDe = (p: PatternPiece) => {
  const b = computeBoundingBox([p], [p.id])!;
  return { w: b.width, h: b.height };
};

describe('resizePieceTo', () => {
  it('sin giro: escribe el ancho y el alto y deja la esquina superior izquierda plantada', () => {
    const p = pieza();
    const u = resizePieceTo(p, 300, 150)!;
    expect(u.id).toBe('p1');
    const after = { ...p, ...u };
    expect(bboxDe(after)).toEqual({ w: 300, h: 150 });
    expect(u.position).toEqual({ x: 50, y: 50 });
    expect(u.outline[0].values).toEqual([0, 0]);
  });

  it('con giro de 30°: conserva la rotación, la esquina superior izquierda no se mueve en patrón, y las internas y el piquete acompañan', () => {
    const p = pieza({
      rotation: 30,
      internals: [
        { id: 'l1', type: 'reference', path: [{ type: 'M', values: [10, 10] }, { type: 'L', values: [90, 90] }] },
        { id: 'n1', type: 'notch', path: [{ type: 'M', values: [50, 0] }, { type: 'L', values: [50, 6] }],
          notchAnchor: { refPoint: { x: 0, y: 0 }, direction: 'cw', distanceMm: 50, metric: 2 } },
      ],
    });
    const nwAntes = pieceLocalToPattern({ x: 0, y: 0 }, p);
    const u = resizePieceTo(p, 200, 100)!;
    const after = { ...p, ...u };
    expect(u.rotation).toBe(30);
    expect(bboxDe(after)).toEqual({ w: 200, h: 100 });
    const nwDespues = pieceLocalToPattern({ x: 0, y: 0 }, after);
    expect(nwDespues.x).toBeCloseTo(nwAntes.x, 6);
    expect(nwDespues.y).toBeCloseTo(nwAntes.y, 6);
    expect(u.internals[0].path[1].values[0]).toBeCloseTo(180, 6);
    expect(u.internals[0].path[1].values[1]).toBeCloseTo(90, 6);
    const notch = u.internals[1];
    const resolved = resolveNotchAnchor(u.outline, notch.notchAnchor!)!;
    expect(resolved.point.y).toBeCloseTo(0, 6);
  });

  it('es el mismo camino que el handle: scalePiecesAroundAnchor con el ancla del handle "se" da el mismo resultado', () => {
    const p = pieza({ rotation: 30 });
    const bbox = computeBoundingBox([p], [p.id])!;
    const porHandle = scalePiecesAroundAnchor([p], bbox, 2, 0.5, scaleAnchorForHandle('se', bbox))[0];
    const porCota = resizePieceTo(p, 200, 50)!;
    expect(porCota).toEqual(porHandle);
  });

  it('devuelve null con medidas no positivas o pieza sin área', () => {
    expect(resizePieceTo(pieza(), 0, 100)).toBeNull();
    expect(resizePieceTo(pieza({ outline: [] }), 100, 100)).toBeNull();
  });
});
