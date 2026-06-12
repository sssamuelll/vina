/**
 * M0 — contrato rojo del plan de la camisa de María
 * (docs/plans/2026-06-12-maria-shirt-plan.md).
 *
 * Sondas previas (2026-06-12) sobre el patrón real demostraron que la
 * maquinaria existente NO funciona con CAD real:
 * - `hasCurve` mira el TIPO de comando (C/Q), pero el DXF trae curvas como
 *   polilíneas de L → las ramas neckline/armhole/sleeveCap son código
 *   muerto para todo patrón importado.
 * - La segmentación por flip-de-zona bbox fragmenta arbitrariamente un
 *   outline de 276 micro-comandos.
 * - autoSew, incluso con categorías puestas a mano, propone 2 pares
 *   `edge-0 ↔ edge-0` inertes en vez de la camisa.
 *
 * Los `it.fails` de este archivo son el done de M1: cuando el clasificador
 * geométrico + la segmentación por esquinas existan, se voltean a `it`.
 * Los `it` normales pinean lo que YA funciona (regresión).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importDXFContent } from '../../utils/dxf';
import { detectSemanticEdges } from '../semanticEdges';
import { autoSew } from '../autoSew';
import { detectBodyRegion } from '../cloth/garmentPlacement';
import type { PatternPiece } from '../../types/types';

const FIXTURE = resolve(__dirname, '../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');

function importMaria(): PatternPiece[] {
  const content = readFileSync(FIXTURE, 'utf-8');
  return importDXFContent(content, { unit: 'auto', autoDetect: true }).pieces;
}

/** Las dos piezas bodice del patrón: las 2 más grandes por área de bbox. */
function bboxArea(p: PatternPiece): number {
  const xs: number[] = [], ys: number[] = [];
  for (const c of p.outline) {
    if (c.type === 'M' || c.type === 'L') { xs.push(c.values[0]); ys.push(c.values[1]); }
  }
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

describe('M0 — la camisa de María: contrato del clasificador (M1)', () => {
  // ── TARGET (rojo hasta M1) ──────────────────────────────────────────────

  it('M1 ✓: la clasificación geométrica identifica las 5 piezas sin leer nombres', async () => {
    const { classifyPiecesGeometric } = await import('../geometricClassifier');
    const pieces = importMaria();

    const map = classifyPiecesGeometric(pieces);
    const results = pieces.map(p => ({ p, c: map.get(p.id)! }));
    const byCat = (cat: string) => results.filter(r => r.c.category === cat);

    expect(byCat('bodice')).toHaveLength(2);
    expect(byCat('sleeve')).toHaveLength(2);
    // La tira: banda larga y estrecha (neckband → collar; waistband también honesto)
    expect(results.filter(r => r.c.category === 'collar' || r.c.category === 'waistband')).toHaveLength(1);

    // Front vs back: de los dos bodices, el de escote más profundo es el front.
    const bodices = byCat('bodice');
    expect(new Set(bodices.map(r => r.c.side))).toEqual(new Set(['front', 'back']));
  });

  it('M1 ✓: un bodice real (polilíneas) emite neckline + armhole + 2 hombros + 2 costados', () => {
    const pieces = importMaria();
    const bodice = [...pieces].sort((a, b) => bboxArea(b) - bboxArea(a))[0];
    bodice.category = 'bodice';
    bodice.side = 'front';

    const edges = detectSemanticEdges(bodice);
    const names = edges.map(e => e.name.replace(/-\d+$/, ''));

    // Hoy: hasCurve=false en polilíneas → ni neckline ni armhole; y la pieza
    // COMPLETA (no al doblez) pierde su segundo costado como 'centerFront'.
    expect(names).toContain('neckline');
    expect(names.filter(n => n === 'armhole')).toHaveLength(2);
    expect(names.filter(n => n === 'shoulder')).toHaveLength(2);
    expect(names.filter(n => n === 'sideSeam')).toHaveLength(2);
  });

  it('M1 ✓: una manga real emite sleeveCap con matchHint hacia armhole', () => {
    const pieces = importMaria();
    // Mangas: las dos piezas medianas (ni los 2 bodices más grandes ni la tira)
    const sorted = [...pieces].sort((a, b) => bboxArea(b) - bboxArea(a));
    const sleeve = sorted[2];
    sleeve.category = 'sleeve';

    const edges = detectSemanticEdges(sleeve);
    const cap = edges.find(e => e.name.startsWith('sleeveCap'));
    expect(cap).toBeDefined();
    expect(cap!.matchHint).toContain('armhole');
  });

  it('M1+M3 ✓: autoSew propone la camisa (≥6 costuras anatómicamente correctas)', async () => {
    const { classifyPiecesGeometric } = await import('../geometricClassifier');
    const pieces = importMaria();
    const map = classifyPiecesGeometric(pieces);
    for (const p of pieces) {
      const c = map.get(p.id)!;
      if (c.category !== 'other') {
        p.category = c.category;
        if (c.side) p.side = c.side;
      }
      p.edges = detectSemanticEdges(p);
    }

    const result = autoSew(pieces, { minConfidence: 0.3 });
    expect(result.seams.length).toBeGreaterThanOrEqual(6);

    const pairs = result.seams.map(prop => {
      const s = prop.seam;
      const norm = (id: string, e: string) => `${pieces.find(p => p.id === id)?.category}:${e.replace(/-\d+$/, '')}`;
      return [norm(s.pieceA.pieceId, s.pieceA.edgeName), norm(s.pieceB.pieceId, s.pieceB.edgeName)].sort().join(' ↔ ');
    });

    // La anatomía de una camisa: hombros, costados, sisas↔copas.
    expect(pairs.filter(p => p === 'bodice:shoulder ↔ bodice:shoulder').length).toBeGreaterThanOrEqual(2);
    expect(pairs.filter(p => p === 'bodice:sideSeam ↔ bodice:sideSeam').length).toBeGreaterThanOrEqual(2);
    expect(pairs.filter(p => p === 'bodice:armhole ↔ sleeve:sleeveCap').length).toBeGreaterThanOrEqual(2);
  });

  // ── REGRESIÓN (verde hoy — esto NO debe romperse en M1) ─────────────────

  it('con categorías, detectBodyRegion coloca anatómicamente (la base de M2)', () => {
    const pieces = importMaria();
    const sorted = [...pieces].sort((a, b) => bboxArea(b) - bboxArea(a));
    sorted[0].category = 'bodice'; sorted[0].side = 'front';
    sorted[1].category = 'bodice'; sorted[1].side = 'back';
    sorted[2].category = 'sleeve';
    sorted[3].category = 'sleeve';
    sorted[4].category = 'waistband';

    expect(detectBodyRegion(sorted[0])).toBe('front-torso');
    expect(detectBodyRegion(sorted[1])).toBe('back-torso');
    expect(['left-sleeve', 'right-sleeve']).toContain(detectBodyRegion(sorted[2]));
    expect(['left-sleeve', 'right-sleeve']).toContain(detectBodyRegion(sorted[3]));
    expect(detectBodyRegion(sorted[4])).toBe('waistband');
  });

  it('el import del patrón real produce 5 piezas con outlines densos de polilíneas', () => {
    const pieces = importMaria();
    expect(pieces).toHaveLength(5);
    // La realidad del CAD: curvas como L commands (NO hay C/Q) — el contrato
    // que rompió hasCurve. Si un futuro import emite Béziers, este pin avisa.
    for (const p of pieces) {
      expect(p.outline.some(c => c.type === 'C' || c.type === 'Q')).toBe(false);
    }
    expect(pieces.filter(p => p.outline.length > 100)).toHaveLength(4);
  });
});

// ─── M2: colocación anatómica + cable arrange→solver ─────────────────────────

describe('M2 — applyArrangementOverrides (el cable arrange→solver)', () => {
  it('reemplaza solo la POSICIÓN de las piezas arrastradas; rotación y resto intactos', async () => {
    const { applyArrangementOverrides, placeGarmentPieces } = await import('../cloth/garmentPlacement');
    const pieces = importMaria();
    const { classifyPiecesGeometric } = await import('../geometricClassifier');
    const map = classifyPiecesGeometric(pieces);
    for (const p of pieces) {
      const c = map.get(p.id)!;
      if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
    }

    const measurements = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 };
    const placements = placeGarmentPieces(pieces, measurements);

    const dragged = pieces[2].id;
    const overridden = applyArrangementOverrides(placements, pieces, {
      [dragged]: [1.5, 1.2, 0.3],
    });

    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i].id === dragged) {
        expect(overridden[i].position).toEqual([1.5, 1.2, 0.3]);
        expect(overridden[i].rotation).toEqual(placements[i].rotation);
      } else {
        expect(overridden[i]).toBe(placements[i]);
      }
    }
    // Sin overrides: identidad (mismo array, cero coste).
    expect(applyArrangementOverrides(placements, pieces, undefined)).toBe(placements);
    expect(applyArrangementOverrides(placements, pieces, {})).toBe(placements);
  });

  it('M1+M2: con categorías del import, la camisa colocada por defecto separa delantero (+Z) y espalda (−Z)', async () => {
    const { placeGarmentPieces, detectBodyRegion } = await import('../cloth/garmentPlacement');
    const { classifyPiecesGeometric } = await import('../geometricClassifier');
    const pieces = importMaria();
    const map = classifyPiecesGeometric(pieces);
    for (const p of pieces) {
      const c = map.get(p.id)!;
      if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
    }

    const measurements = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 };
    const placements = placeGarmentPieces(pieces, measurements);
    const regions = pieces.map(p => detectBodyRegion(p));

    type Region = (typeof regions)[number];
    const zOf = (region: Region) => placements[regions.indexOf(region)].position[2];
    const xOf = (region: Region) => placements[regions.indexOf(region)].position[0];

    // El blob nacía de 5 piezas apiladas al frente — ahora: anatomía.
    expect(zOf('front-torso')).toBeGreaterThan(0.1);
    expect(zOf('back-torso')).toBeLessThan(-0.1);
    expect(xOf('left-sleeve')).toBeLessThan(-0.2);
    expect(xOf('right-sleeve')).toBeGreaterThan(0.2);
    expect(regions).toContain('collar'); // la tira = neckband
  });
});

