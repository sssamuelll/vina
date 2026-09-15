// #1176 — el candado se leía para pintar y nunca para el copiloto.
//
// Las siete operaciones de patronaje del copiloto (`tools` de function-
// calling, un sistema distinto del validador de `CopilotAction` que cubre
// `1176-geometria-respeta-el-candado.test.ts`) resuelven la pieza y escriben
// sin mirar `piece.locked` ni `project.layerLocked` en ninguna parte.
import { describe, it, expect, vi } from 'vitest';
import { tools } from '../patternOpsTools';
import type { AppDispatch, RootState } from '../../../../../store';
import type { PatternPiece } from '../../../../../types/types';

const outline: PatternPiece['outline'] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];
const edges = [
  { id: 'p:sideSeam', name: 'sideSeam', segmentRange: [1, 2] as [number, number], edgeType: 'seam' as const },
  { id: 'p:hemline', name: 'hemline', segmentRange: [2, 3] as [number, number], edgeType: 'hem' as const },
];

function mockPiece(id: string, extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id, outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 10, createdAt: 0, updatedAt: 0,
    edges,
    ...extra,
  } as PatternPiece;
}

function mockState(pieces: PatternPiece[], layerLocked: Record<number, boolean> = {}): RootState {
  return {
    project: { id: 't', name: 't', pieces, seams: [], fabrics: [], layerLocked },
  } as unknown as RootState;
}

const dispatch = vi.fn() as unknown as AppDispatch;

/** Cada tool con los parámetros MÍNIMOS que la llevan hasta el guardián: no
 *  hace falta que el resto sea geométricamente perfecto —el candado se mira
 *  justo después de resolver la pieza, antes de cualquier otra cosa—, solo
 *  que `pieceId` apunte a la pieza real. */
const HERRAMIENTAS: Array<{ nombre: string; params: (pieceId: string) => Record<string, unknown> }> = [
  { nombre: 'offsetPattern', params: (pieceId) => ({ pieceId, distance: 10, replace: true }) },
  { nombre: 'extendEdge', params: (pieceId) => ({ pieceId, edgeName: 'sideSeam', endpoint: 'start', distance: 10 }) },
  { nombre: 'trimEdge', params: (pieceId) => ({ pieceId, edgeName: 'sideSeam', trimX: 100, trimY: 100, keepSide: 'start' }) },
  { nombre: 'slashAndSpread', params: (pieceId) => ({ pieceId, fromEdge: 'sideSeam', toEdge: 'hemline', selectedHalf: 'A', spreadAmount: 10 }) },
  { nombre: 'slashAndSpreadSimple', params: (pieceId) => ({ pieceId, position: 0.5, spreadAngleDeg: 10 }) },
  { nombre: 'splitPiece', params: (pieceId) => ({ pieceId, axis: 'horizontal', position: 100, autoSew: false }) },
  { nombre: 'replaceAsPatternOutline', params: (pieceId) => ({ pieceId, internalLineId: 'nope', outlineSegmentRange: [0, 1] }) },
  // Las seis de abajo NO estaban en el censo original del issue #1176 —el
  // issue solo nombraba las siete de arriba—; salieron de censar el archivo
  // completo por la REGLA (¿quién hace `dispatch(updatePiece(...))` o
  // `dispatch(removePiece(...))` sobre la pieza YA EXISTENTE, no sobre una
  // derivada?) en vez de confiar en la lista que yo mismo escribí. Misma
  // lección que #1145: el censo se mide con la regla, no con el grep que te
  // trajo hasta ella.
  { nombre: 'addFullness', params: (pieceId) => ({ pieceId, edge: 'hemline', amount: 20 }) },
  { nombre: 'transferDart', params: (pieceId) => ({ pieceId, dartId: 'nope', toEdge: 'hemline' }) },
  { nombre: 'unfoldPiece', params: (pieceId) => ({ pieceId, foldLineId: 'nope' }) },
  { nombre: 'optimizeCurvePoints', params: (pieceId) => ({ pieceId }) },
  { nombre: 'offsetInternalLine', params: (pieceId) => ({ pieceId, sourceLineId: 'nope', distance: 5 }) },
  // Corta Y COSE: destruye la original y crea dos, la misma clase que
  // splitPiece — solo que además la puede volver a coser.
  { nombre: 'cutAndSew', params: (pieceId) => ({ pieceId, startX: 0, startY: 100, endX: 200, endY: 100 }) },
];

