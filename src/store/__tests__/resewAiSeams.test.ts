/**
 * resewAiSeams — el botón "Re-coser" del toast de restauración (staleness de
 * costuras IA, SEAM_ENGINE_VERSION).
 *
 * El bug que motiva el thunk: el autoSew generativo solo corre con seams
 * vacías, y el dedupe de runAutoSew (samePair, que IGNORA tStart/tEnd)
 * bloquea las mitades split nuevas contra la costura entera vieja del mismo
 * par — un proyecto pre-#933 arrastraba el drape "chaleco + brazaletes"
 * para siempre, con ⌘K Auto-Sew reportando "ya existen".
 *
 * Orden crítico bajo test: proponer PRIMERO (0 propuestas → no borrar nada),
 * borrar stale, añadir dedupando SOLO contra supervivientes humanas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addSeam, restoreProject } from '../projectSlice';
import { resewAiSeams } from '../autoSewThunk';
import { SEAM_ENGINE_VERSION, isStaleAiSeam } from '../../utils/autoSew';
import { importDXFContent } from '../../utils/dxf';
import { classifyPiecesGeometric } from '../../utils/geometricClassifier';
import { detectSemanticEdges } from '../../utils/semanticEdges';
import type { PatternPiece, Seam } from '../../types/types';

const FIXTURE = resolve(__dirname, '../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');

function importMariaClassified(): PatternPiece[] {
  const pieces = importDXFContent(readFileSync(FIXTURE, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
  const map = classifyPiecesGeometric(pieces);
  for (const p of pieces) {
    const c = map.get(p.id)!;
    if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
    p.edges = detectSemanticEdges(p);
  }
  return pieces;
}

function makeStore(pieces: PatternPiece[], seams: Seam[]) {
  const store = configureStore({
    reducer: { project: projectReducer },
    middleware: (gdm) => gdm({ serializableCheck: false }),
  });
  store.dispatch(restoreProject({
    ...store.getState().project,
    pieces,
    seams: [],
    createdAt: 0,
    updatedAt: 0,
  }));
  for (const s of seams) store.dispatch(addSeam(s));
  return store;
}

const staleSeam = (pieces: PatternPiece[]): Seam => {
  const sleeve = pieces.find(p => p.category === 'sleeve')!;
  const front = pieces.find(p => p.category === 'bodice' && p.side === 'front')!;
  return {
    // Costura IA vieja (pre-#933): cap entero ↔ un solo armhole, sin sewEngine.
    id: 'auto-seam-999-0',
    pieceA: { pieceId: front.id, edgeName: 'armhole', tStart: 0, tEnd: 1 },
    pieceB: { pieceId: sleeve.id, edgeName: 'sleeveCap', tStart: 0, tEnd: 1 },
    type: 'standard', tension: 100, strength: 1, active: true, taped: false,
    tapeWidth: 10, createdBy: 'ai',
  };
};

const humanSeam = (pieces: PatternPiece[]): Seam => {
  const front = pieces.find(p => p.category === 'bodice' && p.side === 'front')!;
  const back = pieces.find(p => p.category === 'bodice' && p.side === 'back')!;
  return {
    // Costura manual (newId-style, sin createdBy) — intocable.
    id: 'e2f1a3b4-human',
    pieceA: { pieceId: front.id, edgeName: 'shoulder', tStart: 0, tEnd: 1 },
    pieceB: { pieceId: back.id, edgeName: 'shoulder', tStart: 0, tEnd: 1 },
    type: 'standard', tension: 100, strength: 1, active: true, taped: false,
    tapeWidth: 10,
  };
};

describe('resewAiSeams', () => {
  it('reemplaza las seams IA stale por propuestas frescas versionadas; las humanas quedan intactas', () => {
    const pieces = importMariaClassified();
    const stale = staleSeam(pieces);
    const human = humanSeam(pieces);
    const store = makeStore(pieces, [stale, human]);
    expect(store.getState().project.seams.some(isStaleAiSeam)).toBe(true);

    const result = resewAiSeams()(
      store.dispatch as never,
      store.getState as never,
    );

    const seams = store.getState().project.seams;
    // La stale se fue.
    expect(seams.some(s => s.id === stale.id)).toBe(false);
    expect(result.removed).toBe(1);
    // La humana sobrevive tal cual.
    expect(seams.some(s => s.id === human.id)).toBe(true);
    // Las nuevas vienen versionadas con el motor actual — nada queda stale.
    const ai = seams.filter(s => s.createdBy === 'ai');
    expect(ai.length).toBeGreaterThanOrEqual(6);
    for (const s of ai) expect(s.sewEngine).toBe(SEAM_ENGINE_VERSION);
    expect(seams.some(isStaleAiSeam)).toBe(false);
    // El split de sisa entra (lo que el dedupe de runAutoSew bloqueaba): el
    // par armhole↔sleeveCap ahora existe con RANGOS parciales.
    const sisaHalves = seams.filter(s =>
      [s.pieceA.edgeName, s.pieceB.edgeName].some(n => /^sleeveCap/i.test(n))
      && [s.pieceA, s.pieceB].some(h => (h.tStart ?? 0) !== 0 || (h.tEnd ?? 1) !== 1));
    expect(sisaHalves.length).toBeGreaterThanOrEqual(4);
  });

  it('si el motor no propone nada, NO borra las stale (orden crítico: proponer primero)', () => {
    // Una sola pieza activa → autoSew sale por el guard (<2 piezas): cero
    // propuestas garantizadas (limpiar p.edges no basta — extrae frescos).
    const pieces = importMariaClassified();
    const single = [pieces.find(p => p.category === 'bodice' && p.side === 'front')!];
    const stale = staleSeam(pieces);
    const store = makeStore(single, [stale]);

    const result = resewAiSeams()(
      store.dispatch as never,
      store.getState as never,
    );

    expect(result.removed).toBe(0);
    expect(result.added).toBe(0);
    expect(store.getState().project.seams.some(s => s.id === stale.id)).toBe(true);
  });
});
