// #1176 (seguimiento) — el censo adversarial de la PR original encontró que
// `validatePieceAction` (delete_piece, rename_piece, mirror_piece,
// move_piece, rotate_piece, scale_piece, link_pieces, unlink_pieces) es la
// función HERMANA de `validateGeometryAction` en el mismo archivo, y se
// quedó fuera por completo — incluido `delete_piece`, el mismo verbo que
// motivó el issue original.
//
// `create_piece`/`duplicate_piece` no están en esta lista a propósito: crean
// una pieza NUEVA, nunca escriben sobre una existente in-place — mismo
// patrón que `addFacing`/Offset no-replace/polyPenDraw modo-pieza.
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

const ACCIONES: Array<{ nombre: string; accion: (pieceId: string) => CopilotAction }> = [
  { nombre: 'delete_piece', accion: (pieceId) => ({ action: 'delete_piece', pieceId } as CopilotAction) },
  { nombre: 'rename_piece', accion: (pieceId) => ({ action: 'rename_piece', pieceId, name: 'Nuevo nombre' } as CopilotAction) },
  { nombre: 'mirror_piece', accion: (pieceId) => ({ action: 'mirror_piece', pieceId, axis: 'x' } as CopilotAction) },
  { nombre: 'move_piece', accion: (pieceId) => ({ action: 'move_piece', pieceId, position: { x: 10, y: 10 } } as CopilotAction) },
  { nombre: 'rotate_piece', accion: (pieceId) => ({ action: 'rotate_piece', pieceId, angle: 45 } as CopilotAction) },
  { nombre: 'scale_piece', accion: (pieceId) => ({ action: 'scale_piece', pieceId, factor: 1.5 } as CopilotAction) },
  { nombre: 'unlink_pieces', accion: (pieceId) => ({ action: 'unlink_pieces', pieceId } as CopilotAction) },
];

describe('#1176 (seguimiento) — validatePieceAction respeta el candado', () => {
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

describe('#1176 (seguimiento) — link_pieces: cualquiera de las dos piezas basta para rechazar', () => {
  it('rechaza si A está bloqueada', () => {
    const state = mockState([mockPiece('a', { locked: true }), mockPiece('b')]);
    const result = validateAction({ action: 'link_pieces', pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' } as CopilotAction, state);
    expect(result.valid).toBe(false);
  });

  it('rechaza si B está bloqueada', () => {
    const state = mockState([mockPiece('a'), mockPiece('b', { locked: true })]);
    const result = validateAction({ action: 'link_pieces', pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' } as CopilotAction, state);
    expect(result.valid).toBe(false);
  });

  it('CONTROL: sin candado en ninguna, valida bien', () => {
    const state = mockState([mockPiece('a'), mockPiece('b')]);
    const result = validateAction({ action: 'link_pieces', pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' } as CopilotAction, state);
    expect(result.valid).toBe(true);
  });
});

describe('#1176 (seguimiento) — create_piece/duplicate_piece: CONTROL, no necesitan candado', () => {
  it('create_piece no mira candado de nadie (no hay pieza objetivo)', () => {
    const state = mockState([]);
    const result = validateAction({ action: 'create_piece', shape: 'rectangle', params: { width: 10, height: 10 } } as unknown as CopilotAction, state);
    expect(result.valid).toBe(true);
  });

  it('duplicate_piece no mira el candado de la pieza FUENTE (crea una copia, no escribe sobre ella)', () => {
    const state = mockState([mockPiece('p', { locked: true })]);
    const result = validateAction({ action: 'duplicate_piece', pieceId: 'p' } as CopilotAction, state);
    expect(result.valid, 'duplicar debería poder leer una pieza bloqueada como fuente').toBe(true);
  });
});
