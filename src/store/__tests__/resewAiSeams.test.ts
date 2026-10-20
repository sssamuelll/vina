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
 *
 * Abajo, runAutoSew sobre la camisa de María: la puerta por la que la app
 * cose (menú del logo / ⌘K), con su pose mundo de verdad (2026-10-06).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addSeam, restoreProject } from '../projectSlice';
import { undoMiddleware } from '../undoMiddleware';
import { resewAiSeams, runAutoSew } from '../autoSewThunk';
import { SEAM_ENGINE_VERSION, isStaleAiSeam } from '../../utils/autoSew';
import { esMediaDeCollar, esMitadDeCopa } from '../../utils/autoSew/repartoDeCopa';
import { largosDeCostura } from '../../utils/seam/largoCosido';
import { SEAM_MISMATCH_THRESHOLD_MM } from '../../components/PatternEditor/renderers/seamVisuals';
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

  it("'Re-coser' es UN solo paso de undo — un Ctrl+Z devuelve el estado original completo", () => {
    // Bug #934 review: sin batchUndo, undoMiddleware snapshotea removeSeam×N y
    // addSeam×M por separado → un solo Ctrl+Z aterrizaba en el intermedio
    // "todas las IA borradas, ninguna re-añadida" (la prenda se desarma).
    const pieces = importMariaClassified();
    const stale = staleSeam(pieces);
    const human = humanSeam(pieces);
    const store = configureStore({
      reducer: { project: projectReducer },
      middleware: (gdm) => gdm({ serializableCheck: false }).concat(undoMiddleware),
    });
    store.dispatch(restoreProject({
      ...store.getState().project,
      pieces,
      seams: [],
      createdAt: 0,
      updatedAt: 0,
    }));
    for (const s of [stale, human]) store.dispatch(addSeam(s));
    const before = store.getState().project.seams;

    resewAiSeams()(store.dispatch as never, store.getState as never);
    expect(store.getState().project.seams.some(isStaleAiSeam)).toBe(false); // sanity: re-cosió

    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.seams).toEqual(before);
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

/** Lo que dejaba el motor 1: cada copa partida en t = 0,5 (físico) y todo con sewEngine 1. */
function comoElMotor1(seams: Seam[]): Seam[] {
  return seams.map(s => {
    const v1: Seam = { ...s, sewEngine: 1 };
    if (!esMitadDeCopa(s)) return v1;
    const lado = /^sleevecap/i.test(s.pieceA.edgeName) ? 'pieceA' : 'pieceB';
    // Un B invertido guarda su rango en sentido de cosido (seamRange.ts).
    const espejo = lado === 'pieceB' && s.pieceB.reversed === true;
    const empiezaEnCero = espejo ? (s[lado].tEnd ?? 1) > 1 - 1e-9 : (s[lado].tStart ?? 0) < 1e-9;
    const fisico: [number, number] = empiezaEnCero ? [0, 0.5] : [0.5, 1];
    const [tStart, tEnd] = espejo ? [1 - fisico[1], 1 - fisico[0]] : fisico;
    return { ...v1, [lado]: { ...s[lado], tStart, tEnd } };
  });
}

const aMenosDeUnMm = (seams: Seam[], pieces: PatternPiece[]) => {
  for (const s of seams) {
    const { a, b } = largosDeCostura(s, pieces);
    expect(Math.abs(a! - b!), `${s.pieceA.edgeName} ↔ ${s.pieceB.edgeName}: ${a} contra ${b} mm`)
      .toBeLessThan(SEAM_MISMATCH_THRESHOLD_MM);
  }
};

describe('runAutoSew — la camisa de María por la puerta de la app', () => {
  it('las cuatro mitades de copa quedan a menos de 1 mm de su sisa: el lienzo no las marca con «⚠»', () => {
    const store = makeStore(importMariaClassified(), []);
    runAutoSew()(store.dispatch as never, store.getState as never);
    const { seams, pieces } = store.getState().project;
    const copas = seams.filter(esMitadDeCopa);
    expect(copas).toHaveLength(4);
    aMenosDeUnMm(copas, pieces);
  });
});

describe('los motores 2 y 3 solo cambiaron la copa partida y las medias de cuello', () => {
  const ia = (over: Partial<Seam> = {}): Seam => ({
    id: 'auto-seam-1-0', type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
    createdBy: 'ai',
    pieceA: { pieceId: 'del', edgeName: 'sideSeam', tStart: 0, tEnd: 1 },
    pieceB: { pieceId: 'esp', edgeName: 'sideSeam', tStart: 0, tEnd: 1 },
    ...over,
  });
  const sisa = { pieceId: 'del', edgeName: 'armhole', tStart: 0, tEnd: 1 };

  it('del motor 1, están viejas las mitades de copa y las medias de cuello: un costado o una copa entera siguen vigentes', () => {
    expect(isStaleAiSeam(ia({ sewEngine: 1 }))).toBe(false);
    expect(isStaleAiSeam(ia({ sewEngine: 1, pieceA: sisa, pieceB: { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0, tEnd: 1 } }))).toBe(false);
    expect(isStaleAiSeam(ia({ sewEngine: 1, pieceA: sisa, pieceB: { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0, tEnd: 0.5, reversed: true } }))).toBe(true);
    expect(isStaleAiSeam(ia({ sewEngine: 1, pieceA: { pieceId: 'del', edgeName: 'neckline', tStart: 0, tEnd: 0.5 }, pieceB: { pieceId: 'tira', edgeName: 'collarNeckEdge', tStart: 0, tEnd: 0.578 } }))).toBe(true);
  });

  it('todo el motor 0 está viejo; lo del motor actual y lo humano, nunca', () => {
    expect(isStaleAiSeam(ia())).toBe(true);
    expect(isStaleAiSeam(ia({ sewEngine: SEAM_ENGINE_VERSION, pieceA: sisa, pieceB: { pieceId: 'manga', edgeName: 'sleeveCap', tStart: 0, tEnd: 0.5 } }))).toBe(false);
    expect(isStaleAiSeam({ ...ia(), id: 'e2f1a3b4-humana', createdBy: undefined })).toBe(false);
  });

  it('lo que cose el agente no es del motor: no está viejo y «Re-coser» no lo toca', () => {
    expect(isStaleAiSeam({ ...ia(), id: '3f6c1d2e-agente', sewEngine: undefined })).toBe(false);
  });

  it('en un proyecto del motor 1, «Re-coser» rehace solo las cuatro mitades de copa (cortadas por sus sisas) y las cuatro medias de cuello', () => {
    const pieces = importMariaClassified();
    const cosida = makeStore(pieces, []);
    runAutoSew()(cosida.dispatch as never, cosida.getState as never);
    const delMotor1 = comoElMotor1(cosida.getState().project.seams);
    const store = makeStore(pieces, delMotor1);
    // Cuatro de copa (las dejó viejas el motor 2) y cuatro de cuello (las dejó viejas el motor 3, #1250 C2).
    expect(store.getState().project.seams.filter(isStaleAiSeam)).toHaveLength(8);

    const result = resewAiSeams()(store.dispatch as never, store.getState as never);

    expect(result.removed).toBe(8);
    const { seams, pieces: enStore } = store.getState().project;
    // Lo demás del motor 1 se queda como estaba, con su id.
    for (const s of delMotor1.filter(x => !esMitadDeCopa(x) && !esMediaDeCollar(x))) {
      expect(seams.some(x => x.id === s.id), `se rehízo ${s.pieceA.edgeName} ↔ ${s.pieceB.edgeName}`).toBe(true);
    }
    const copas = seams.filter(esMitadDeCopa);
    expect(copas).toHaveLength(4);
    aMenosDeUnMm(copas, enStore);
    expect(seams.filter(esMediaDeCollar)).toHaveLength(4);
    expect(seams.some(isStaleAiSeam)).toBe(false);
  });
});
