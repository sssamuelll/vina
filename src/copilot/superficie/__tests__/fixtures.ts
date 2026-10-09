import { vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { InternalLine, PatternPiece, Seam, SemanticEdge } from '../../../types/types';
import type { RootState } from '../../../store';
import { importDXFContent } from '../../../utils/dxf';
import { classifyPiecesGeometric } from '../../../utils/geometricClassifier';
import { detectSemanticEdges } from '../../../utils/semanticEdges';
import { autoSew } from '../../../utils/autoSew';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import projectReducer from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import workflowReducer from '../../../store/workflowSlice';
import { confirmationMiddleware } from '../../../store/confirmationMiddleware';
import { linkedEditingMiddleware } from '../../../store/linkedEditingMiddleware';
import { undoMiddleware } from '../../../store/undoMiddleware';
import { seguirLaRevision } from '../../../store/revisionDelProyecto';
import type { ContextoDeVerbo } from '../tipos';

/** Un rectángulo de 50 mm de alto cuyo lado de arriba son tantos comandos como `xs`. */
export function pieza(id: string, xs: number[], over: Partial<PatternPiece> = {}): PatternPiece {
  const ancho = xs[xs.length - 1];
  return {
    id, name: id, position: { x: 0, y: 0 },
    outline: [
      { type: 'M', values: [0, 0] },
      ...xs.map(x => ({ type: 'L' as const, values: [x, 0] })),
      { type: 'L', values: [ancho, 50] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ],
    edges: [
      { id: `${id}:top`, name: 'top', segmentRange: [1, 1 + xs.length], edgeType: 'seam' },
      { id: `${id}:right`, name: 'right', segmentRange: [1 + xs.length, 2 + xs.length], edgeType: 'seam' },
    ] as SemanticEdge[],
    internals: [], rotation: 0, mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, active: true,
    createdAt: 0, updatedAt: 0, ...over,
  };
}

export function piquete(id: string, x: number): InternalLine {
  return { id, type: 'notch', path: [{ type: 'M', values: [x, 0] }, { type: 'L', values: [x, 6] }] } as InternalLine;
}

export function costura(over: Partial<Seam> = {}): Seam {
  return {
    id: 's1', pieceA: { pieceId: 'a', edgeName: 'top' }, pieceB: { pieceId: 'b', edgeName: 'top' },
    type: 'standard', tension: 1, strength: 1, active: true, taped: false, tapeWidth: 0, ...over,
  };
}

/** Un contexto de verbo sobre un proyecto hecho a mano: los verbos de leer y medir solo leen `getState().project`. */
export function contexto(
  pieces: PatternPiece[],
  seams: Seam[] = [],
  layerLocked: Record<number, boolean> = {},
  seamGroups: unknown[] = [],
): ContextoDeVerbo {
  const estado = { project: { pieces, seams, layerLocked, seamGroups } } as unknown as RootState;
  return { getState: () => estado, dispatch: vi.fn() as unknown as ContextoDeVerbo['dispatch'], origen: 'vina' };
}

/**
 * Una tienda de verdad con lo que toca un verbo de «Actuar»: deshacer, la
 * confirmación de borrados y los vínculos entre piezas. El historial de
 * deshacer es del módulo, así que cada tienda empieza sin pasos.
 */
export function tienda(
  pieces: PatternPiece[] = [],
  seams: Seam[] = [],
  proyecto: Record<string, unknown> = {},
  workflow: Record<string, unknown> = {},
) {
  const inicio = { type: '@@prueba/inicio' };
  const reducer = combineReducers({ project: projectReducer, editor: editorReducer, copilotUI: copilotUIReducer, workflow: workflowReducer });
  type Estado = ReturnType<typeof reducer>;
  const preloadedState: Partial<Estado> = {
    project: { ...projectReducer(undefined, inicio), pieces, seams, ...proyecto } as Estado['project'],
    workflow: { ...workflowReducer(undefined, inicio), ...workflow } as Estado['workflow'],
  };
  const store = configureStore({
    reducer,
    preloadedState,
    middleware: g => g({ serializableCheck: false, immutableCheck: false })
      .concat(confirmationMiddleware, linkedEditingMiddleware, undoMiddleware),
  });
  store.dispatch({ type: 'prueba/historiaNueva', meta: { resetUndoHistory: true } });
  seguirLaRevision(store);
  const ctx: ContextoDeVerbo = {
    getState: () => store.getState() as unknown as RootState,
    dispatch: store.dispatch as unknown as ContextoDeVerbo['dispatch'],
    origen: 'vina',
  };
  return { store, ctx };
}

/** La camisa de María (5 piezas): clasificada, con sus bordes y cosida por autoSew, como en `resewAiSeams.test.ts`. */
export function camisaDeMaria(): { piezas: PatternPiece[]; seams: Seam[] } {
  const dxf = readFileSync(resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf'), 'utf-8');
  const piezas = importDXFContent(dxf, { unit: 'auto', autoDetect: true }).pieces;
  const clases = classifyPiecesGeometric(piezas);
  for (const p of piezas) {
    const c = clases.get(p.id)!;
    if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
    p.edges = detectSemanticEdges(p);
  }
  return { piezas, seams: autoSew(piezas, { minConfidence: 0.3 }).seams.map(s => s.seam) };
}
