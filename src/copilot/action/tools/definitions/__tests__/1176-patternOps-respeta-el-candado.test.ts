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

/** Internas REALES, no ids inventados: sin ellas cuatro herramientas se caen
 *  en su propia validación y el CONTROL endurecido de #1187 no puede afirmar
 *  éxito. El contorno es el rectángulo de arriba: sideSeam es el lado derecho
 *  (100,0)→(100,200) y hemline el borde inferior (100,200)→(0,200). */
const internals: PatternPiece['internals'] = [
  // Pinza en V sobre el hemline: base (40,200) → ápice (50,150) → base (60,200).
  {
    id: 'dart1', type: 'dart',
    path: [
      { type: 'M', values: [40, 200] }, { type: 'L', values: [50, 150] }, { type: 'L', values: [60, 200] },
    ],
  },
  // Doblez de centro delantero: el lado izquierdo entero, de vértice a
  // vértice. `unfoldPiece` exige que los dos extremos caigan a ≤2 de un
  // VÉRTICE del contorno, no de cualquier punto de él — uno por el medio de
  // un lado se rechaza con "endpoints are not on the piece outline".
  {
    id: 'fold1', type: 'fold',
    path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [0, 200] }],
    foldOptions: { direction: 'valley', creaseAngleDeg: 180 },
  },
  // Referencia de esquina a esquina del hemline, hundida por el medio: sirve
  // de fuente para el offset y de candidata a contorno del tramo [2,3].
  {
    id: 'ref1', type: 'reference',
    path: [
      { type: 'M', values: [100, 200] }, { type: 'L', values: [50, 180] }, { type: 'L', values: [0, 200] },
    ],
  },
] as PatternPiece['internals'];

function mockPiece(id: string, extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id, outline, internals: JSON.parse(JSON.stringify(internals)), position: { x: 0, y: 0 },
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
  { nombre: 'replaceAsPatternOutline', params: (pieceId) => ({ pieceId, internalLineId: 'ref1', outlineSegmentRange: [2, 3] }) },
  // Las seis de abajo NO estaban en el censo original del issue #1176 —el
  // issue solo nombraba las siete de arriba—; salieron de censar el archivo
  // completo por la REGLA (¿quién hace `dispatch(updatePiece(...))` o
  // `dispatch(removePiece(...))` sobre la pieza YA EXISTENTE, no sobre una
  // derivada?) en vez de confiar en la lista que yo mismo escribí. Misma
  // lección que #1145: el censo se mide con la regla, no con el grep que te
  // trajo hasta ella.
  { nombre: 'addFullness', params: (pieceId) => ({ pieceId, edge: 'hemline', amount: 20 }) },
  // La pinza vive EN el hemline, así que se transfiere al sideSeam: moverla
  // a su propio borde no es una transferencia.
  { nombre: 'transferDart', params: (pieceId) => ({ pieceId, dartId: 'dart1', toEdge: 'sideSeam' }) },
  { nombre: 'unfoldPiece', params: (pieceId) => ({ pieceId, foldLineId: 'fold1' }) },
  { nombre: 'optimizeCurvePoints', params: (pieceId) => ({ pieceId }) },
  { nombre: 'offsetInternalLine', params: (pieceId) => ({ pieceId, sourceLineId: 'ref1', distance: 5 }) },
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
    // Se afirma ÉXITO REAL, no la ausencia de la palabra "lock" (#1187): con
    // la aserción negativa, mutar `lockedPieceError` para que rechace TODO
    // con un mensaje en español dejaba los 14 CONTROL en verde con las 14
    // herramientas inutilizables. Es lo que dejó pasar #1184.
    expect(result.success, `${nombre} no llegó a hacer nada: ${result.error ?? ''}`).toBe(true);
  });
});

describe('#1184 — offsetPattern en modo previsualización no mira el candado de nadie', () => {
  // El modo no-`replace` (el default) LEE la pieza para construir una NUEVA
  // vía `addPiece` — nunca escribe sobre la original. Misma exención que el
  // modo-pieza de `polyPenDraw` de abajo, que el comentario de ese bloque ya
  // daba por cierta mientras el código hacía lo contrario.
  it.each([
    ['PIEZA', { locked: true } as Partial<PatternPiece>, {} as Record<number, boolean>],
    ['CAPA', { layer: 3 } as Partial<PatternPiece>, { 3: true }],
  ])('con el candado de %s puesto, el offset de previsualización se hace igual', async (_cual, extra, capas) => {
    const dispatchLocal = vi.fn() as unknown as AppDispatch;
    const tool = tools.find(t => t.name === 'offsetPattern')!;
    const state = mockState([mockPiece('p', extra)], capas);

    const result = await tool.execute({ pieceId: 'p', distance: 10 }, dispatchLocal, () => state);

    expect(result.success, 'el modo previsualización se rechazó por un candado que no le toca').toBe(true);
    expect(result.data).toMatchObject({ replaced: false });
    // Lo que prueba la exención: nació una pieza, no se pisó la bloqueada.
    const tipos = (dispatchLocal as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([accion]) => (accion as { type: string }).type);
    expect(tipos.some(t => t.endsWith('addPiece'))).toBe(true);
    expect(tipos.some(t => t.endsWith('updatePiece'))).toBe(false);
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
    expect(result.success, `el modo pieza nueva se rechazó: ${result.error ?? ''}`).toBe(true);
  });
});