// ─── M3: el trigger de usuario cose la camisa de verdad ─────────────────────

describe('M3 — runAutoSew (thunk del comando ⌘K "Auto-Sew Pieces")', () => {
  it('sobre el patrón clasificado de María: ≥6 costuras con provenance ai, sin duplicar en re-ejecución', async () => {
    const { configureStore } = await import('@reduxjs/toolkit');
    const projectReducer = (await import('../../store/projectSlice')).default;
    const copilotUIReducer = (await import('../../store/copilotUISlice')).default;
    const { runAutoSew } = await import('../../store/autoSewThunk');
    const { classifyPiecesGeometric } = await import('../geometricClassifier');
    const { detectSemanticEdges } = await import('../semanticEdges');

    const pieces = importMaria();
    const map = classifyPiecesGeometric(pieces);
    for (const p of pieces) {
      const c = map.get(p.id)!;
      if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
      p.edges = detectSemanticEdges(p);
    }

    const store = configureStore({
      reducer: { project: projectReducer, copilotUI: copilotUIReducer },
    });
    for (const p of pieces) store.dispatch({ type: 'project/addPiece', payload: p });

    const result = store.dispatch(runAutoSew(0.3) as never) as unknown as { added: number };
    expect(result.added).toBeGreaterThanOrEqual(6);

    const seams = (store.getState() as { project: { seams: Array<{ createdBy?: string }> } }).project.seams;
    expect(seams.length).toBe(result.added);
    // Provenance ai → ámbar "review me" en el 3D (doctrina del flujo de vestido).
    expect(seams.every(s => s.createdBy === 'ai')).toBe(true);

    // Re-ejecutar es idempotente (dedupe contra existentes) y lo dice.
    const again = store.dispatch(runAutoSew(0.3) as never) as unknown as { added: number };
    expect(again.added).toBe(0);
    expect(seams.length).toBe(result.added);
  });
});