describe('#1176 — las siete herramientas de patronaje del copiloto respetan el candado', () => {
  it.each(HERRAMIENTAS.map(h => h.nombre))('%s: rechaza sobre una pieza con el candado de PIEZA puesto', async (nombre) => {
    const { params } = HERRAMIENTAS.find(h => h.nombre === nombre)!;
    const tool = tools.find(t => t.name === nombre)!;
    const state = mockState([mockPiece('p', { locked: true })]);
    const result = await tool.execute(params('p'), dispatch, () => state);
    expect(result.success, `${nombre} no miró el candado de la pieza`).toBe(false);
    expect(result.error, `${nombre} rechazó por otra razón, no por el candado`).toMatch(/lock/i);
  });

  it.each(HERRAMIENTAS.map(h => h.nombre))('%s: rechaza sobre una pieza con el candado de CAPA puesto', async (nombre) => {
    const { params } = HERRAMIENTAS.find(h => h.nombre === nombre)!;
    const tool = tools.find(t => t.name === nombre)!;
    const state = mockState([mockPiece('p', { layer: 3 })], { 3: true });
    const result = await tool.execute(params('p'), dispatch, () => state);
    expect(result.success, `${nombre} no miró el candado de la capa`).toBe(false);
    expect(result.error).toMatch(/lock/i);
  });

  it.each(HERRAMIENTAS.map(h => h.nombre))('%s: CONTROL — sin candado, no rechaza por candado', async (nombre) => {
    const { params } = HERRAMIENTAS.find(h => h.nombre === nombre)!;
    const tool = tools.find(t => t.name === nombre)!;
    const state = mockState([mockPiece('p')]);
    const result = await tool.execute(params('p'), dispatch, () => state);
    // No se afirma `success: true` — algunas de estas fallan por otras
    // razones con estos parámetros mínimos (p. ej. `replaceAsPatternOutline`
    // con un `internalLineId` inexistente). Lo que prueba el candado es que
    // el mensaje YA NO habla de "lock" cuando no hay ninguno puesto.
    expect(result.error ?? '', `${nombre} rechazó por candado sin haber ninguno`).not.toMatch(/lock/i);
  });
});

describe('#1176 — polyPenDraw: solo la rama que dibuja DENTRO de una pieza existente', () => {
  // La otra rama (`mode:'piece'`, sin `targetPieceId`) crea una pieza nueva
  // y no toca nada existente — no necesita candado, igual que el modo
  // no-reemplazo de Offset.
  const puntos = [{ x: 0, y: 0, type: 'straight' }, { x: 50, y: 50, type: 'straight' }];

  it('rechaza si la pieza objetivo (targetPieceId) está bloqueada', async () => {
    const tool = tools.find(t => t.name === 'polyPenDraw')!;
    const state = mockState([mockPiece('p', { locked: true })]);
    const result = await tool.execute(
      { points: puntos, mode: 'internalLine', targetPieceId: 'p' }, dispatch, () => state,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/lock/i);
  });

  it('CONTROL: modo pieza nueva no mira el candado de nadie', async () => {
    const tool = tools.find(t => t.name === 'polyPenDraw')!;
    const state = mockState([mockPiece('p', { locked: true })]); // bloqueada, pero irrelevante: no es el objetivo
    const result = await tool.execute({ points: puntos, mode: 'piece' }, dispatch, () => state);
    expect(result.error ?? '').not.toMatch(/lock/i);
  });
});
