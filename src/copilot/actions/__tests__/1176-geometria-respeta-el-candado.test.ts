// #1176 — el candado se leía para pintar y nunca para el copiloto.
//
// `validateGeometryAction` ya tiene un sitio central (`pieceExists`) que
// protege TODAS estas acciones de un pieceId inexistente. El candado nunca
// se sumó ahí, así que las diez formas de escribir geometría del copiloto
// —mover un punto, añadir uno, borrarlo, holgura, pinza, curvar/enderezar/
// partir un borde, partir la pieza, unir dos— pasaban igual sobre una pieza
// bloqueada.
//
// Censado por la REGLA (¿qué `case` de `validateGeometryAction` escribe
// geometría?), no por la lista del issue: el issue solo nombraba 8 funciones
// de `patternOpsTools.ts`/`actionExecutor.ts`; el validador central tiene
// diez más, todas en un solo switch.
import { describe, it, expect } from 'vitest';
import { validateAction } from '../actionValidator';
import type { RootState } from '../../../store';
import type { CopilotAction } from '../actionTypes';
import type { PatternPiece } from '../../../types/types';

const outline: PatternPiece['outline'] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
];

function mockPiece(id: string, extra: Partial<PatternPiece> = {}) {
  return {
    id, name: id, outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 10, createdAt: 0, updatedAt: 0,
    ...extra,
  } as PatternPiece;
}

function mockState(pieces: PatternPiece[], layerLocked: Record<number, boolean> = {}): RootState {
  return {
    project: { pieces, seams: [], fabrics: [], avatar: { measurements: {} }, name: '', id: '', layerLocked },
    editor: { selectedPieceIds: [] },
    simulation: { simulationState: 'idle' },
  } as unknown as RootState;
}

/** Cada acción, con una pieza LIBRE (`p`) — debe validar. Sirve de CONTROL y
 *  de fixture para la versión bloqueada de la misma acción. */
const ACCIONES: Array<{ nombre: string; accion: (pieceId: string) => CopilotAction }> = [
  { nombre: 'move_point', accion: (pieceId) => ({ action: 'move_point', pieceId, pointIndex: 0, delta: [1, 1] } as CopilotAction) },
  { nombre: 'add_point', accion: (pieceId) => ({ action: 'add_point', pieceId, edgeIndex: 0, position: 0.5 } as CopilotAction) },
  { nombre: 'delete_point', accion: (pieceId) => ({ action: 'delete_point', pieceId, pointIndex: 0 } as CopilotAction) },
  { nombre: 'add_ease', accion: (pieceId) => ({ action: 'add_ease', pieceId, edge: 'all', amount: 5 } as CopilotAction) },
  { nombre: 'add_dart', accion: (pieceId) => ({ action: 'add_dart', pieceId, position: [50, 50], angle: 90, depth: 20 } as CopilotAction) },
  { nombre: 'curve_edge', accion: (pieceId) => ({ action: 'curve_edge', pieceId, edgeIndex: 0, curvature: 0.3 } as CopilotAction) },
  { nombre: 'straighten_edge', accion: (pieceId) => ({ action: 'straighten_edge', pieceId, edgeIndex: 0 } as CopilotAction) },
  { nombre: 'split_edge', accion: (pieceId) => ({ action: 'split_edge', pieceId, edgeIndex: 0, at: 0.5 } as CopilotAction) },
  { nombre: 'split_piece', accion: (pieceId) => ({ action: 'split_piece', pieceId, startPoint: [0, 75], endPoint: [200, 75] } as CopilotAction) },
];

describe('#1176 — las diez acciones geométricas del copiloto respetan el candado', () => {
  it.each(ACCIONES.map(a => a.nombre))('%s: rechaza sobre una pieza con el candado de PIEZA puesto', (nombre) => {
    const { accion } = ACCIONES.find(a => a.nombre === nombre)!;
    const state = mockState([mockPiece('p', { locked: true })]);
    const result = validateAction(accion('p'), state);
    expect(result.valid, `${nombre} no miró el candado de la pieza`).toBe(false);
  });

  it.each(ACCIONES.map(a => a.nombre))('%s: rechaza sobre una pieza con el candado de CAPA puesto', (nombre) => {
    const { accion } = ACCIONES.find(a => a.nombre === nombre)!;
    const state = mockState([mockPiece('p', { layer: 3 })], { 3: true });
    const result = validateAction(accion('p'), state);
    expect(result.valid, `${nombre} no miró el candado de la capa`).toBe(false);
  });

  it.each(ACCIONES.map(a => a.nombre))('%s: CONTROL — sin candado, valida bien', (nombre) => {
    const { accion } = ACCIONES.find(a => a.nombre === nombre)!;
    const state = mockState([mockPiece('p')]);
    const result = validateAction(accion('p'), state);
    expect(result.valid, `${nombre} dejó de validar sin ningún candado puesto`).toBe(true);
  });
});

describe('#1176 — merge_pieces: cualquiera de las dos piezas basta para rechazar', () => {
  it('rechaza si A está bloqueada', () => {
    const state = mockState([mockPiece('a', { locked: true }), mockPiece('b')]);
    const result = validateAction({ action: 'merge_pieces', pieceIdA: 'a', pieceIdB: 'b' } as CopilotAction, state);
    expect(result.valid).toBe(false);
  });

  it('rechaza si B está bloqueada', () => {
    const state = mockState([mockPiece('a'), mockPiece('b', { locked: true })]);
    const result = validateAction({ action: 'merge_pieces', pieceIdA: 'a', pieceIdB: 'b' } as CopilotAction, state);
    expect(result.valid).toBe(false);
  });

  it('CONTROL: sin candado en ninguna, valida bien', () => {
    const state = mockState([mockPiece('a'), mockPiece('b')]);
    const result = validateAction({ action: 'merge_pieces', pieceIdA: 'a', pieceIdB: 'b' } as CopilotAction, state);
    expect(result.valid).toBe(true);
  });
});
