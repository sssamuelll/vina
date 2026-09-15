// #1176 (seguimiento) — pieceTools.ts es el CRUD de piezas del sistema
// ToolDefinition, paralelo a patternOpsTools.ts (que sí se guardó en la PR
// original) — mismas ocho operaciones de forma (modifyOutline/modifyPoint/
// deletePiece/renamePiece/scalePiece/movePiece/rotatePiece/mirrorPiece),
// resueltas igual (`state.project.pieces.find(...)`), sin ninguna guardia.
import { describe, it, expect, vi } from 'vitest';
import { tools } from '../pieceTools';
import type { AppDispatch, RootState } from '../../../../../store';
import type { PatternPiece } from '../../../../../types/types';

const outline: PatternPiece['outline'] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
];

function mockPiece(id: string, extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id, outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 10, createdAt: 0, updatedAt: 0,
    ...extra,
  } as PatternPiece;
}

function mockState(pieces: PatternPiece[], layerLocked: Record<number, boolean> = {}): RootState {
  return {
    project: { id: 't', name: 't', pieces, seams: [], fabrics: [], layerLocked },
  } as unknown as RootState;
}

const dispatch = vi.fn() as unknown as AppDispatch;

const HERRAMIENTAS: Array<{ nombre: string; params: (pieceId: string) => Record<string, unknown> }> = [
  { nombre: 'modifyOutline', params: (pieceId) => ({ pieceId, outline }) },
  { nombre: 'modifyPoint', params: (pieceId) => ({ pieceId, pointIndex: 0, x: 5, y: 5 }) },
  { nombre: 'deletePiece', params: (pieceId) => ({ pieceId }) },
  { nombre: 'renamePiece', params: (pieceId) => ({ pieceId, name: 'Nuevo nombre' }) },
  { nombre: 'scalePiece', params: (pieceId) => ({ pieceId, factor: 1.5 }) },
  { nombre: 'movePiece', params: (pieceId) => ({ pieceId, x: 10, y: 10 }) },
  { nombre: 'rotatePiece', params: (pieceId) => ({ pieceId, degrees: 45 }) },
  { nombre: 'mirrorPiece', params: (pieceId) => ({ pieceId, mirrored: true }) },
];

describe('#1176 (seguimiento) — pieceTools respeta el candado', () => {
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
    expect(result.success, `${nombre} rechazó sin haber ningún candado puesto`).toBe(true);
  });
});

describe('#1176 (seguimiento) — createPiece: CONTROL, no necesita candado (crea pieza nueva)', () => {
  it('no mira el candado de nadie — no hay pieza objetivo', async () => {
    const tool = tools.find(t => t.name === 'createPiece')!;
    const state = mockState([]);
    const result = await tool.execute({ name: 'Nueva', outline }, dispatch, () => state);
    expect(result.success).toBe(true);
  });
});
